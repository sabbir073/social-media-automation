import { requireActiveSubscription } from "@/lib/billing/entitlements";
import { prisma } from "@/lib/db";
import { handler, HttpError } from "@/lib/http";
import { rateLimit } from "@/lib/redis";
import { syncSheet } from "@/lib/sheets";

export const maxDuration = 300;

export const POST = handler<{ id: string }>(async ({ params, user }) => {
  await requireActiveSubscription(user.id);
  const sheet = await prisma.sheetConnection.findFirst({ where: { id: params.id, userId: user.id } });
  if (!sheet) throw new HttpError(404, "Sheet not found");
  if (!(await rateLimit(`sheet-sync:${sheet.id}`, 6, 60))) throw new HttpError(429, "Please wait a moment before syncing again");
  try {
    return { summary: await syncSheet(sheet.id) };
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
});
