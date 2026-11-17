import { z } from "zod";
import { prisma } from "@/lib/db";
import { syncFeed } from "@/lib/feeds";
import { body, handler, HttpError } from "@/lib/http";
import { rateLimit } from "@/lib/redis";

export const PATCH = handler<{ id: string }>(async ({ req, params, user }) => {
  const { enabled } = await body(req, z.object({ enabled: z.boolean() }));
  const r = await prisma.feed.updateMany({ where: { id: params.id, userId: user.id }, data: { enabled } });
  if (r.count === 0) throw new HttpError(404, "Feed not found");
});

export const DELETE = handler<{ id: string }>(async ({ params, user }) => {
  const r = await prisma.feed.deleteMany({ where: { id: params.id, userId: user.id } });
  if (r.count === 0) throw new HttpError(404, "Feed not found");
});

/** Check the feed now. */
export const POST = handler<{ id: string }>(async ({ params, user }) => {
  const feed = await prisma.feed.findFirst({ where: { id: params.id, userId: user.id } });
  if (!feed) throw new HttpError(404, "Feed not found");
  if (!(await rateLimit(`feed-sync:${feed.id}`, 6, 60))) throw new HttpError(429, "Please wait a moment before checking again");
  try {
    return { summary: await syncFeed(feed.id) };
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
});
