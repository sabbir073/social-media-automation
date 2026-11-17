/**
 * Networks that connect with a token the user pastes in, so they need no developer app and
 * no platform review: Bluesky (app password), Telegram (bot token) and Mastodon (access token).
 */
import { openAsBlob } from "node:fs";
import sharp from "sharp";
import { assertPublicUrl } from "../ssrf";
import {
  type AccountCtx,
  type ConnectedAccount,
  type Draft,
  type Metrics,
  type Provider,
  ProviderError,
  type PublishInput,
  readJson,
  sleep,
} from "./types";

async function request(label: string, url: string, init?: RequestInit): Promise<any> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(180_000) });
  } catch (e) {
    throw new ProviderError(`Network error talking to ${label}: ${(e as Error).message}`, { retryable: true });
  }
  const json = await readJson(res);
  if (!res.ok || json.ok === false) {
    const msg = json.message || json.description || json.error_description || (typeof json.error === "string" ? json.error : "") || `${label} error (HTTP ${res.status})`;
    throw new ProviderError(msg, {
      reauth: res.status === 401 || /ExpiredToken|InvalidToken|AuthenticationRequired|AccountTakedown/i.test(String(json.error)),
      retryable: res.status >= 500 || res.status === 429,
    });
  }
  return json;
}

const withLink = (caption: string, link: string) => (link && !caption.includes(link) ? `${caption}\n\n${link}`.trim() : caption);
const graphemes = (s: string) => [...new Intl.Segmenter().segment(s)].length;

// ---------------------------------------------------------------- Bluesky

const BSKY = "https://bsky.social/xrpc";

async function bskySession(identifier: string, password: string) {
  return request("Bluesky", `${BSKY}/com.atproto.server.createSession`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password }),
  });
}

/** Link and hashtag annotations. Bluesky addresses text by UTF-8 byte offsets. */
export function bskyFacets(text: string) {
  const facets: object[] = [];
  const bytes = (s: string) => Buffer.byteLength(s, "utf8");
  for (const m of text.matchAll(/https?:\/\/[^\s]+[^\s.,!?)\]]/g)) {
    const byteStart = bytes(text.slice(0, m.index));
    facets.push({ index: { byteStart, byteEnd: byteStart + bytes(m[0]) }, features: [{ $type: "app.bsky.richtext.facet#link", uri: m[0] }] });
  }
  for (const m of text.matchAll(/(^|\s)#([\p{L}\p{M}\p{N}_]{1,64})/gu)) {
    const start = m.index + m[1].length;
    const byteStart = bytes(text.slice(0, start));
    facets.push({ index: { byteStart, byteEnd: byteStart + bytes(`#${m[2]}`) }, features: [{ $type: "app.bsky.richtext.facet#tag", tag: m[2] }] });
  }
  return facets;
}

/** Bluesky rejects image blobs over about 1 MB, so re-encode until the file fits. */
async function bskyImage(path: string): Promise<Buffer> {
  for (const [size, quality] of [[2000, 85], [1600, 80], [1200, 75], [1000, 65]] as const) {
    const buf = await sharp(path).rotate().resize({ width: size, height: size, fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality }).toBuffer();
    if (buf.length <= 950_000) return buf;
  }
  throw new ProviderError("This image is too large for Bluesky even after compression");
}

