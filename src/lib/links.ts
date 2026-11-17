import type { Platform, User } from "@prisma/client";
import { randomToken } from "./crypto";
import { prisma } from "./db";
import { env } from "./env";

/** Adds utm_source/utm_medium/utm_campaign unless the link already carries them. */
export function withUtm(link: string, platform: Platform, campaign: string): string {
  try {
    const url = new URL(link);
    if (!url.searchParams.has("utm_source")) url.searchParams.set("utm_source", platform.toLowerCase());
    if (!url.searchParams.has("utm_medium")) url.searchParams.set("utm_medium", "social");
    if (campaign && !url.searchParams.has("utm_campaign")) url.searchParams.set("utm_campaign", campaign);
    return url.toString();
  } catch {
    return link;
  }
}

export async function createShortLink(userId: string, url: string, label = "", targetId?: string) {
  if (targetId) {
    const existing = await prisma.shortLink.findUnique({ where: { targetId } });
    if (existing) return existing;
  }
  return prisma.shortLink.create({ data: { userId, url, label, targetId, code: randomToken(5) } });
}

export const shortUrl = (code: string) => `${env.appUrl}/l/${code}`;

/** The link actually published for one target: UTM-tagged and/or shortened per the user's settings. */
export async function linkForTarget(
  link: string,
  user: Pick<User, "id" | "utmEnabled" | "utmCampaign" | "shortLinks">,
  platform: Platform,
  targetId: string,
  label: string,
): Promise<string> {
  if (!link) return "";
  const tagged = user.utmEnabled ? withUtm(link, platform, user.utmCampaign) : link;
  if (!user.shortLinks) return tagged;
  const short = await createShortLink(user.id, tagged, label, targetId);
  return shortUrl(short.code);
}
