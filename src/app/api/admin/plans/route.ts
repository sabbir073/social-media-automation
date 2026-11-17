import { z } from "zod";
import { prisma } from "@/lib/db";
import { planSchema } from "@/lib/billing/plan-schema";
import { body, handler, HttpError } from "@/lib/http";

export const POST = handler(
  async ({ req }) => {
    const data = await body(req, planSchema);
    const slug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "plan";
    if (await prisma.plan.findUnique({ where: { slug } })) throw new HttpError(409, "A plan with this name already exists");
    await prisma.plan.create({ data: { ...data, slug } });
  },
  { auth: "admin" },
);
