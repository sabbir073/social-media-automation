/**
 * Google Sheets scheduling. One sheet row = one post to one account at its own date and time.
 *
 * Access: if GOOGLE_SERVICE_ACCOUNT_B64 is set, users share the sheet with the service
 * account's email (Viewer to read, Editor to also get the status column written back).
 * Otherwise the sheet must be shared as "Anyone with the link can view" and is read as CSV.
 */
import type { SocialAccount } from "@prisma/client";
import { importPKCS8, SignJWT } from "jose";
import { DateTime } from "luxon";
import { sha256 } from "./crypto";
import { prisma } from "./db";
import { env } from "./env";
import { HttpError } from "./http";
import { createPost } from "./posts";
import { accountContext } from "./providers";
import { listBoards } from "./providers/pinterest";
import { safeFetch } from "./ssrf";
import { ALLOWED_MIME, removeFile, saveStream } from "./storage";

export const SHEET_COLUMNS = ["account", "date", "time", "caption", "media_url", "title", "link", "board", "privacy", "status"];
const MAX_ROWS = 500;
const PAST_GRACE_MS = 15 * 60_000;
/** Remembers rows that failed so an unchanged bad row is not re-downloaded on every sync. */
const failedRows = new Map<string, { hash: string; status: string; at: number }>();
const FAILED_TTL_MS = 6 * 3_600_000;

// ---------- parsing helpers (pure, unit-tested) ----------

export function parseSheetUrl(input: string): { spreadsheetId: string; gid: string } | null {
  const m = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/);
  if (!m) return null;
  const gid = input.match(/[#?&]gid=(\d+)/)?.[1] ?? "0";
  return { spreadsheetId: m[1], gid };
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

const DATE_FORMATS = ["yyyy-MM-dd", "yyyy/MM/dd", "d/M/yyyy", "d-M-yyyy", "d.M.yyyy", "d LLL yyyy", "d LLLL yyyy"];
const TIME_FORMATS = ["H:mm", "H:mm:ss", "h:mm a", "h:mm:ss a", "h a"];

/** Reads a date and time as wall-clock time in `zone`. Slash dates are day/month/year. */
export function parseWhen(date: string, time: string, zone: string): Date | null {
  const d = date.trim();
  const t = time.trim().toUpperCase() || "09:00";
  for (const df of DATE_FORMATS) {
    for (const tf of TIME_FORMATS) {
      const dt = DateTime.fromFormat(`${d} ${t}`, `${df} ${tf}`, { zone, locale: "en" });
      if (dt.isValid) return dt.toJSDate();
    }
  }
  return null;
}

/** Turns a Google Drive "share" link into a direct download link; other URLs pass through. */
export function directMediaUrl(url: string): string {
  const m = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=)([a-zA-Z0-9_-]{20,})/);
  return m ? `https://drive.google.com/uc?export=download&id=${m[1]}` : url;
}

/** Matches the sheet's "account" cell against the user's connected accounts. */
export function matchAccount<A extends Pick<SocialAccount, "id" | "name" | "username" | "platform">>(
  cell: string,
  accounts: A[],
): A | string {
  const raw = cell.trim();
  const q = raw.toLowerCase().replace(/^@/, "");
  const [maybePlatform, ...rest] = q.split(":");
  const named = rest.join(":").trim().replace(/^@/, "");
  const byName = (list: A[], name: string) =>
    list.filter((a) => a.name.toLowerCase() === name || (a.username ?? "").toLowerCase().replace(/^@/, "") === name);

  if (named) {
    const hits = byName(accounts.filter((a) => a.platform.toLowerCase() === maybePlatform.trim()), named);
    if (hits.length === 1) return hits[0];
    return hits.length ? `"${raw}" matches more than one account` : `No connected account matches "${raw}"`;
  }
  const onPlatform = accounts.filter((a) => a.platform.toLowerCase() === q);
  if (onPlatform.length === 1) return onPlatform[0];
  if (onPlatform.length > 1) return `You have several ${q} accounts; write it as "${q}: account name"`;
  const hits = byName(accounts, q);
  if (hits.length === 1) return hits[0];
  if (hits.length > 1) return `"${raw}" matches more than one account; write it as "platform: account name"`;
  return `No connected account matches "${raw}"`;
}

// ---------- Google access ----------

type ServiceAccount = { client_email: string; private_key: string };

