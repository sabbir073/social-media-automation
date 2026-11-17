import { z } from "zod";
import { prisma } from "@/lib/db";
import { body, handler, HttpError } from "@/lib/http";

const schema = z.object({
  id: z.string().optional(),
  caption: z.string().max(5000).default(""),
  title: z.string().trim().max(200).default(""),
  link: z.string().trim().max(2000).default(""),
  mediaIds: z.array(z.string()).max(10).default([]),
});

/** Creates a draft, or updates it when `id` is given. */
export const POST = handler(async ({ req, user }) => {
  const { id, ...data } = await body(req, schema);
  if (!data.caption.trim() && !data.title && !data.link && data.mediaIds.length === 0) throw new HttpError(400, "Write something first");
  const owned = await prisma.mediaAsset.findMany({ where: { userId: user.id, id: { in: data.mediaIds } }, select: { id: true } });
  data.mediaIds = data.mediaIds.filter((m) => owned.some((o) => o.id === m));
  if (id) {
    const r = await prisma.draft.updateMany({ where: { id, userId: user.id }, data });
    if (r.count === 0) throw new HttpError(404, "Draft not found");
    return { id };
  }
  if ((await prisma.draft.count({ where: { userId: user.id } })) >= 500) throw new HttpError(400, "You can keep up to 500 drafts");
  return { id: (await prisma.draft.create({ data: { userId: user.id, ...data } })).id };
});
