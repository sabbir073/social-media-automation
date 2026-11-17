import { prisma } from "@/lib/db";
import { handler, HttpError } from "@/lib/http";
import { removeFile } from "@/lib/storage";

export const DELETE = handler<{ id: string }>(async ({ params, user }) => {
  const asset = await prisma.mediaAsset.findFirst({ where: { id: params.id, userId: user.id }, include: { posts: true } });
  if (!asset) throw new HttpError(404, "File not found");
  if (asset.posts.length) throw new HttpError(409, "This file is used by a post");
  await prisma.mediaAsset.delete({ where: { id: asset.id } });
  await removeFile(asset.key);
});
