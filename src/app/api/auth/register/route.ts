import { z } from "zod";
import { createSession, hashPassword } from "@/lib/auth";
import { startTrial } from "@/lib/billing/entitlements";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { body, handler, HttpError } from "@/lib/http";
import { rateLimit } from "@/lib/redis";
import { clientIp } from "@/lib/request";
import { isValidZone } from "@/lib/slots";

const schema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(8, "Use at least 8 characters").max(200),
  timezone: z.string().max(64).optional(),
});

export const POST = handler(
  async ({ req }) => {
    if (!(await rateLimit(`register:${clientIp(req)}`, 10, 3600))) throw new HttpError(429, "Too many attempts. Try again later.");
    const data = await body(req, schema);
    if (await prisma.user.findUnique({ where: { email: data.email } })) {
      throw new HttpError(409, "An account with this email already exists");
    }
    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        passwordHash: await hashPassword(data.password),
        timezone: data.timezone && isValidZone(data.timezone) ? data.timezone : "UTC",
        role: env.adminEmail && data.email === env.adminEmail ? "ADMIN" : "USER",
      },
    });
    await startTrial(user.id);
    await createSession(user.id);
    return { ok: true };
  },
  { auth: "none" },
);
