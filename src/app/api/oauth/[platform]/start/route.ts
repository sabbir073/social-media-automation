import { NextRequest, NextResponse } from "next/server";
import { getUser, signToken } from "@/lib/auth";
import { getSubscription, isActive } from "@/lib/billing/entitlements";
import { randomToken } from "@/lib/crypto";
import { env } from "@/lib/env";
import { providerBySlug, redirectUri } from "@/lib/providers";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  const back = (msg: string) => NextResponse.redirect(`${env.appUrl}/app/accounts?error=${encodeURIComponent(msg)}`);
  const user = await getUser();
  if (!user) return NextResponse.redirect(`${env.appUrl}/login`);
  const provider = providerBySlug((await params).platform);
  if (!provider || !provider.isConfigured()) return back("This network is not available yet");
  if (!isActive(await getSubscription(user.id))) return NextResponse.redirect(`${env.appUrl}/app/billing`);

  // The state is signed (ties the callback to this user) and its nonce is also kept in a
  // cookie (ties the callback to this browser), which blocks login-CSRF account swaps.
  const nonce = randomToken(16);
  const state = await signToken({ uid: user.id, platform: provider.platform, nonce }, 600);
  const res = NextResponse.redirect(provider.authUrl(state, redirectUri(env.appUrl, provider.platform)));
  res.cookies.set("oauth_nonce", nonce, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.appUrl.startsWith("https://"),
    path: "/api/oauth",
    maxAge: 600,
  });
  return res;
}
