import { ActionButton } from "@/components/ActionButton";
import { SheetConnect } from "@/components/SheetConnect";
import { BulkUpload } from "@/components/SimpleForms";
import { Empty } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { serviceAccount, SHEET_COLUMNS } from "@/lib/sheets";
import { formatInZone } from "@/lib/slots";

export const metadata = { title: "Google Sheets" };

const EXAMPLE = [
  ["facebook", "2027-01-15", "09:30", "New arrivals are here!", "https://example.com/photo.jpg", "", "https://example.com/shop", "", "", ""],
  ["instagram: mybrand", "2027-01-15", "18:00", "New arrivals ✨ #style", "https://example.com/photo.jpg", "", "", "", "", ""],
  ["youtube", "2027-01-16", "20:00", "Full lookbook walkthrough", "https://example.com/video.mp4", "Winter lookbook", "", "", "public", ""],
  ["pinterest", "2027-01-17", "11:00", "Winter outfit ideas", "https://example.com/pin.jpg", "Winter outfits", "https://example.com/shop", "Outfit ideas", "", ""],
];

export default async function Sheets() {
  const user = await requireUser();
  const sheets = await prisma.sheetConnection.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
  const sa = serviceAccount();
  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <h1 className="h1">Sheets and bulk upload</h1>
        <p className="muted mt-1">
          Plan posts in a spreadsheet. Each row is one post to one account at its own date and time, so every network
          can follow a different timetable. The sheet is checked every 5 minutes.
        </p>
      </div>

      <section className="card space-y-4">
        <h2 className="font-semibold">How to set it up</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
          <li>Create a sheet whose first row has exactly these column names (see the example below).</li>
          <li>
            {sa ? (
              <>
                Click Share in Google Sheets and add <strong className="break-all">{sa.client_email}</strong> as an{" "}
                <strong>Editor</strong>. Editor access lets the status column be filled in for you; Viewer also works,
                without status updates.
              </>
            ) : (
              <>Click Share in Google Sheets and set General access to <strong>Anyone with the link</strong> (Viewer).</>
            )}
          </li>
          <li>Paste the sheet link below. Dates and times are read in your timezone, {user.timezone}.</li>
        </ol>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600">
              <tr>{SHEET_COLUMNS.map((c) => <th key={c} scope="col" className="px-3 py-2 font-mono font-medium">{c}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {EXAMPLE.map((row, i) => (
                <tr key={i}>{row.map((cell, j) => <td key={j} className="max-w-40 truncate px-3 py-2 text-slate-700">{cell}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
          <li><strong>account</strong>: the network name (facebook, instagram, youtube, pinterest), an account name, or “network: account name” if you have several.</li>
          <li><strong>date</strong> as YYYY-MM-DD and <strong>time</strong> as HH:MM (24-hour). Rows dated in the past are skipped.</li>
          <li><strong>media_url</strong>: direct links to JPG, PNG, WEBP, MP4 or MOV files, separated by commas. Public Google Drive file links also work.</li>
          <li><strong>title</strong> is required for YouTube; <strong>board</strong> is required for Pinterest; <strong>privacy</strong> (public, unlisted, private) is for YouTube.</li>
          <li>Leave <strong>status</strong> empty. Editing a row before it publishes updates the post; deleting the row cancels it.</li>
        </ul>
        <SheetConnect />
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">Bulk upload a CSV file</h2>
        <p className="text-sm text-slate-700">
          Schedule up to 500 posts at once. Use the same columns as above (in any spreadsheet app, export as CSV).
          Each row is scheduled once; rows with problems are listed so you can fix and upload them again.
        </p>
        <BulkUpload />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Connected sheets</h2>
        {sheets.length === 0 ? (
          <Empty title="No sheets connected yet" />
        ) : (
          <ul className="card divide-y divide-slate-100 p-0">
            {sheets.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <a
                    href={`https://docs.google.com/spreadsheets/d/${s.spreadsheetId}/edit#gid=${s.gid}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-brand-700 hover:underline"
                  >
                    {s.title}
                  </a>
                  <p className={`text-xs ${s.lastError ? "text-red-700" : "text-slate-500"}`}>
                    {!s.enabled && "Paused. "}
                    {s.lastError
                      ? s.lastError
                      : s.lastSyncedAt
                        ? `Synced ${formatInZone(s.lastSyncedAt, user.timezone)}: ${s.lastSummary ?? ""}`
                        : "Not synced yet"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <ActionButton method="POST" url={`/api/sheets/${s.id}/sync`}>Sync now</ActionButton>
                  <ActionButton method="PATCH" url={`/api/sheets/${s.id}`} body={{ enabled: !s.enabled }}>
                    {s.enabled ? "Pause" : "Resume"}
                  </ActionButton>
                  <ActionButton
                    method="DELETE"
                    url={`/api/sheets/${s.id}`}
                    className="btn-danger"
                    confirm="Disconnect this sheet? Posts it already scheduled will stay scheduled."
                  >
                    Disconnect
                  </ActionButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
