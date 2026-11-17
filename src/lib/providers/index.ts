import type { Platform, SocialAccount } from "@prisma/client";
import { decrypt, encrypt } from "../crypto";
import { prisma } from "../db";
import { facebook, instagram } from "./meta";
import { mock } from "./mock";
import { pinterest } from "./pinterest";
import { type AccountCtx, type Provider, ProviderError } from "./types";
import { youtube } from "./youtube";

const all: Record<Platform, Provider> = {
  FACEBOOK: facebook,
  INSTAGRAM: instagram,
  YOUTUBE: youtube,
  PINTEREST: pinterest,
  MOCK: mock,
};

export function getProvider(platform: Platform): Provider {
  return all[platform];
}

export function providerBySlug(slug: string): Provider | null {
  const key = slug.toUpperCase() as Platform;
  return all[key] ?? null;
}

/** Providers the operator has configured credentials for. */
export function availableProviders(): Provider[] {
  return Object.values(all).filter((p) => p.isConfigured());
}

export function redirectUri(appUrl: string, platform: Platform) {
  return `${appUrl}/api/oauth/${platform.toLowerCase()}/callback`;
}

/** Returns a usable access token, refreshing and persisting it when it is about to expire. */
export async function accountContext(account: SocialAccount): Promise<AccountCtx> {
  const provider = getProvider(account.platform);
  let accessToken = decrypt(account.accessTokenEnc);
  const expiring = account.tokenExpiresAt && account.tokenExpiresAt.getTime() - Date.now() < 5 * 60_000;
  if (expiring && provider.refresh && account.refreshTokenEnc) {
    const t = await provider.refresh(decrypt(account.refreshTokenEnc));
    accessToken = t.accessToken;
    await prisma.socialAccount.update({
      where: { id: account.id },
      data: {
        accessTokenEnc: encrypt(t.accessToken),
        ...(t.refreshToken ? { refreshTokenEnc: encrypt(t.refreshToken) } : {}),
        tokenExpiresAt: t.expiresAt ?? null,
      },
    });
  }
  return { externalId: account.externalId, accessToken, meta: (account.meta ?? {}) as Record<string, unknown> };
}

/** Verifies a connection against the platform and records the result on the account. */
export async function checkAccount(account: SocialAccount): Promise<{ ok: boolean; message?: string }> {
  try {
    const ctx = await accountContext(account);
    await getProvider(account.platform).check(ctx);
    await prisma.socialAccount.update({
      where: { id: account.id },
      data: { status: "CONNECTED", statusMessage: null, lastCheckedAt: new Date() },
    });
    return { ok: true };
  } catch (e) {
    const err = e instanceof ProviderError ? e : new ProviderError((e as Error).message, { retryable: true });
    // A temporary outage must not flip a healthy account to "broken".
    if (err.retryable && !err.reauth) return { ok: false, message: err.message };
    await markAccountBroken(account.id, err);
    return { ok: false, message: err.message };
  }
}

export async function markAccountBroken(accountId: string, err: ProviderError) {
  await prisma.socialAccount.update({
    where: { id: accountId },
    data: {
      status: err.reauth ? "NEEDS_REAUTH" : "ERROR",
      statusMessage: err.message.slice(0, 500),
      lastCheckedAt: new Date(),
    },
  });
}

export { ProviderError } from "./types";
export type { Provider } from "./types";
