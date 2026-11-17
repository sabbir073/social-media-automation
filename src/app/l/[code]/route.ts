import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/** Tracked short link: counts the click, then redirects. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const link = await prisma.shortLink.findUnique({ where: { code } });
  if (!link || !/^https?:\/\//i.test(link.url)) return new Response("Link not found", { status: 404 });
  await prisma.shortLink.update({ where: { id: link.id }, data: { clicks: { increment: 1 } } }).catch(() => {});
  return NextResponse.redirect(link.url, { status: 302, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}
