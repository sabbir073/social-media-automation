import { z } from "zod";
import { getGateway } from "@/lib/billing/gateway";
import { prisma } from "@/lib/db";
import { body, handler, HttpError } from "@/lib/http";

export const POST = handler(async ({ req, user }) => {
  const { planId } = await body(req, z.object({ planId: z.string() }));
  const plan = await prisma.plan.findFirst({ where: { id: planId, isActive: true } });
  if (!plan) throw new HttpError(404, "Plan not found");
  return getGateway().createCheckout(user, plan);
});