export const bluesky: Provider = {
  platform: "BLUESKY",
  label: "Bluesky",
  hint: "Connects with an app password. No approval needed.",
  isConfigured: () => true,
  credentialFields: [
    { name: "handle", label: "Handle", placeholder: "yourname.bsky.social" },
    { name: "password", label: "App password", secret: true, placeholder: "xxxx-xxxx-xxxx-xxxx", help: "Create one in Bluesky under Settings → Privacy and security → App passwords. Do not use your main password." },
  ],

  async connectWithCredentials(v): Promise<ConnectedAccount[]> {
    const handle = v.handle.trim().replace(/^@/, "");
    const s = await bskySession(handle, v.password.trim());
    const profile = await request("Bluesky", `${BSKY}/app.bsky.actor.getProfile?actor=${encodeURIComponent(s.did)}`, {
      headers: { Authorization: `Bearer ${s.accessJwt}` },
    }).catch(() => ({}));
    return [{ externalId: s.did, name: profile.displayName || s.handle, username: s.handle, avatarUrl: profile.avatar, accessToken: v.password.trim(), meta: { handle: s.handle } }];
  },

  async check(a) {
    await bskySession(a.externalId, a.accessToken);
  },

  validate(d: Draft) {
    const errors: string[] = [];
    if (d.media.some((m) => m.kind === "VIDEO")) errors.push("Video is not supported for Bluesky yet; use images.");
    if (d.media.length > 4) errors.push("Bluesky allows at most 4 images.");
    if (!d.caption.trim() && d.media.length === 0) errors.push("Add text or an image.");
    if (graphemes(withLink(d.caption, d.media.length ? d.link : "")) > 300) errors.push("Bluesky posts are limited to 300 characters.");
    return errors;
  },

  async publish(a: AccountCtx, input: PublishInput) {
    const s = await bskySession(a.externalId, a.accessToken);
    const auth = { Authorization: `Bearer ${s.accessJwt}` };
    const text = withLink(input.caption, input.media.length ? input.link : "");
    let embed: object | undefined;
    if (input.media.length) {
      const images = [];
      for (const m of input.media) {
        const up = await request("Bluesky", `${BSKY}/com.atproto.repo.uploadBlob`, {
          method: "POST",
          headers: { ...auth, "Content-Type": "image/jpeg" },
          body: new Blob([new Uint8Array(await bskyImage(m.path))], { type: "image/jpeg" }),
        });
        images.push({ alt: "", image: up.blob });
      }
      embed = { $type: "app.bsky.embed.images", images };
    } else if (input.link) {
      embed = { $type: "app.bsky.embed.external", external: { uri: input.link, title: input.title || input.link, description: "" } };
    }
    const facets = bskyFacets(text);
    const r = await request("Bluesky", `${BSKY}/com.atproto.repo.createRecord`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        repo: s.did,
        collection: "app.bsky.feed.post",
        record: { $type: "app.bsky.feed.post", text, createdAt: new Date().toISOString(), ...(facets.length ? { facets } : {}), ...(embed ? { embed } : {}) },
      }),
    });
    return { externalId: r.uri, url: `https://bsky.app/profile/${s.handle}/post/${String(r.uri).split("/").pop()}` };
  },

  async metrics(_a, uri): Promise<Metrics> {
    const r = await request("Bluesky", `https://public.api.bsky.app/xrpc/app.bsky.feed.getPosts?uris=${encodeURIComponent(uri)}`);
    const p = r.posts?.[0] ?? {};
    return { likes: p.likeCount ?? 0, shares: (p.repostCount ?? 0) + (p.quoteCount ?? 0), comments: p.replyCount ?? 0 };
  },
};

// ---------------------------------------------------------------- Telegram

