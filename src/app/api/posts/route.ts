import { z } from "zod";
import { body, handler } from "@/lib/http";
import { createPost } from "@/lib/posts";

const schema = z.object({
  caption: z.string().max(5000).default(""),
  title: z.string().trim().max(200).default(""),
  link: z.union([z.literal(""), z.string().trim().url("Enter a full link starting with https://").max(2000)]).default(""),
  mediaIds: z.array(z.string()).max(10).default([]),
  targets: z
    .array(
      z.object({
        accountId: z.string(),
        scheduledAt: z.union([z.literal("now"), z.string().datetime({ offset: true })]),
        captionOverride: z.string().max(5000).nullish(),
        options: z.record(z.unknown()).default({}),
      }),
    )
    .min(1, "Choose at least one account")
    .max(50),
});

export const POST = handler(async ({ req, user }) => {
  const data = await body(req, schema);
  const post = await createPost(user.id, {
    ...data,
    targets: data.targets.map((t) => ({ ...t, scheduledAt: t.scheduledAt === "now" ? new Date() : new Date(t.scheduledAt) })),
  });
  return { id: post.id, targets: post.targets.length };
});
