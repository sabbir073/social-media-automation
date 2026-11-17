import { z } from "zod";
import { createSession, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { body, handler, HttpError } from "@/lib/http";
import { rateLimit } from "@/lib/redis";
import { clientIp } from "@/lib/request";

const schema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(200) });
// Compared against when the email is unknown, so response time does not reveal which emails exist.
const DUMMY_HASH = "$2b$12$2/RdWU1fyfyodkOOeI3O.u04T91r8Lm3VRytri575uYNT9TdHTKh.";

export const POST = handler(
  async ({ req }) => {
    const data = await body(req, schema);
    if (!(await rateLimit(`login:${clientIp(req)}:${data.email}`, 10, 900))) {
      throw new HttpError(429, "Too many attempts. Try again in 15 minutes.");
    }
    const user = await prisma.user.findUnique({ where: { email: data.email } });
    const ok = await verifyPassword(data.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) throw new HttpError(401, "Wrong email or password");
    await createSession(user.id);
    return { ok: true };
  },
  { auth: "none" },
);