export function serviceAccount(): ServiceAccount | null {
  if (!env.google.serviceAccountB64) return null;
  try {
    const sa = JSON.parse(Buffer.from(env.google.serviceAccountB64, "base64").toString("utf8"));
    return sa.client_email && sa.private_key ? sa : null;
  } catch {
    return null;
  }
}

let cachedToken: { token: string; exp: number } | null = null;

async function googleToken(sa: ServiceAccount): Promise<string> {
  if (cachedToken && cachedToken.exp > Date.now() + 60_000) return cachedToken.token;
  const key = await importPKCS8(sa.private_key, "RS256");
  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/spreadsheets" })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(sa.client_email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Google service account sign-in failed: ${json.error_description ?? json.error}`);
  cachedToken = { token: json.access_token, exp: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

type Fetched = { title: string; tab: string | null; rows: string[][] };

async function fetchRows(spreadsheetId: string, gid: string): Promise<Fetched> {
  const sa = serviceAccount();
  if (sa) {
    const headers = { Authorization: `Bearer ${await googleToken(sa)}` };
    const base = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;
    const metaRes = await fetch(`${base}?fields=properties.title,sheets.properties(sheetId,title)`, { headers });
    if (metaRes.status === 403 || metaRes.status === 404) {
      throw new Error(`Cannot open the sheet. Share it with ${sa.client_email} and try again.`);
    }
    if (!metaRes.ok) throw new Error(`Google Sheets error (HTTP ${metaRes.status})`);
    const meta = await metaRes.json();
    const tab = (meta.sheets ?? []).find((s: any) => String(s.properties.sheetId) === gid)?.properties.title;
    if (!tab) throw new Error("That tab no longer exists in the spreadsheet");
    const valRes = await fetch(`${base}/values/${encodeURIComponent(`'${tab.replace(/'/g, "''")}'`)}`, { headers });
    if (!valRes.ok) throw new Error(`Google Sheets error (HTTP ${valRes.status})`);
    const values = await valRes.json();
    return { title: `${meta.properties.title} / ${tab}`, tab, rows: values.values ?? [] };
  }
  const res = await fetch(
    `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`,
    { redirect: "follow" },
  );
  const type = res.headers.get("content-type") ?? "";
  if (!res.ok || !type.includes("csv")) {
    throw new Error('Cannot read the sheet. Set sharing to "Anyone with the link can view" and try again.');
  }
  return { title: "Google Sheet", tab: null, rows: parseCsv(await res.text()) };
}

async function writeStatuses(spreadsheetId: string, tab: string, statusCol: number, updates: Map<number, string>) {
  const sa = serviceAccount();
  if (!sa || updates.size === 0) return;
  const col = columnLetter(statusCol);
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await googleToken(sa)}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      valueInputOption: "RAW",
      data: [...updates].map(([row, value]) => ({
        range: `'${tab.replace(/'/g, "''")}'!${col}${row}`,
        values: [[value]],
      })),
    }),
  });
  // 403 just means the sheet was shared read-only; statuses stay visible in the app.
  if (!res.ok && res.status !== 403) console.warn(`[sheets] status write-back failed (HTTP ${res.status})`);
}

