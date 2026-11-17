import { cancelSubscription } from "@/lib/billing/entitlements";
import { handler } from "@/lib/http";

export const POST = handler(async ({ user }) => {
  await cancelSubscription(user.id);
});
