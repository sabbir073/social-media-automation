import { openAsBlob } from "node:fs";
import { env } from "../env";
import {
  type AccountCtx,
  type ConnectedAccount,
  type Draft,
  type Provider,
  ProviderError,
  type PublishInput,
  readJson,
  sleep,
  type TokenUpdate,
} from "./types";

const SCOPES = ["boards:read", "pins:read", "pins:write", "user_accounts:read"];
const api = () => `${env.pinterest.apiBase}/v5`;

async function call(url: string, init?: RequestInit): Promise<any> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(120_000) });
  } catch (e) {
    throw new ProviderError(`Network error talking to Pinterest: ${(e as Error).message}`, { retryable: true });
  }
  const json = await readJson(res);
  if (!res.ok) {
    throw new ProviderError(json.message || json.error_description || `Pinterest API error (HTTP ${res.status})`, {
      reauth: res.status === 401,
      retryable: res.status >= 500 || res.status === 429,
    });
  }
  return json;
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

async function tokenRequest(params: Record<string, string>) {
  const basic = Buffer.from(`${env.pinterest.appId}:${env.pinterest.appSecret}`).toString("base64");
  return call(`${api()}/oauth/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
}

export type Board = { id: string; name: string };

export async function listBoards(accessToken: string): Promise<Board[]> {
  const boards: Board[] = [];
  let bookmark: string | undefined;
  do {
    const q = new URLSearchParams({ page_size: "100", ...(bookmark ? { bookmark } : {}) });
    const page = await call(`${api()}/boards?${q}`, { headers: bearer(accessToken) });
    for (const b of page.items ?? []) boards.push({ id: b.id, name: b.name });
    bookmark = page.bookmark || undefined;
  } while (bookmark && boards.length < 500);
  return boards;
}

async function uploadVideo(token: string, path: string, mime: string): Promise<string> {
  const reg = await call(`${api()}/media`, {
    method: "POST",
    headers: { ...bearer(token), "Content-Type": "application/json" },
    body: JSON.stringify({ media_type: "video" }),
  });
  const form = new FormData();
  for (const [k, v] of Object.entries(reg.upload_parameters ?? {})) form.append(k, String(v));
  form.append("file", await openAsBlob(path, { type: mime }));
  let up: Response;
  try {
    up = await fetch(reg.upload_url, { method: "POST", body: form, signal: AbortSignal.timeout(600_000) });
  } catch (e) {
    throw new ProviderError(`Upload to Pinterest interrupted: ${(e as Error).message}`, { retryable: true });
  }
  if (!up.ok) throw new ProviderError(`Pinterest rejected the video upload (HTTP ${up.status})`, { retryable: up.status >= 500 });
  for (let i = 0; i < 90; i++) {
    const s = await call(`${api()}/media/${reg.media_id}`, { headers: bearer(token) });
    if (s.status === "succeeded") return reg.media_id;
    if (s.status === "failed") throw new ProviderError("Pinterest could not process the video");
    await sleep(5000);
  }
  throw new ProviderError("Pinterest took too long to process the video", { retryable: true });
}

export const pinterest: Provider = {
  platform: "PINTEREST",
  label: "Pinterest",
  hint: "Each Pin goes to one board, so pick a board when you schedule.",
  isConfigured: () => Boolean(env.pinterest.appId && env.pinterest.appSecret),

  authUrl(state, redirectUri) {
    const q = new URLSearchParams({
      client_id: env.pinterest.appId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: SCOPES.join(","),
      state,
    });
    return `https://www.pinterest.com/oauth/?${q}`;
  },

  async connect(code, redirectUri): Promise<ConnectedAccount[]> {
    const t = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
    const me = await call(`${api()}/user_account`, { headers: bearer(t.access_token) });
    return [
      {
        externalId: String(me.id ?? me.username),
        name: me.business_name || me.username,
        username: me.username,
        avatarUrl: me.profile_image,
        accessToken: t.access_token,
        refreshToken: t.refresh_token,
        expiresAt: new Date(Date.now() + (t.expires_in ?? 2_592_000) * 1000),
        scopes: t.scope ?? SCOPES.join(","),
      },
    ];
  },

  async refresh(refreshToken): Promise<TokenUpdate> {
    const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
    return {
      accessToken: t.access_token,
      refreshToken: t.refresh_token || undefined,
      expiresAt: new Date(Date.now() + (t.expires_in ?? 2_592_000) * 1000),
    };
  },

  async check(a) {
    await call(`${api()}/user_account`, { headers: bearer(a.accessToken) });
  },

  validate(d: Draft) {
    const errors: string[] = [];
    if (d.media.length !== 1) errors.push("A Pin needs exactly one image or video.");
    if (!d.options.boardId) errors.push("Choose a Pinterest board.");
    if (d.title.length > 100) errors.push("Pin titles are limited to 100 characters.");
    if (d.caption.length > 800) errors.push("Pin descriptions are limited to 800 characters.");
    return errors;
  },

  async publish(a: AccountCtx, input: PublishInput) {
    const m = input.media[0];
    const media_source =
      m.kind === "VIDEO"
        ? {
            source_type: "video_id",
            media_id: await uploadVideo(a.accessToken, m.path, m.mime),
            cover_image_key_frame_time: 1,
          }
        : { source_type: "image_url", url: m.url };
    const pin = await call(`${api()}/pins`, {
      method: "POST",
      headers: { ...bearer(a.accessToken), "Content-Type": "application/json" },
      body: JSON.stringify({
        board_id: String(input.options.boardId),
        ...(input.title ? { title: input.title } : {}),
        ...(input.caption ? { description: input.caption } : {}),
        ...(input.link ? { link: input.link } : {}),
        media_source,
      }),
    });
    return { externalId: pin.id, url: `https://www.pinterest.com/pin/${pin.id}/` };
  },
};
