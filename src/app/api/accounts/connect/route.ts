import { z } from "zod";
import { saveConnectedAccounts } from "@/lib/accounts";
import { requireActiveSubscription } from "@/lib/billing/entitlements";
import { body, handler, HttpError } from "@/lib/http";
import { providerBySlug } from "@/lib/providers";
import { rateLimit } from "@/lib/redis";

const schema = z.object({ platform: z.string().max(20), values: z.record(z.string().max(500)) });

/** Connects a token-based network (Bluesky, Telegram, Mastodon) from a form. */
export const POST = handler(async ({ req, user }) => {
  const sub = await requireActiveSubscription(user.id);
  const data = await body(req, schema);
  const provider = providerBySlug(data.platform);
  if (!provider?.connectWithCredentials || !provider.credentialFields) throw new HttpError(400, "This network connects differently");
  for (const f of provider.credentialFields) {
    if (!data.values[f.name]?.trim()) throw new HttpError(400, `Enter ${f.label.toLowerCase()}`);
  }
  if (!(await rateLimit(`connect:${user.id}`, 20, 600))) throw new HttpError(429, "Too many attempts. Try again in a few minutes.");
  let found;
  try {
    found = await provider.connectWithCredentials(data.values);
  } catch (e) {
    throw new HttpError(400, (e as Error).message || "Could not connect");
  }
  const { saved, skipped } = await saveConnectedAccounts(user.id, sub.plan.maxAccounts, provider.platform, found);
  if (saved === 0 && skipped > 0) throw new HttpError(402, "Your plan's account limit is reached");
  return { saved };
});
