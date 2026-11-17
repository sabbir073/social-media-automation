import { z } from "zod";
import { requireActiveSubscription } from "@/lib/billing/entitlements";
import { prisma } from "@/lib/db";
import { fetchFeed, syncFeed } from "@/lib/feeds";
import { body, handler, HttpError } from "@/lib/http";

const schema = z.object({
  url: z.string().trim().url("Enter the feed's full address").max(1000),
  accountIds: z.array(z.string()).min(1, "Choose at least one account").max(50),
  mode: z.enum(["slot", "now"]),
  template: z.string().trim().min(1).max(1000).default("{title}"),
});

export const POST = handler(async ({ req, user }) => {
  await requireActiveSubscription(user.id);
  const data = await body(req, schema);
  if ((await prisma.feed.count({ where: { userId: user.id } })) >= 20) throw new HttpError(400, "You can connect up to 20 feeds");
  const owned = await prisma.socialAccount.count({ where: { userId: user.id, id: { in: data.accountIds } } });
  if (owned !== new Set(data.accountIds).size) throw new HttpError(400, "One of the chosen accounts no longer exists");
  let title: string;
  try {
    title = (await fetchFeed(data.url)).title;
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
  const feed = await prisma.feed
    .create({ data: { userId: user.id, ...data, title: title.slice(0, 120) } })
    .catch(() => {
      throw new HttpError(409, "This feed is already connected");
    });
  const summary = await syncFeed(feed.id).catch((e: Error) => e.message);
  return { id: feed.id, summary };
});
