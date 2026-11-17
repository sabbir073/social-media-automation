import { prisma } from "@/lib/db";
import { handler, HttpError } from "@/lib/http";

export const DELETE = handler<{ id: string }>(async ({ params, user }) => {
  const r = await prisma.snippet.deleteMany({ where: { id: params.id, userId: user.id } });
  if (r.count === 0) throw new HttpError(404, "Template not found");
});