const tg = (token: string, method: string) => `https://api.telegram.org/bot${token}/${method}`;
const tgJson = (token: string, method: string, body: object) =>
  request("Telegram", tg(token, method), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export const telegram: Provider = {
  platform: "TELEGRAM",
  label: "Telegram channel",
  hint: "Posts to a channel or group through your own bot. No approval needed.",
  isConfigured: () => true,
  credentialFields: [
    { name: "token", label: "Bot token", secret: true, placeholder: "123456:ABC-DEF…", help: "Message @BotFather in Telegram, send /newbot, and copy the token it gives you." },
    { name: "chat", label: "Channel", placeholder: "@yourchannel", help: "Add your bot to the channel as an administrator first. For a private channel, enter its numeric ID (starts with -100)." },
  ],

  async connectWithCredentials(v): Promise<ConnectedAccount[]> {
    const token = v.token.trim();
    if (!/^\d+:[\w-]{30,}$/.test(token)) throw new ProviderError("That does not look like a bot token");
    const me = await request("Telegram", tg(token, "getMe"));
    const chat = (await tgJson(token, "getChat", { chat_id: v.chat.trim() })).result;
    const member = (await tgJson(token, "getChatMember", { chat_id: chat.id, user_id: me.result.id })).result;
    if (!["administrator", "creator"].includes(member.status)) {
      throw new ProviderError(`Make @${me.result.username} an administrator of ${chat.title ?? "the channel"}, then try again`);
    }
    return [{ externalId: String(chat.id), name: chat.title ?? chat.username ?? "Telegram chat", username: chat.username, accessToken: token, meta: { username: chat.username ?? null } }];
  },

  async check(a) {
    await tgJson(a.accessToken, "getChat", { chat_id: a.externalId });
  },

  validate(d: Draft) {
    const errors: string[] = [];
    const text = withLink(d.caption, d.link);
    if (!text.trim() && d.media.length === 0) errors.push("Add text or media.");
    if (d.media.length > 10) errors.push("Telegram albums allow at most 10 items.");
    if (d.media.length > 0 && text.length > 1024) errors.push("Telegram captions on media are limited to 1,024 characters.");
    if (text.length > 4096) errors.push("Telegram messages are limited to 4,096 characters.");
    return errors;
  },

  async publish(a: AccountCtx, input: PublishInput) {
    const token = a.accessToken;
    const text = withLink(input.caption, input.link);
    let message: any;
    if (input.media.length === 0) {
      message = (await tgJson(token, "sendMessage", { chat_id: a.externalId, text })).result;
    } else if (input.media.length === 1) {
      const m = input.media[0];
      const form = new FormData();
      form.append("chat_id", a.externalId);
      if (text) form.append("caption", text);
      form.append(m.kind === "VIDEO" ? "video" : "photo", await openAsBlob(m.path, { type: m.mime }), m.key);
      if (m.kind === "VIDEO") form.append("supports_streaming", "true");
      message = (await request("Telegram", tg(token, m.kind === "VIDEO" ? "sendVideo" : "sendPhoto"), { method: "POST", body: form })).result;
    } else {
      const form = new FormData();
      form.append("chat_id", a.externalId);
      const media = [];
      for (const [i, m] of input.media.entries()) {
        form.append(`file${i}`, await openAsBlob(m.path, { type: m.mime }), m.key);
        media.push({ type: m.kind === "VIDEO" ? "video" : "photo", media: `attach://file${i}`, ...(i === 0 && text ? { caption: text } : {}) });
      }
      form.append("media", JSON.stringify(media));
      message = (await request("Telegram", tg(token, "sendMediaGroup"), { method: "POST", body: form })).result[0];
    }
    const username = a.meta.username as string | null;
    return { externalId: String(message.message_id), url: username ? `https://t.me/${username}/${message.message_id}` : undefined };
  },
};

// ---------------------------------------------------------------- Mastodon

/** Every call re-checks that the instance is a public host, since the address is user-supplied. */
async function masto(a: { instance: string; token: string }, path: string, init: RequestInit = {}) {
  await assertPublicUrl(a.instance).catch((e: Error) => {
    throw new ProviderError(`Mastodon server address: ${e.message}`);
  });
  return request("Mastodon", `${a.instance}${path}`, { ...init, redirect: "error", headers: { Authorization: `Bearer ${a.token}`, ...(init.headers ?? {}) } });
}

const mastoCtx = (a: AccountCtx) => ({ instance: String(a.meta.instance), token: a.accessToken });

export const mastodon: Provider = {
  platform: "MASTODON",
  label: "Mastodon",
  hint: "Connects with an access token from your server. No approval needed.",
  isConfigured: () => true,
  credentialFields: [
    { name: "instance", label: "Server", placeholder: "mastodon.social" },
    { name: "token", label: "Access token", secret: true, help: "On your server: Preferences → Development → New application, tick write:statuses, write:media and read:accounts, then copy “Your access token”." },
  ],

  async connectWithCredentials(v): Promise<ConnectedAccount[]> {
    const host = v.instance.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "").toLowerCase();
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) throw new ProviderError("Enter your server's address, for example mastodon.social");
    const instance = `https://${host}`;
    const me = await masto({ instance, token: v.token.trim() }, "/api/v1/accounts/verify_credentials");
    return [{ externalId: `${host}:${me.id}`, name: me.display_name || me.username, username: `${me.username}@${host}`, avatarUrl: me.avatar, accessToken: v.token.trim(), meta: { instance } }];
  },

  async check(a) {
    await masto(mastoCtx(a), "/api/v1/accounts/verify_credentials");
  },

  validate(d: Draft) {
    const errors: string[] = [];
    const videos = d.media.filter((m) => m.kind === "VIDEO").length;
    if (!d.caption.trim() && d.media.length === 0) errors.push("Add text or media.");
    if (d.media.length > 4) errors.push("Mastodon allows at most 4 attachments.");
    if (videos > 1 || (videos === 1 && d.media.length > 1)) errors.push("Mastodon allows one video, not mixed with images.");
    if (withLink(d.caption, d.link).length > 500) errors.push("Mastodon posts are limited to 500 characters on most servers.");
    return errors;
  },

  async publish(a: AccountCtx, input: PublishInput) {
    const ctx = mastoCtx(a);
    const mediaIds: string[] = [];
    for (const m of input.media) {
      const form = new FormData();
      form.append("file", await openAsBlob(m.path, { type: m.mime }), m.key);
      const up = await masto(ctx, "/api/v2/media", { method: "POST", body: form });
      // Large files are processed asynchronously; wait until the attachment has a URL.
      for (let i = 0; !up.url && i < 60; i++) {
        await sleep(3000);
        const s = await masto(ctx, `/api/v1/media/${up.id}`).catch((e: ProviderError) => {
          if (e.retryable) return {};
          throw e;
        });
        if (s.url) up.url = s.url;
      }
      if (!up.url) throw new ProviderError("Mastodon took too long to process the media", { retryable: true });
      mediaIds.push(up.id);
    }
    const st = await masto(ctx, "/api/v1/statuses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: withLink(input.caption, input.link), media_ids: mediaIds, visibility: "public" }),
    });
    return { externalId: st.id, url: st.url };
  },

  async metrics(a, id): Promise<Metrics> {
    const st = await masto(mastoCtx(a), `/api/v1/statuses/${encodeURIComponent(id)}`);
    return { likes: st.favourites_count ?? 0, shares: st.reblogs_count ?? 0, comments: st.replies_count ?? 0 };
  },
};
