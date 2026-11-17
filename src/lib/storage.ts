import { createWriteStream } from "node:fs";
import { mkdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { randomToken } from "./crypto";
import { env } from "./env";

export const ALLOWED_MIME: Record<string, { ext: string; kind: "IMAGE" | "VIDEO" }> = {
  "image/jpeg": { ext: "jpg", kind: "IMAGE" },
  "image/png": { ext: "png", kind: "IMAGE" },
  "image/webp": { ext: "webp", kind: "IMAGE" },
  "video/mp4": { ext: "mp4", kind: "VIDEO" },
  "video/quicktime": { ext: "mov", kind: "VIDEO" },
};

const KEY_RE = /^[A-Za-z0-9_-]{20,}\.(jpg|png|webp|mp4|mov)$/;

export function filePath(key: string): string {
  if (!KEY_RE.test(key)) throw new Error("Invalid media key");
  return path.resolve(env.uploadDir, key);
}

/** Public URL the social networks fetch media from. Keys are unguessable. */
export function publicUrl(key: string): string {
  return `${env.appUrl}/media/${key}`;
}

export function mimeForKey(key: string): string {
  const ext = key.split(".").pop();
  return Object.entries(ALLOWED_MIME).find(([, v]) => v.ext === ext)?.[0] ?? "application/octet-stream";
}

export class TooLargeError extends Error {}

/** Streams a body to disk, enforcing the size cap while writing. */
export async function saveStream(
  source: ReadableStream<Uint8Array> | Readable,
  mime: string,
  maxBytes = env.maxUploadBytes,
): Promise<{ key: string; size: number }> {
  const info = ALLOWED_MIME[mime];
  if (!info) throw new Error(`Unsupported file type ${mime}`);
  await mkdir(path.resolve(env.uploadDir), { recursive: true });
  const key = `${randomToken(24)}.${info.ext}`;
  const dest = filePath(key);
  let size = 0;
  const limiter = new Transform({
    transform(chunk, _enc, cb) {
      size += chunk.length;
      if (size > maxBytes) cb(new TooLargeError("File is too large"));
      else cb(null, chunk);
    },
  });
  const readable = source instanceof Readable ? source : Readable.fromWeb(source as never);
  try {
    await pipeline(readable, limiter, createWriteStream(dest));
  } catch (e) {
    await unlink(dest).catch(() => {});
    throw e;
  }
  if (size === 0) {
    await unlink(dest).catch(() => {});
    throw new Error("Empty file");
  }
  return { key, size };
}

export async function removeFile(key: string) {
  await unlink(filePath(key)).catch(() => {});
}

export async function fileSize(key: string): Promise<number> {
  return (await stat(filePath(key))).size;
}
