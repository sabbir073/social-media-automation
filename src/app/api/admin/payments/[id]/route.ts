import { z } from "zod";
import { activateSubscription } from "@/lib/billing/entitlements";
import { prisma } from "@/lib/db";
import { body, handler, HttpError } from "@/lib/http";

const schema = z.object({ action: z.enum(["approve", "reject"]), note: z.string().max(300).optional() });

export const POST = handler<{ id: string }>(
  async ({ req, params }) => {
    const data = await body(req, schema);
    const status = data.action === "approve" ? "PAID" : "REJECTED";
    // Only a PENDING payment can be decided, so a double click cannot grant two periods.
    const r = await prisma.payment.updateMany({
      where: { id: params.id, status: "PENDING" },
      data: { status, note: data.note ?? null, reviewedAt: new Date() },
    });
    if (r.count === 0) throw new HttpError(409, "This payment was already reviewed");
    if (status === "PAID") {
      const p = await prisma.payment.findUniqueOrThrow({ where: { id: params.id } });
      await activateSubscription(p.userId, p.planId, { provider: "manual", providerRef: p.reference, days: 30 });
    }
  },
  { auth: "admin" },
);
