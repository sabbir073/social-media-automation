import { requireActiveSubscription } from "@/lib/billing/entitlements";
import { handler, HttpError } from "@/lib/http";
import { importCsv } from "@/lib/sheets";

export const maxDuration = 300;

/** Bulk scheduling: the request body is a CSV file in the Google Sheets column layout. */
export const POST = handler(async ({ req, user }) => {
  await requireActiveSubscription(user.id);
  const csv = await req.text();
  if (csv.length > 2_000_000) throw new HttpError(413, "The CSV file is too large");
  const results = await importCsv(user.id, csv);
  return { scheduled: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok) };
});
