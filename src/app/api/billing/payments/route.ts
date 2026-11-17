import { z } from "zod";
import { prisma } from "@/lib/db";
import { body, handler, HttpError } from "@/lib/http";

const schema = z.object({ planId: z.string(), reference: z.string().trim().min(4, "Enter the transaction ID").max(100) });

/** Manual gateway: the user reports a payment; an admin verifies and approves it. */
export const POST = handler(async ({ req, user }) => {
  const data = await body(req, schema);
  const plan = await prisma.plan.findFirst({ where: { id: data.planId, isActive: true } });
  if (!plan) throw new HttpError(404, "Plan not found");
  if (await prisma.payment.count({ where: { userId: user.id, status: "PENDING" } }) >= 3) {
    throw new HttpError(429, "You already have payments waiting for review");
  }
  try {
    await prisma.payment.create({
      data: { userId: user.id, planId: plan.id, amountCents: plan.priceCents, currency: plan.currency, provider: "manual", reference: data.reference },
    });
  } catch {
    throw new HttpError(409, "This transaction ID was already submitted");
  }
});
