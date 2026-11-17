import { z } from "zod";
import { prisma } from "@/lib/db";
import { body, handler, HttpError } from "@/lib/http";
import { createPost } from "@/lib/posts";
import { rateLimit } from "@/lib/redis";
import { importMedia } from "@/lib/sheets";
import { removeFile } from "@/lib/storage";

export const maxDuration = 300;

const schema = z.object({
  caption: z.string().max(5000).default(""),
  title: z.string().trim().max(200).default(""),
  link: z.union([z.literal(""), z.string().trim().url().max(2000)]).default(""),
  mediaUrls: z.array(z.string().url()).max(10).default([]),
  targets: z
    .array(
      z.object({
        accountId: z.string(),
        scheduledAt: z.union([z.literal("now"), z.string().datetime({ offset: true })]).default("now"),
        caption: z.string().max(5000).optional(),
        options: z.record(z.unknown()).default({}),
      }),
    )
    .min(1)
    .max(50),
});

/** Public API: create a post. Media is downloaded from the given public URLs. */
export const POST = handler(
  async ({ req, user }) => {
    if (!(await rateLimit(`v1-posts:${user.id}`, 120, 3600))) throw new HttpError(429, "Rate limit: 120 posts per hour");
    const data = await body(req, schema);
    let mediaIds: string[];
    try {
      mediaIds = await importMedia(user.id, data.mediaUrls);
    } catch (e) {
      throw new HttpError(400, (e as Error).message);
    }
    try {
      const post = await createPost(user.id, {
        caption: data.caption,
        title: data.title,
        link: data.link,
        mediaIds,
        targets: data.targets.map((t) => ({
          accountId: t.accountId,
          scheduledAt: t.scheduledAt === "now" ? new Date() : new Date(t.scheduledAt),
          captionOverride: t.caption,
          options: t.options,
        })),
      });
      return { id: post.id, targets: post.targets.map((t) => ({ id: t.id, accountId: t.accountId, scheduledAt: t.scheduledAt, status: "scheduled" })) };
    } catch (e) {
      const assets = await prisma.mediaAsset.findMany({ where: { id: { in: mediaIds } } });
      await prisma.mediaAsset.deleteMany({ where: { id: { in: mediaIds } } });
      for (const a of assets) await removeFile(a.key);
      throw e;
    }
  },
  { apiKey: true },
);
