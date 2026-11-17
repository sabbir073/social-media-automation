import { NextRequest, NextResponse } from "next/server";
import { activateSubscription, cancelSubscription } from "@/lib/billing/entitlements";
import { getGateway } from "@/lib/billing/gateway";
import { prisma } from "@/lib/db";

/** Receives gateway webhooks. The gateway verifies the signature and returns normalized events. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  let events;
  try {
    events = await getGateway(provider).handleWebhook(await req.text(), req.headers);
  } catch (e) {
    console.warn(`[billing] rejected ${provider} webhook: ${(e as Error).message}`);
    return NextResponse.json({ error: "Invalid webhook" }, { status: 400 });
  }
  for (const ev of events) {
    if (ev.type === "paid") {
      // The unique (provider, reference) index makes redelivered webhooks harmless.
      const fresh = await prisma.payment
        .create({
          data: { userId: ev.userId, planId: ev.planId, amountCents: ev.amountCents, currency: ev.currency, provider, reference: ev.reference, status: "PAID", reviewedAt: new Date() },
        })
        .then(() => true)
        .catch(() => false);
      if (fresh) await activateSubscription(ev.userId, ev.planId, { provider, providerRef: ev.reference, periodEnd: ev.periodEnd });
    } else {
      await cancelSubscription(ev.userId);
    }
  }
  return NextResponse.json({ ok: true });
}
