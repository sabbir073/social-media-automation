import { z } from "zod";
import { destroySession, hashPassword, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { body, handler, HttpError } from "@/lib/http";
import { isValidZone } from "@/lib/slots";
import { removeFile } from "@/lib/storage";

const profile = z.object({
  name: z.string().trim().min(1).max(80),
  timezone: z.string().refine(isValidZone, "Unknown timezone"),
});

export const PATCH = handler(async ({ req, user }) => {
  await prisma.user.update({ where: { id: user.id }, data: await body(req, profile) });
});

const password = z.object({ current: z.string().min(1), next: z.string().min(8, "Use at least 8 characters").max(200) });

export const POST = handler(async ({ req, user }) => {
  const data = await body(req, password);
  if (!(await verifyPassword(data.current, user.passwordHash))) throw new HttpError(400, "Current password is wrong");
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(data.next) } });
});

/** Deletes the account with every connected account, token, post and uploaded file. */
export const DELETE = handler(async ({ req, user }) => {
  const { password: pw } = await body(req, z.object({ password: z.string().min(1) }));
  if (!(await verifyPassword(pw, user.passwordHash))) throw new HttpError(400, "Password is wrong");
  const media = await prisma.mediaAsset.findMany({ where: { userId: user.id }, select: { key: true } });
  await prisma.user.delete({ where: { id: user.id } });
  for (const m of media) await removeFile(m.key);
  await destroySession();
});
