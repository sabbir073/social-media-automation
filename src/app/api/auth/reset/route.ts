import { z } from "zod";
import { hashPassword } from "@/lib/auth";
import { sha256 } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { body, handler, HttpError } from "@/lib/http";

const schema = z.object({ token: z.string().min(10), password: z.string().min(8, "Use at least 8 characters").max(200) });

export const POST = handler(
  async ({ req }) => {
    const data = await body(req, schema);
    const row = await prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256(data.token) } });
    if (!row || row.usedAt || row.expiresAt < new Date()) throw new HttpError(400, "This reset link is invalid or has expired");
    await prisma.$transaction([
      prisma.user.update({ where: { id: row.userId }, data: { passwordHash: await hashPassword(data.password) } }),
      prisma.passwordResetToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
    ]);
    return { ok: true };
  },
  { auth: "none" },
);
