/**
 * Facebook Pages and Instagram (professional accounts linked to a Page), both through
 * Facebook Login on one Meta app. Page access tokens derived from a long-lived user token
 * do not expire, so there is no refresh step; a revoked token surfaces as error code 190.
 */
import { unlink } from "node:fs/promises";
import sharp from "sharp";
import { randomToken } from "../crypto";
import { env } from "../env";
import { filePath, publicUrl } from "../storage";
import {
  type AccountCtx,
  type ConnectedAccount,
  type Metrics,
  type Draft,
  type Provider,
  ProviderError,
  type PublishInput,
  readJson,
  sleep,
} from "./types";

const graph = () => `https://graph.facebook.com/${env.meta.version}`;
const graphVideo = () => `https://graph-video.facebook.com/${env.meta.version}`;

const FB_SCOPES = ["pages_show_list", "pages_read_engagement", "pages_manage_posts"];
const IG_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "instagram_basic",
  "instagram_content_publish",
  "business_management",
];

const RETRYABLE_CODES = new Set([1, 2, 4, 17, 32, 341, 613]);

async function call(url: string, init?: RequestInit): Promise<any> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(120_000) });
  } catch (e) {
    throw new ProviderError(`Network error talking to Meta: ${(e as Error).message}`, { retryable: true });
  }
  const json = await readJson(res);
  if (!res.ok || json.error) {
    const err = json.error ?? {};
    const msg = err.error_user_msg || err.message || `Meta API error (HTTP ${res.status})`;
    throw new ProviderError(msg, {
      reauth: err.code === 190 || err.code === 102 || err.code === 10 || err.code === 200,
      retryable: res.status >= 500 || RETRYABLE_CODES.has(err.code) || err.is_transient === true,
    });
  }
  return json;
}

function post(url: string, params: Record<string, string>) {
  return call(url, { method: "POST", body: new URLSearchParams(params) });
}

function authUrl(scopes: string[], state: string, redirectUri: string) {
  const q = new URLSearchParams({
    client_id: env.meta.appId,
    redirect_uri: redirectUri,
    state,
    response_type: "code",
    scope: scopes.join(","),
  });
  return `https://www.facebook.com/${env.meta.version}/dialog/oauth?${q}`;
}

type PageRow = {
  id: string;
  name: string;
  access_token: string;
  picture?: { data?: { url?: string } };
  instagram_business_account?: { id: string; username?: string; name?: string; profile_picture_url?: string };
};

async function fetchPages(code: string, redirectUri: string): Promise<PageRow[]> {
  const base = { client_id: env.meta.appId, client_secret: env.meta.appSecret };
  const short = await call(
    `${graph()}/oauth/access_token?${new URLSearchParams({ ...base, redirect_uri: redirectUri, code })}`,
  );
  const long = await call(
    `${graph()}/oauth/access_token?${new URLSearchParams({
      ...base,
      grant_type: "fb_exchange_token",
      fb_exchange_token: short.access_token,
    })}`,
  );
  const pages: PageRow[] = [];
  let url: string | undefined = `${graph()}/me/accounts?${new URLSearchParams({
    fields:
      "id,name,access_token,picture{url},instagram_business_account{id,username,name,profile_picture_url}",
    limit: "100",
    access_token: long.access_token,
  })}`;
  while (url) {
    const page: any = await call(url);
    pages.push(...(page.data ?? []));
    url = page.paging?.next;
  }
  return pages;
}

const configured = () => Boolean(env.meta.appId && env.meta.appSecret);

export const facebook: Provider = {
  platform: "FACEBOOK",
  label: "Facebook Page",
  hint: "You must be an admin of the Page. Personal profiles and Groups cannot be posted to.",
  isConfigured: configured,
  authUrl: (state, redirectUri) => authUrl(FB_SCOPES, state, redirectUri),

  async connect(code, redirectUri): Promise<ConnectedAccount[]> {
    const pages = await fetchPages(code, redirectUri);
    return pages.map((p) => ({
      externalId: p.id,
      name: p.name,
      avatarUrl: p.picture?.data?.url,
      accessToken: p.access_token,
      scopes: FB_SCOPES.join(","),
    }));
  },

  async check(a) {
    await call(`${graph()}/${a.externalId}?${new URLSearchParams({ fields: "id", access_token: a.accessToken })}`);
  },

  validate(d: Draft) {
    const errors: string[] = [];
    const videos = d.media.filter((m) => m.kind === "VIDEO").length;
    if (!d.caption.trim() && !d.link && d.media.length === 0) errors.push("Add text, a link or media.");
    if (videos > 1) errors.push("Facebook accepts one video per post.");
    if (videos === 1 && d.media.length > 1) errors.push("Facebook cannot mix a video with images.");
    return errors;
  },

  async publish(a: AccountCtx, input: PublishInput) {
    const token = a.accessToken;
    const video = input.media.find((m) => m.kind === "VIDEO");
    if (video) {
      const r = await post(`${graphVideo()}/${a.externalId}/videos`, {
        file_url: video.url,
        description: input.caption,
        ...(input.title ? { title: input.title } : {}),
        access_token: token,
      });
      return { externalId: r.id, url: `https://www.facebook.com/${r.id}` };
    }
    const params: Record<string, string> = { message: input.caption, access_token: token };
    if (input.media.length > 0) {
      // Upload each photo unpublished, then attach them all to one feed post.
      let i = 0;
      for (const m of input.media) {
        const photo = await post(`${graph()}/${a.externalId}/photos`, {
          url: m.url,
          published: "false",
          access_token: token,
        });
        params[`attached_media[${i++}]`] = JSON.stringify({ media_fbid: photo.id });
      }
    } else if (input.link) {
      params.link = input.link;
    }
    if (input.media.length > 0 && input.link) params.message = `${input.caption}\n\n${input.link}`.trim();
    const r = await post(`${graph()}/${a.externalId}/feed`, params);
    return { externalId: r.id, url: `https://www.facebook.com/${r.id}` };
  },

  async metrics(a, id): Promise<Metrics> {
    const r = await call(
      `${graph()}/${id}?${new URLSearchParams({
        fields: "likes.summary(true).limit(0),comments.summary(true).limit(0),shares",
        access_token: a.accessToken,
      })}`,
    );
    return {
      likes: r.likes?.summary?.total_count ?? 0,
      comments: r.comments?.summary?.total_count ?? 0,
      shares: r.shares?.count ?? 0,
    };
  },
};

