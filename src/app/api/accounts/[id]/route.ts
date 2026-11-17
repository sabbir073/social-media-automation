import { prisma } from "@/lib/db";
import { handler, HttpError } from "@/lib/http";

export const DELETE = handler<{ id: string }>(async ({ params, user }) => {
  const r = await prisma.socialAccount.deleteMany({ where: { id: params.id, userId: user.id } });
  if (r.count === 0) throw new HttpError(404, "Account not found");
  // Posts left without any target are removed too.
  await prisma.post.deleteMany({ where: { userId: user.id, targets: { none: {} } } });
});
