import { z } from "zod";
import { requireActiveSubscription } from "@/lib/billing/entitlements";
import { prisma } from "@/lib/db";
import { body, handler, HttpError } from "@/lib/http";
import { connectSheet, parseSheetUrl, syncSheet } from "@/lib/sheets";

export const maxDuration = 300;

export const POST = handler(async ({ req, user }) => {
  const { url } = await body(req, z.object({ url: z.string().trim().min(10).max(500) }));
  const sub = await requireActiveSubscription(user.id);
  const parsed = parseSheetUrl(url);
  const exists = parsed && (await prisma.sheetConnection.findFirst({ where: { userId: user.id, ...parsed } }));
  if (!exists && (await prisma.sheetConnection.count({ where: { userId: user.id } })) >= sub.plan.maxSheets) {
    throw new HttpError(402, `Your ${sub.plan.name} plan allows ${sub.plan.maxSheets} connected sheet(s)`);
  }
  const sheet = await connectSheet(user.id, url);
  const summary = await syncSheet(sheet.id).catch((e: Error) => `Sync failed: ${e.message}`);
  return { id: sheet.id, summary };
});
