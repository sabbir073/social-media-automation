/**
 * Pluggable payment gateway layer.
 *
 * The app only talks to the `PaymentGateway` interface. Ship with "manual" (user submits a
 * transaction reference, an admin approves it). To add Paddle, SSLCommerz, bKash, Stripe, etc.:
 *   1. Implement `PaymentGateway` below (createCheckout + handleWebhook).
 *   2. Register it in `gateways`.
 *   3. Set BILLING_PROVIDER=<its id> and point the provider's webhook at
 *      {APP_URL}/api/billing/webhook/<its id>.
 * The webhook route turns the returned events into subscription changes, so a gateway never
 * touches the database itself.
 */
import type { Plan, User } from "@prisma/client";
import { env } from "../env";

export type Checkout =
  | { type: "redirect"; url: string }
  | { type: "manual"; instructions: string };

export type BillingEvent =
  | { type: "paid"; userId: string; planId: string; reference: string; amountCents: number; currency: string; periodEnd?: Date }
  | { type: "canceled"; userId: string };

export interface PaymentGateway {
  id: string;
  createCheckout(user: User, plan: Plan): Promise<Checkout>;
  /** Must verify the provider's signature and throw if it is invalid. */
  handleWebhook(rawBody: string, headers: Headers): Promise<BillingEvent[]>;
}

const manual: PaymentGateway = {
  id: "manual",
  async createCheckout() {
    return { type: "manual", instructions: env.billingInstructions };
  },
  async handleWebhook() {
    throw new Error("The manual gateway has no webhooks");
  },
};

const gateways: Record<string, PaymentGateway> = { manual };

export function getGateway(id = env.billingProvider): PaymentGateway {
  const g = gateways[id];
  if (!g) throw new Error(`Unknown billing provider "${id}"`);
  return g;
}