export function columnLetter(index: number): string {
  let s = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

// ---------- connect + sync ----------

export async function connectSheet(userId: string, url: string) {
  const parsed = parseSheetUrl(url);
  if (!parsed) throw new HttpError(400, "That does not look like a Google Sheets link");
  let fetched: Fetched;
  try {
    fetched = await fetchRows(parsed.spreadsheetId, parsed.gid);
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
  const header = (fetched.rows[0] ?? []).map((h) => h.trim().toLowerCase());
  for (const required of ["account", "date", "caption"]) {
    if (!header.includes(required)) {
      throw new HttpError(400, `The first row must contain these column names: ${SHEET_COLUMNS.join(", ")}. Missing "${required}".`);
    }
  }
  return prisma.sheetConnection.upsert({
    where: { userId_spreadsheetId_gid: { userId, ...parsed } },
    update: { title: fetched.title, enabled: true, lastError: null },
    create: { userId, ...parsed, title: fetched.title },
  });
}

export async function importMedia(userId: string, urls: string[]): Promise<string[]> {
  const ids: string[] = [];
  try {
    for (const raw of urls) {
      const res = await safeFetch(directMediaUrl(raw));
      if (!res.ok || !res.body) throw new Error(`Could not download ${raw} (HTTP ${res.status})`);
      const mime = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
      const info = ALLOWED_MIME[mime];
      if (!info) throw new Error(`${raw} is not a direct link to a JPG, PNG, WEBP, MP4 or MOV file`);
      const { key, size } = await saveStream(res.body, mime);
      const asset = await prisma.mediaAsset.create({
        data: { userId, key, mime, size, kind: info.kind, originalName: raw.split("/").pop()?.split("?")[0].slice(0, 120) || "sheet-media" },
      });
      ids.push(asset.id);
    }
    return ids;
  } catch (e) {
    await deleteMedia(ids);
    throw e;
  }
}

async function deleteMedia(ids: string[]) {
  if (!ids.length) return;
  const assets = await prisma.mediaAsset.findMany({ where: { id: { in: ids } } });
  await prisma.mediaAsset.deleteMany({ where: { id: { in: ids } } });
  for (const a of assets) await removeFile(a.key);
}

async function deletePostWithMedia(postId: string) {
  const media = await prisma.postMedia.findMany({ where: { postId }, select: { mediaId: true } });
  await prisma.post.delete({ where: { id: postId } });
  await deleteMedia(media.map((m) => m.mediaId));
}

function statusText(t: { status: string; externalUrl: string | null; error: string | null }): string {
  switch (t.status) {
    case "PUBLISHED":
      return t.externalUrl ? `Published: ${t.externalUrl}` : "Published";
    case "FAILED":
      return `Failed: ${t.error ?? "unknown error"}`;
    case "CANCELED":
      return "Canceled";
    default:
      return "Scheduled";
  }
}

export type RowContext = {
  userId: string;
  timezone: string;
  accounts: SocialAccount[];
  boardCache: Map<string, { id: string; name: string }[]>;
};

/**
 * Schedules one spreadsheet-style row (sheet sync and CSV bulk upload share this).
 * Throws an Error with a user-readable message when the row cannot be scheduled.
 */
export async function scheduleRow(ctx: RowContext, get: (column: string) => string, replacePostId?: string) {
  const acct = matchAccount(get("account"), ctx.accounts);
  if (typeof acct === "string") throw new Error(acct);
  const when = parseWhen(get("date"), get("time"), ctx.timezone);
  if (!when) throw new Error(`Cannot read date "${get("date")}" and time "${get("time")}". Use YYYY-MM-DD and HH:MM.`);
  if (when.getTime() < Date.now() - PAST_GRACE_MS) throw new Error("Date and time are in the past");

  const options: Record<string, unknown> = {};
  const boardName = get("board");
  if (acct.platform === "PINTEREST") {
    if (!boardName) throw new Error("Pinterest rows need a board name in the board column");
    if (!ctx.boardCache.has(acct.id)) ctx.boardCache.set(acct.id, await listBoards((await accountContext(acct)).accessToken));
    const board = ctx.boardCache.get(acct.id)!.find((b) => b.name.toLowerCase() === boardName.toLowerCase());
    if (!board) throw new Error(`No Pinterest board named "${boardName}"`);
    options.boardId = board.id;
    options.boardName = board.name;
  }
  const privacy = get("privacy").toLowerCase();
  if (acct.platform === "YOUTUBE" && privacy) options.privacy = privacy;

  const urls = get("media_url").split(/[\s,]+/).filter(Boolean).slice(0, 10);
  const mediaIds = await importMedia(ctx.userId, urls);
  try {
    if (replacePostId) await deletePostWithMedia(replacePostId);
    return await createPost(
      ctx.userId,
      {
        caption: get("caption"),
        title: get("title"),
        link: get("link"),
        mediaIds,
        targets: [{ accountId: acct.id, scheduledAt: when, options }],
      },
      "sheet",
    );
  } catch (e) {
    await deleteMedia(mediaIds);
    throw e;
  }
}

/** Schedules every row of an uploaded CSV that uses the sheet column layout. */
export async function importCsv(userId: string, csv: string) {
  const rows = parseCsv(csv.replace(/^\uFEFF/, ""));
  const header = (rows[0] ?? []).map((h) => h.trim().toLowerCase());
  for (const required of ["account", "date", "caption"]) {
    if (!header.includes(required)) throw new HttpError(400, `The first row must contain these column names: ${SHEET_COLUMNS.join(", ")}. Missing "${required}".`);
  }
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { accounts: true } });
  const ctx: RowContext = { userId, timezone: user.timezone, accounts: user.accounts, boardCache: new Map() };
  const results: { row: number; ok: boolean; message: string }[] = [];
  const body = rows.slice(1, MAX_ROWS + 1);
  for (let i = 0; i < body.length; i++) {
    const get = (name: string) => (header.indexOf(name) >= 0 ? (body[i][header.indexOf(name)] ?? "").trim() : "");
    if (!get("account") && !get("date") && !get("caption")) continue;
    try {
      await scheduleRow(ctx, get);
      results.push({ row: i + 2, ok: true, message: "Scheduled" });
    } catch (e) {
      results.push({ row: i + 2, ok: false, message: (e as Error).message });
    }
  }
  return results;
}

