import { prisma } from "@/lib/db";
import { body, handler } from "@/lib/http";
import { planSchema } from "@/lib/billing/plan-schema";

export const PATCH = handler<{ id: string }>(
  async ({ req, params }) => {
    const data = await body(req, planSchema);
    await prisma.plan.update({ where: { id: params.id }, data });
  },
  { auth: "admin" },
);
