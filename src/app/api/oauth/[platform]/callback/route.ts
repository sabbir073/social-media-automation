import { NextRequest, NextResponse } from "next/server";
import { getUser, verifyToken } from "@/lib/auth";
import { getSubscription, isActive } from "@/lib/billing/entitlements";
import { encrypt } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { providerBySlug, redirectUri } from "@/lib/providers";

export async function GET(req: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  const done = (query: string) => {
    const res = NextResponse.redirect(`${env.appUrl}/app/accounts?${query}`);
    res.cookies.delete({ name: "oauth_nonce", path: "/api/oauth" });
    return res;
  };
  const fail = (msg: string) => done(`error=${encodeURIComponent(msg)}`);

  const user = await getUser();
  if (!user) return NextResponse.redirect(`${env.appUrl}/login`);
  const provider = providerBySlug((await params).platform);
  if (!provider || !provider.isConfigured()) return fail("This network is not available yet");

  const q = req.nextUrl.searchParams;
  if (q.get("error")) return fail(q.get("error_description") || "Connection was canceled");
  const code = q.get("code");
  const state = await verifyToken<{ uid: string; platform: string; nonce: string }>(q.get("state") ?? "");
  const nonce = req.cookies.get("oauth_nonce")?.value;
  if (!code || !state || state.uid !== user.id || state.platform !== provider.platform || !nonce || state.nonce !== nonce) {
    return fail("The connection request expired. Please try again.");
  }

  try {
    const sub = await getSubscription(user.id);
    if (!sub || !isActive(sub)) return fail("You need an active subscription to connect accounts");

    const found = await provider.connect(code, redirectUri(env.appUrl, provider.platform));
    if (found.length === 0) {
      return fail(
        provider.platform === "INSTAGRAM"
          ? "No Instagram professional account is linked to the Pages you selected"
          : `No ${provider.label} was found on that login`,
      );
    }
    const existing = await prisma.socialAccount.findMany({ where: { userId: user.id }, select: { platform: true, externalId: true } });
    const isNew = (id: string) => !existing.some((e) => e.platform === provider.platform && e.externalId === id);
    let room = sub.plan.maxAccounts - existing.length;
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
        where: { userId_platform_externalId: { userId: user.id, platform: provider.platform, externalId: a.externalId } },
        update: data,
        create: { userId: user.id, platform: provider.platform, externalId: a.externalId, ...data },
      });
      saved++;
    }
    return done(`connected=${saved}${skipped ? `&skipped=${skipped}` : ""}`);
  } catch (e) {
    console.error(`[oauth] ${provider.platform} callback`, e);
    return fail((e as Error).message || "Could not connect the account");
  }
}
