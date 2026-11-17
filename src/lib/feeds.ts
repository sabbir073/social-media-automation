/** RSS/Atom auto-posting: new feed items become posts on the chosen accounts. */
import { prisma } from "./db";
import { isActive } from "./billing/entitlements";
import { createPost } from "./posts";
import { importMedia } from "./sheets";
import { nextSlots } from "./slots";
import { safeFetch } from "./ssrf";
import { removeFile } from "./storage";

export type FeedEntry = { guid: string; title: string; link: string; image: string };

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&")
    .trim();
}

const tag = (xml: string, name: string) => xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"))?.[1] ?? "";
const attr = (xml: string, name: string, attribute: string) =>
  xml.match(new RegExp(`<${name}\\b[^>]*\\b${attribute}=["']([^"']+)["']`, "i"))?.[1] ?? "";

/** Minimal RSS 2.0 / Atom parser: title, link, id and a lead image per entry. */
export function parseFeed(xml: string): { title: string; entries: FeedEntry[] } {
  const isAtom = /<feed[\s>]/i.test(xml) && !/<rss[\s>]/i.test(xml);
  const blocks = xml.match(isAtom ? /<entry[\s>][\s\S]*?<\/entry>/gi : /<item[\s>][\s\S]*?<\/item>/gi) ?? [];
  const head = xml.slice(0, blocks.length ? xml.indexOf(blocks[0] as string) : xml.length);
  const entries = blocks.map((b) => {
    const link = isAtom
      ? b.match(/<link\b(?![^>]*\brel=["'](?!alternate)[^"']+["'])[^>]*\bhref=["']([^"']+)["']/i)?.[1] ?? ""
      : decode(tag(b, "link"));
    const image =
      attr(b, "media:content", "url") ||
      attr(b, "media:thumbnail", "url") ||
      (/<enclosure\b[^>]*type=["']image\//i.test(b) ? attr(b, "enclosure", "url") : "") ||
      (tag(b, "content:encoded") + tag(b, "description") + tag(b, "content")).replace(/&lt;/g, "<").replace(/&quot;/g, '"').match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i)?.[1] ||
      "";
    return { guid: decode(tag(b, isAtom ? "id" : "guid")) || link, title: decode(tag(b, "title")), link, image: image.replace(/&(amp;)+/g, "&") };
  });
  return { title: decode(tag(head, "title")) || "Feed", entries: entries.filter((e) => e.guid && (e.title || e.link)) };
}

export async function fetchFeed(url: string) {
  const res = await safeFetch(url);
  if (!res.ok) throw new Error(`The feed answered with HTTP ${res.status}`);
  const xml = (await res.text()).slice(0, 2_000_000);
  const parsed = parseFeed(xml);
  if (parsed.entries.length === 0 && !/<(rss|feed)[\s>]/i.test(xml)) throw new Error("That address is not an RSS or Atom feed");
  return parsed;
}

const MAX_NEW_PER_SYNC = 5;

/**
 * Posts new entries of one feed. The first sync only records what is already in the feed,
 * so connecting a feed never floods the accounts with old articles.
 */
export async function syncFeed(feedId: string): Promise<string> {
  const feed = await prisma.feed.findUniqueOrThrow({
    where: { id: feedId },
    include: { items: { select: { guid: true } }, user: { include: { subscription: true, accounts: { include: { slots: true } } } } },
  });
  try {
    const { entries } = await fetchFeed(feed.url);
    const seen = new Set(feed.items.map((i) => i.guid));
    const fresh = entries.filter((e) => !seen.has(e.guid));
    const firstRun = feed.lastCheckedAt === null;
    let posted = 0;
    const problems: string[] = [];

    if (!firstRun && isActive(feed.user.subscription)) {
      const accounts = feed.user.accounts.filter((a) => feed.accountIds.includes(a.id));
      // Oldest first, so posts go out in the order they were published.
      for (const entry of fresh.slice(0, MAX_NEW_PER_SYNC).reverse()) {
        let mediaIds: string[] = [];
        if (entry.image) mediaIds = await importMedia(feed.userId, [entry.image]).catch(() => []);
        const caption = feed.template.replace(/\{title\}/g, entry.title).replace(/\{link\}/g, entry.link);
        for (const account of accounts) {
          let when = new Date();
          if (feed.mode === "slot" && account.slots.length) {
            const busy = await prisma.postTarget.findMany({
              where: { accountId: account.id, status: { in: ["SCHEDULED", "QUEUED"] }, scheduledAt: { gt: new Date() } },
              select: { scheduledAt: true },
            });
            when = nextSlots(account.slots, feed.user.timezone, new Set(busy.map((b) => b.scheduledAt.getTime())), new Date())[0] ?? when;
          }
          try {
            await createPost(
              feed.userId,
              { caption, title: entry.title.slice(0, 100), link: entry.link, mediaIds, targets: [{ accountId: account.id, scheduledAt: when }] },
              "app",
            );
            posted++;
          } catch (e) {
            problems.push(`${account.name}: ${(e as Error).message}`);
          }
        }
        // Drop the downloaded image again if no post ended up using it.
        const unused = await prisma.mediaAsset.findMany({ where: { id: { in: mediaIds }, posts: { none: {} } } });
        for (const m of unused) {
          await prisma.mediaAsset.delete({ where: { id: m.id } });
          await removeFile(m.key);
        }
      }
    }
    const record = firstRun ? fresh : fresh.slice(0, MAX_NEW_PER_SYNC);
    if (record.length) {
      await prisma.feedItem.createMany({ data: record.map((e) => ({ feedId: feed.id, guid: e.guid.slice(0, 500) })), skipDuplicates: true });
    }
    await prisma.feed.update({
      where: { id: feed.id },
      data: { lastCheckedAt: new Date(), lastError: problems.length ? [...new Set(problems)].join(" | ").slice(0, 500) : null },
    });
    return firstRun ? `watching ${entries.length} existing items` : `${posted} post(s) created from ${Math.min(fresh.length, MAX_NEW_PER_SYNC)} new item(s)`;
  } catch (e) {
    const message = (e as Error).message.slice(0, 500);
    await prisma.feed.update({ where: { id: feed.id }, data: { lastCheckedAt: feed.lastCheckedAt ?? undefined, lastError: message } });
    throw new Error(message);
  }
}
