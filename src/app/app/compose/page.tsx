import Link from "next/link";
import { Composer } from "@/components/Composer";
import { Empty } from "@/components/ui";
import { aiEnabled } from "@/lib/ai";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const metadata = { title: "New post" };

export default async function Compose({ searchParams }: { searchParams: Promise<{ from?: string; media?: string; draft?: string }> }) {
  const user = await requireUser();
  const q = await searchParams;
  const [accounts, snippets, source, picked] = await Promise.all([
    prisma.socialAccount.findMany({
      where: { userId: user.id },
      orderBy: [{ platform: "asc" }, { name: "asc" }],
      include: { _count: { select: { slots: true } } },
    }),
    prisma.snippet.findMany({ where: { userId: user.id }, orderBy: { name: "asc" } }),
    // "Duplicate" on the Posts page opens the composer pre-filled from an existing post.
    q.from
      ? prisma.post.findFirst({ where: { id: q.from, userId: user.id }, include: { media: { orderBy: { position: "asc" }, include: { media: true } } } })
      : null,
    q.media ? prisma.mediaAsset.findFirst({ where: { id: q.media, userId: user.id } }) : null,
  ]);
  const draft = q.draft ? await prisma.draft.findFirst({ where: { id: q.draft, userId: user.id } }) : null;
  const draftMedia = draft?.mediaIds.length ? await prisma.mediaAsset.findMany({ where: { userId: user.id, id: { in: draft.mediaIds } } }) : [];
  const toMedia = (m: { id: string; kind: "IMAGE" | "VIDEO"; originalName: string; key: string }) => ({ id: m.id, kind: m.kind, name: m.originalName, url: `/media/${m.key}` });
  const initial = draft
    ? { caption: draft.caption, title: draft.title, link: draft.link, media: draft.mediaIds.map((id) => draftMedia.find((m) => m.id === id)).filter((m) => !!m).map((m) => toMedia(m)) }
    : source
    ? { caption: source.caption, title: source.title, link: source.link, media: source.media.map((pm) => toMedia(pm.media)) }
    : picked
      ? { caption: "", title: "", link: "", media: [toMedia(picked)] }
      : undefined;
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="h1">New post</h1>
        <p className="muted mt-1">Write once, then give every account its own date and time. Times are in {user.timezone}.</p>
      </div>
      {accounts.length === 0 ? (
        <Empty title="Connect an account first">
          <Link href="/app/accounts" className="text-brand-600 underline">Go to Accounts</Link>
        </Empty>
      ) : (
        <Composer
          timezone={user.timezone}
          aiEnabled={aiEnabled()}
          initial={initial}
          draftId={draft?.id}
          snippets={snippets.map((s) => ({ id: s.id, name: s.name, body: s.body }))}
          accounts={accounts.map((a) => ({
            id: a.id,
            name: a.name,
            platform: a.platform,
            healthy: a.status === "CONNECTED",
            hasSlots: a._count.slots > 0,
          }))}
        />
      )}
    </div>
  );
}
