import { z } from "zod";
import { activateSubscription } from "@/lib/billing/entitlements";
import { prisma } from "@/lib/db";
import { body, handler, HttpError } from "@/lib/http";

const schema = z.object({ planId: z.string(), days: z.number().int().min(1).max(3660) });

/** Grant or extend a subscription by hand (comped accounts, offline payments). */
export const POST = handler<{ id: string }>(
  async ({ req, params }) => {
    const data = await body(req, schema);
    const [user, plan] = await Promise.all([
      prisma.user.findUnique({ where: { id: params.id } }),
      prisma.plan.findUnique({ where: { id: data.planId } }),
    ]);
    if (!user || !plan) throw new HttpError(404, "User or plan not found");
    await activateSubscription(user.id, plan.id, { provider: "admin", days: data.days });
  },
  { auth: "admin" },
);

export const DELETE = handler<{ id: string }>(
  async ({ params }) => {
    await prisma.subscription.updateMany({ where: { userId: params.id }, data: { status: "EXPIRED", currentPeriodEnd: new Date() } });
  },
  { auth: "admin" },
);