/** Instagram only accepts JPEG images; convert anything else to a temporary JPEG. */
async function jpegUrl(m: PublishInput["media"][number], temp: string[]): Promise<string> {
  if (m.mime === "image/jpeg") return m.url;
  const key = `${randomToken(24)}.jpg`;
  await sharp(m.path).rotate().flatten({ background: "#ffffff" }).jpeg({ quality: 90 }).toFile(filePath(key));
  temp.push(key);
  return publicUrl(key);
}

async function waitForContainer(id: string, token: string) {
  for (let i = 0; i < 60; i++) {
    const s = await call(`${graph()}/${id}?${new URLSearchParams({ fields: "status_code,status", access_token: token })}`);
    if (s.status_code === "FINISHED") return;
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED") {
      throw new ProviderError(`Instagram could not process the media: ${s.status ?? s.status_code}`);
    }
    await sleep(5000);
  }
  throw new ProviderError("Instagram took too long to process the media", { retryable: true });
}

export const instagram: Provider = {
  platform: "INSTAGRAM",
  label: "Instagram",
  hint: "Needs an Instagram Business or Creator account linked to a Facebook Page you manage.",
  isConfigured: configured,
  authUrl: (state, redirectUri) => authUrl(IG_SCOPES, state, redirectUri),

  async connect(code, redirectUri): Promise<ConnectedAccount[]> {
    const pages = await fetchPages(code, redirectUri);
    return pages
      .filter((p) => p.instagram_business_account)
      .map((p) => {
        const ig = p.instagram_business_account!;
        return {
          externalId: ig.id,
          name: ig.name || ig.username || p.name,
          username: ig.username,
          avatarUrl: ig.profile_picture_url,
          accessToken: p.access_token,
          scopes: IG_SCOPES.join(","),
          meta: { pageId: p.id },
        };
      });
  },

  async check(a) {
    await call(`${graph()}/${a.externalId}?${new URLSearchParams({ fields: "id", access_token: a.accessToken })}`);
  },

  validate(d: Draft) {
    const errors: string[] = [];
    if (d.media.length === 0) errors.push("Instagram posts need an image or video.");
    if (d.media.length > 10) errors.push("Instagram carousels allow at most 10 items.");
    if (d.caption.length > 2200) errors.push("Instagram captions are limited to 2,200 characters.");
    return errors;
  },

  async publish(a: AccountCtx, input: PublishInput) {
    const token = a.accessToken;
    const ig = a.externalId;
    const temp: string[] = [];
    try {
      let creationId: string;
      if (input.media.length === 1) {
        const m = input.media[0];
        const params: Record<string, string> =
          m.kind === "VIDEO"
            ? { media_type: "REELS", video_url: m.url, share_to_feed: "true" }
            : { image_url: await jpegUrl(m, temp) };
        const c = await post(`${graph()}/${ig}/media`, { ...params, caption: input.caption, access_token: token });
        creationId = c.id;
        if (m.kind === "VIDEO") await waitForContainer(creationId, token);
      } else {
        const children: string[] = [];
        for (const m of input.media) {
          const params: Record<string, string> =
            m.kind === "VIDEO"
              ? { media_type: "VIDEO", video_url: m.url }
              : { image_url: await jpegUrl(m, temp) };
          const c = await post(`${graph()}/${ig}/media`, { ...params, is_carousel_item: "true", access_token: token });
          if (m.kind === "VIDEO") await waitForContainer(c.id, token);
          children.push(c.id);
        }
        const c = await post(`${graph()}/${ig}/media`, {
          media_type: "CAROUSEL",
          children: children.join(","),
          caption: input.caption,
          access_token: token,
        });
        creationId = c.id;
      }
      const published = await post(`${graph()}/${ig}/media_publish`, { creation_id: creationId, access_token: token });
      let url: string | undefined;
      try {
        const info = await call(
          `${graph()}/${published.id}?${new URLSearchParams({ fields: "permalink", access_token: token })}`,
        );
        url = info.permalink;
      } catch {
        // The post is live; a missing permalink is not worth failing over.
      }
      return { externalId: published.id, url };
    } finally {
      for (const key of temp) await unlink(filePath(key)).catch(() => {});
    }
  },

  async metrics(a, id): Promise<Metrics> {
    const r = await call(
      `${graph()}/${id}?${new URLSearchParams({ fields: "like_count,comments_count", access_token: a.accessToken })}`,
    );
    return { likes: r.like_count ?? 0, comments: r.comments_count ?? 0 };
  },
};
