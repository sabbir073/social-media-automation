import { NextResponse } from "next/server";
import { requireActiveSubscription } from "@/lib/billing/entitlements";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { handler, HttpError } from "@/lib/http";
import { ALLOWED_MIME, saveStream, TooLargeError } from "@/lib/storage";

export const maxDuration = 600;

/** The user's media library, newest first. */
export const GET = handler(async ({ user }) => {
  const media = await prisma.mediaAsset.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 200 });
  return { media: media.map((m) => ({ id: m.id, kind: m.kind, name: m.originalName, url: `/media/${m.key}` })) };
});

/** Raw-body upload (the file is the request body) so large videos stream straight to disk. */
export const PUT = handler(async ({ req, user }) => {
  await requireActiveSubscription(user.id);
  const mime = (req.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const info = ALLOWED_MIME[mime];
  if (!info) throw new HttpError(415, "Upload a JPG, PNG, WEBP, MP4 or MOV file");
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > env.maxUploadBytes) throw new HttpError(413, `Files can be at most ${Math.round(env.maxUploadBytes / 1048576)} MB`);
  if (!req.body) throw new HttpError(400, "Empty upload");
  let saved;
  try {
    saved = await saveStream(req.body, mime);
  } catch (e) {
    if (e instanceof TooLargeError) throw new HttpError(413, `Files can be at most ${Math.round(env.maxUploadBytes / 1048576)} MB`);
    throw new HttpError(400, (e as Error).message);
  }
  let name = "upload";
  try {
    name = decodeURIComponent(req.headers.get("x-filename") ?? "upload").slice(0, 120);
  } catch {}
  const asset = await prisma.mediaAsset.create({
    data: { userId: user.id, key: saved.key, mime, size: saved.size, kind: info.kind, originalName: name },
  });
  return NextResponse.json({ id: asset.id, kind: asset.kind, name: asset.originalName, url: `/media/${asset.key}` });
});
