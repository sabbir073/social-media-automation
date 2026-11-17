import { z } from "zod";
import { prisma } from "@/lib/db";
import { body, handler, HttpError } from "@/lib/http";

const schema = z.object({
  slots: z
    .array(z.object({ dayOfWeek: z.number().int().min(1).max(7), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/) }))
    .max(200),
});

/** Replaces the weekly posting times of one account. */
export const PUT = handler<{ id: string }>(async ({ req, params, user }) => {
  const account = await prisma.socialAccount.findFirst({ where: { id: params.id, userId: user.id } });
  if (!account) throw new HttpError(404, "Account not found");
  const { slots } = await body(req, schema);
  const unique = [...new Map(slots.map((s) => [`${s.dayOfWeek}-${s.time}`, s])).values()];
  await prisma.$transaction([
    prisma.timeSlot.deleteMany({ where: { accountId: account.id } }),
    prisma.timeSlot.createMany({ data: unique.map((s) => ({ accountId: account.id, ...s })) }),
  ]);
  return { ok: true, count: unique.length };
});
