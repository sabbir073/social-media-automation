import { z } from "zod";
import { prisma } from "@/lib/db";
import { body, handler, HttpError } from "@/lib/http";

/** Pause or resume an account. While paused, its due posts wait instead of publishing. */
export const PATCH = handler<{ id: string }>(async ({ req, params, user }) => {
  const { paused } = await body(req, z.object({ paused: z.boolean() }));
  const r = await prisma.socialAccount.updateMany({ where: { id: params.id, userId: user.id }, data: { paused } });
  if (r.count === 0) throw new HttpError(404, "Account not found");
});

export const DELETE = handler<{ id: string }>(async ({ params, user }) => {
  const r = await prisma.socialAccount.deleteMany({ where: { id: params.id, userId: user.id } });
  if (r.count === 0) throw new HttpError(404, "Account not found");
  // Posts left without any target are removed too.
  await prisma.post.deleteMany({ where: { userId: user.id, targets: { none: {} } } });
});
