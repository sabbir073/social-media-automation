import { z } from "zod";
import { aiEnabled, generate } from "@/lib/ai";
import { requireActiveSubscription } from "@/lib/billing/entitlements";
import { body, handler, HttpError } from "@/lib/http";
import { rateLimit } from "@/lib/redis";

export const maxDuration = 300;

const schema = z.object({
  action: z.enum(["write", "rewrite", "shorten", "hashtags", "angles"]),
  text: z.string().trim().min(3, "Write a few words first").max(5000),
  platform: z.string().max(20).optional(),
  tone: z.string().max(40).optional(),
});

export const POST = handler(async ({ req, user }) => {
  if (!aiEnabled()) throw new HttpError(503, "The AI assistant is not set up on this site");
  await requireActiveSubscription(user.id);
  const data = await body(req, schema);
  if (!(await rateLimit(`ai:${user.id}`, 60, 3600))) throw new HttpError(429, "AI limit reached for this hour. Try again later.");
  try {
    return { text: await generate(data.action, data.text, { ...data, brandVoice: user.brandVoice }) };
  } catch (e) {
    throw new HttpError(502, (e as Error).message);
  }
});
