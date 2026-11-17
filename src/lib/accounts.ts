import type { Platform } from "@prisma/client";
import { encrypt } from "./crypto";
import { prisma } from "./db";
import type { ConnectedAccount } from "./providers/types";

/**
 * Stores accounts returned by a connect flow. Reconnecting an existing account refreshes its
 * tokens; new accounts are added until the plan's account limit is reached.
 */
export async function saveConnectedAccounts(userId: string, maxAccounts: number, platform: Platform, found: ConnectedAccount[]) {
  const existing = await prisma.socialAccount.findMany({ where: { userId }, select: { platform: true, externalId: true } });
  const isNew = (id: string) => !existing.some((e) => e.platform === platform && e.externalId === id);
  let room = maxAccounts - existing.length;
  let saved = 0;
  let skipped = 0;
  for (const a of found) {
    if (isNew(a.externalId)) {
      if (room <= 0) {
        skipped++;
        continue;
      }
      room--;
    }
    const data = {
      name: a.name,
      username: a.username ?? null,
      avatarUrl: a.avatarUrl ?? null,
      accessTokenEnc: encrypt(a.accessToken),
      refreshTokenEnc: a.refreshToken ? encrypt(a.refreshToken) : null,
      tokenExpiresAt: a.expiresAt ?? null,
      scopes: a.scopes ?? "",
      status: "CONNECTED" as const,
      statusMessage: null,
      lastCheckedAt: new Date(),
      meta: (a.meta ?? {}) as object,
    };
    await prisma.socialAccount.upsert({
      where: { userId_platform_externalId: { userId, platform, externalId: a.externalId } },
      update: data,
      create: { userId, platform, externalId: a.externalId, ...data },
    });
    saved++;
  }
  return { saved, skipped };
}
