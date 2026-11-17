import { z } from "zod";
import { prisma } from "@/lib/db";
import { body, handler, HttpError } from "@/lib/http";

export const PATCH = handler<{ id: string }>(async ({ req, params, user }) => {
  const { enabled } = await body(req, z.object({ enabled: z.boolean() }));
  const r = await prisma.sheetConnection.updateMany({ where: { id: params.id, userId: user.id }, data: { enabled } });
  if (r.count === 0) throw new HttpError(404, "Sheet not found");
});

/** Disconnects the sheet. Posts it already scheduled stay scheduled. */
export const DELETE = handler<{ id: string }>(async ({ params, user }) => {
  const r = await prisma.sheetConnection.deleteMany({ where: { id: params.id, userId: user.id } });
  if (r.count === 0) throw new HttpError(404, "Sheet not found");
});
