import { z } from "zod";
import { randomToken } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { body, handler, HttpError } from "@/lib/http";
import { assertPublicUrl } from "@/lib/ssrf";

const schema = z.object({
  notifyFailures: z.boolean(),
  utmEnabled: z.boolean(),
  utmCampaign: z.string().trim().max(60).regex(/^[\w.-]*$/, "Use letters, numbers, dots, dashes or underscores"),
  shortLinks: z.boolean(),
  weeklyReport: z.boolean(),
  brandVoice: z.string().trim().max(600),
  webhookUrl: z.union([z.literal(""), z.string().trim().url("Enter a full https:// address").max(1000)]),
});

export const PATCH = handler(async ({ req, user }) => {
  const data = await body(req, schema);
  if (data.webhookUrl) {
    await assertPublicUrl(data.webhookUrl).catch((e: Error) => {
      throw new HttpError(400, `Webhook address: ${e.message}`);
    });
  }
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      ...data,
      webhookUrl: data.webhookUrl || null,
      webhookSecret: data.webhookUrl ? (user.webhookSecret ?? `whsec_${randomToken(24)}`) : user.webhookSecret,
    },
  });
  return { webhookSecret: updated.webhookUrl ? updated.webhookSecret : null };
});
