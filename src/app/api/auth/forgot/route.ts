import { z } from "zod";
import { randomToken, sha256 } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { body, handler, HttpError } from "@/lib/http";
import { sendMail } from "@/lib/mail";
import { rateLimit } from "@/lib/redis";
import { clientIp } from "@/lib/request";

const schema = z.object({ email: z.string().trim().toLowerCase().email() });

export const POST = handler(
  async ({ req }) => {
    if (!(await rateLimit(`forgot:${clientIp(req)}`, 5, 3600))) throw new HttpError(429, "Too many attempts. Try again later.");
    const { email } = await body(req, schema);
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      const token = randomToken();
      await prisma.passwordResetToken.create({
        data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 3_600_000) },
      });
      await sendMail(
        email,
        `Reset your ${env.appName} password`,
        `Open this link within one hour to choose a new password:\n\n${env.appUrl}/reset?token=${token}\n\nIf you did not ask for this, ignore this email.`,
      ).catch((e) => console.error("[mail]", e));
    }
    return { ok: true }; // same answer whether or not the email exists
  },
  { auth: "none" },
);