export async function syncSheet(sheetId: string): Promise<string> {
  const sheet = await prisma.sheetConnection.findUniqueOrThrow({
    where: { id: sheetId },
    include: { user: { include: { accounts: true } }, rows: { include: { post: { include: { targets: true } } } } },
  });
  try {
    const fetched = await fetchRows(sheet.spreadsheetId, sheet.gid);
    const header = (fetched.rows[0] ?? []).map((h) => h.trim().toLowerCase());
    const col = (name: string) => header.indexOf(name);
    const get = (row: string[], name: string) => (col(name) >= 0 ? (row[col(name)] ?? "").trim() : "");
    const statusCol = col("status");
    const boardCache = new Map<string, { id: string; name: string }[]>();
    const statuses = new Map<number, string>();
    let created = 0;
    let errors = 0;
    const known = new Map(sheet.rows.map((r) => [r.rowNumber, r]));
    const seen = new Set<number>();

    const body = fetched.rows.slice(1, MAX_ROWS + 1);
    for (let i = 0; i < body.length; i++) {
      const row = body[i];
      const rowNumber = i + 2; // 1-based, after the header
      const account = get(row, "account");
      const date = get(row, "date");
      if (!account && !date && !get(row, "caption")) continue;
      seen.add(rowNumber);

      const fields = ["account", "date", "time", "caption", "media_url", "title", "link", "board", "privacy"].map((n) => get(row, n));
      const hash = sha256(JSON.stringify(fields));
      const existing = known.get(rowNumber);
      const current = existing?.post.targets[0];
      let status: string;

      if (existing && current && (existing.contentHash === hash || current.status !== "SCHEDULED")) {
        // Unchanged, or already sent/in flight: report its state and never re-post it.
        status = statusText(current);
      } else if (
        !existing &&
        failedRows.get(`${sheet.id}:${rowNumber}`)?.hash === hash &&
        Date.now() - failedRows.get(`${sheet.id}:${rowNumber}`)!.at < FAILED_TTL_MS
      ) {
        errors++;
        status = failedRows.get(`${sheet.id}:${rowNumber}`)!.status;
      } else {
        try {
          const post = await scheduleRow(
            { userId: sheet.userId, timezone: sheet.user.timezone, accounts: sheet.user.accounts, boardCache },
            (name) => get(row, name),
            existing?.postId,
          );
          await prisma.sheetRow.create({ data: { sheetId: sheet.id, rowNumber, contentHash: hash, postId: post.id } });
          created++;
          status = "Scheduled";
          failedRows.delete(`${sheet.id}:${rowNumber}`);
        } catch (e) {
          errors++;
          status = `Error: ${(e as Error).message}`;
          failedRows.set(`${sheet.id}:${rowNumber}`, { hash, status, at: Date.now() });
        }
      }
      if (statusCol >= 0 && (row[statusCol] ?? "").trim() !== status) statuses.set(rowNumber, status);
    }

    // A row removed from the sheet cancels its post, as long as it has not started publishing.
    for (const r of sheet.rows) {
      if (!seen.has(r.rowNumber) && r.post.targets[0]?.status === "SCHEDULED") await deletePostWithMedia(r.postId);
    }

    if (fetched.tab && statusCol >= 0) await writeStatuses(sheet.spreadsheetId, fetched.tab, statusCol, statuses);
    const summary = `${created} new or updated, ${errors} with errors, ${body.length} rows read`;
    await prisma.sheetConnection.update({
      where: { id: sheet.id },
      data: { lastSyncedAt: new Date(), lastError: null, lastSummary: summary, title: fetched.title === "Google Sheet" ? sheet.title : fetched.title },
    });
    return summary;
  } catch (e) {
    const message = (e as Error).message.slice(0, 500);
    await prisma.sheetConnection.update({ where: { id: sheet.id }, data: { lastSyncedAt: new Date(), lastError: message } });
    throw new Error(message);
  }
}
