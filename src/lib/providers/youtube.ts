import { open } from "node:fs/promises";
import { env } from "../env";
import {
  type AccountCtx,
  type ConnectedAccount,
  type Draft,
  type Metrics,
  type Provider,
  ProviderError,
  type PublishInput,
  readJson,
  type TokenUpdate,
} from "./types";

const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
];
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CHUNK = 8 * 1024 * 1024; // must be a multiple of 256 KB

function fail(res: Response, json: any): never {
  const err = json.error ?? {};
  const reason = err.errors?.[0]?.reason ?? err.status ?? "";
  const msg = (typeof err === "string" ? json.error_description || err : err.message) || `YouTube API error (HTTP ${res.status})`;
  throw new ProviderError(`${msg}${reason ? ` (${reason})` : ""}`, {
    reauth: res.status === 401 || err === "invalid_grant" || reason === "authError",
    retryable: res.status >= 500 || res.status === 429 || reason === "rateLimitExceeded",
  });
}

async function call(url: string, init?: RequestInit): Promise<any> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(120_000) });
  } catch (e) {
    throw new ProviderError(`Network error talking to Google: ${(e as Error).message}`, { retryable: true });
  }
  const json = await readJson(res);
  if (!res.ok) fail(res, json);
  return json;
}

async function tokenRequest(params: Record<string, string>) {
  return call(TOKEN_URL, {
    method: "POST",
    body: new URLSearchParams({
      client_id: env.google.clientId,
      client_secret: env.google.clientSecret,
      ...params,
    }),
  });
}

export const youtube: Provider = {
  platform: "YOUTUBE",
  label: "YouTube",
  hint: "Connect the Google account that owns the channel. One video per post, with a title.",
  isConfigured: () => Boolean(env.google.clientId && env.google.clientSecret),

  authUrl(state, redirectUri) {
    const q = new URLSearchParams({
      client_id: env.google.clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: SCOPES.join(" "),
      access_type: "offline",
      prompt: "consent", // guarantees a refresh token on every connect
      include_granted_scopes: "true",
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
  },

  async connect(code, redirectUri): Promise<ConnectedAccount[]> {
    const t = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
    if (!t.refresh_token) {
      throw new ProviderError("Google did not return a refresh token. Remove the app at myaccount.google.com/permissions and connect again.");
    }
    const ch = await call("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
      headers: { Authorization: `Bearer ${t.access_token}` },
    });
    return (ch.items ?? []).map((c: any) => ({
      externalId: c.id,
      name: c.snippet?.title ?? "YouTube channel",
      username: c.snippet?.customUrl,
      avatarUrl: c.snippet?.thumbnails?.default?.url,
      accessToken: t.access_token,
      refreshToken: t.refresh_token,
      expiresAt: new Date(Date.now() + (t.expires_in ?? 3600) * 1000),
      scopes: t.scope ?? SCOPES.join(" "),
    }));
  },

  async refresh(refreshToken): Promise<TokenUpdate> {
    const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
    return { accessToken: t.access_token, expiresAt: new Date(Date.now() + (t.expires_in ?? 3600) * 1000) };
  },

  async check(a) {
    const ch = await call("https://www.googleapis.com/youtube/v3/channels?part=id&mine=true", {
      headers: { Authorization: `Bearer ${a.accessToken}` },
    });
    if (!(ch.items ?? []).some((c: any) => c.id === a.externalId)) {
      throw new ProviderError("This Google account no longer has access to the channel", { reauth: true });
    }
  },

  validate(d: Draft) {
    const errors: string[] = [];
    if (d.media.length !== 1 || d.media[0].kind !== "VIDEO") errors.push("YouTube needs exactly one video.");
    if (!d.title.trim()) errors.push("YouTube needs a title.");
    if (d.title.length > 100) errors.push("YouTube titles are limited to 100 characters.");
    if (d.caption.length > 5000) errors.push("YouTube descriptions are limited to 5,000 characters.");
    return errors;
  },

  async publish(a: AccountCtx, input: PublishInput) {
    const video = input.media[0];
    const privacy = ["public", "unlisted", "private"].includes(String(input.options.privacy))
      ? String(input.options.privacy)
      : "public";
    const tags = String(input.options.tags ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const description = input.link ? `${input.caption}\n\n${input.link}`.trim() : input.caption;
    const metadata = {
      snippet: { title: input.title, description, categoryId: String(input.options.categoryId ?? "22"), ...(tags.length ? { tags } : {}) },
      status: { privacyStatus: privacy, selfDeclaredMadeForKids: input.options.madeForKids === true },
    };

    // 1. Open a resumable upload session.
    let init: Response;
    try {
      init = await fetch(
        "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${a.accessToken}`,
            "Content-Type": "application/json; charset=UTF-8",
            "X-Upload-Content-Type": video.mime,
            "X-Upload-Content-Length": String(video.size),
          },
          body: JSON.stringify(metadata),
          signal: AbortSignal.timeout(60_000),
        },
      );
    } catch (e) {
      throw new ProviderError(`Network error talking to Google: ${(e as Error).message}`, { retryable: true });
    }
    if (!init.ok) fail(init, await readJson(init));
    const session = init.headers.get("location");
    if (!session) throw new ProviderError("YouTube did not return an upload session", { retryable: true });

    // 2. Send the file in chunks so large videos never sit in memory.
    const fh = await open(video.path, "r");
    try {
      let offset = 0;
      while (offset < video.size) {
        const length = Math.min(CHUNK, video.size - offset);
        const buf = Buffer.alloc(length);
        await fh.read(buf, 0, length, offset);
        let res: Response;
        try {
          res = await fetch(session, {
            method: "PUT",
            headers: {
              "Content-Length": String(length),
              "Content-Range": `bytes ${offset}-${offset + length - 1}/${video.size}`,
            },
            body: buf,
            signal: AbortSignal.timeout(300_000),
          });
        } catch (e) {
          throw new ProviderError(`Upload to YouTube interrupted: ${(e as Error).message}`, { retryable: true });
        }
        if (res.status === 308) {
          const range = res.headers.get("range"); // "bytes=0-N"
          offset = range ? Number(range.split("-")[1]) + 1 : offset + length;
          continue;
        }
        const json = await readJson(res);
        if (!res.ok) fail(res, json);
        return { externalId: json.id, url: `https://www.youtube.com/watch?v=${json.id}` };
      }
    } finally {
      await fh.close();
    }
    throw new ProviderError("YouTube upload ended without a response", { retryable: true });
  },

  async metrics(a, id): Promise<Metrics> {
    const r = await call(`https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${a.accessToken}` },
    });
    const s = r.items?.[0]?.statistics ?? {};
    return { views: Number(s.viewCount ?? 0), likes: Number(s.likeCount ?? 0), comments: Number(s.commentCount ?? 0) };
  },
};
