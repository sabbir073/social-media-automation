import type { Platform } from "@prisma/client";

export type PublishMedia = {
  key: string;
  url: string; // public URL the network can fetch
  path: string; // local file path
  mime: string;
  kind: "IMAGE" | "VIDEO";
  size: number;
};

export type PublishInput = {
  caption: string;
  title: string;
  link: string;
  media: PublishMedia[];
  options: Record<string, unknown>;
};

/** What we know about a post before publishing; used for validation in the composer and sheets. */
export type Draft = {
  caption: string;
  title: string;
  link: string;
  media: { kind: "IMAGE" | "VIDEO" }[];
  options: Record<string, unknown>;
};

export type ConnectedAccount = {
  externalId: string;
  name: string;
  username?: string;
  avatarUrl?: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scopes?: string;
  meta?: Record<string, unknown>;
};

export type AccountCtx = {
  externalId: string;
  accessToken: string;
  meta: Record<string, unknown>;
};

/** Engagement counters, normalized across networks. Missing keys mean "not reported". */
export type Metrics = Partial<Record<"likes" | "comments" | "shares" | "views" | "saves", number>>;

export type TokenUpdate = { accessToken: string; refreshToken?: string; expiresAt?: Date };

export class ProviderError extends Error {
  retryable: boolean;
  reauth: boolean;
  constructor(message: string, opts: { retryable?: boolean; reauth?: boolean } = {}) {
    super(message);
    this.retryable = opts.retryable ?? false;
    this.reauth = opts.reauth ?? false;
  }
}

export interface Provider {
  platform: Platform;
  label: string;
  /** Shown on the Accounts page to tell users what they need before connecting. */
  hint: string;
  isConfigured(): boolean;
  authUrl(state: string, redirectUri: string): string;
  /** Exchanges the OAuth code and returns every account the user granted. */
  connect(code: string, redirectUri: string): Promise<ConnectedAccount[]>;
  refresh?(refreshToken: string): Promise<TokenUpdate>;
  /** Throws ProviderError if the connection no longer works. */
  check(account: AccountCtx): Promise<void>;
  /** Returns human-readable problems; empty means the draft can be published. */
  validate(draft: Draft): string[];
  publish(account: AccountCtx, input: PublishInput): Promise<{ externalId: string; url?: string }>;
  /** Current engagement numbers for a post this provider published. */
  metrics?(account: AccountCtx, externalPostId: string): Promise<Metrics>;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function readJson(res: Response): Promise<any> {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text.slice(0, 500) };
  }
}
