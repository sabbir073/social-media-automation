import Link from "next/link";
import { ActionButton } from "@/components/ActionButton";
import { FeedForm } from "@/components/SimpleForms";
import { Empty } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatInZone } from "@/lib/slots";

export const metadata = { title: "RSS auto-post" };

export default async function Feeds() {
  const user = await requireUser();
  const [feeds, accounts] = await Promise.all([
    prisma.feed.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, include: { _count: { select: { items: true } } } }),
    prisma.socialAccount.findMany({ where: { userId: user.id }, orderBy: [{ platform: "asc" }, { name: "asc" }] }),
  ]);
  const names = new Map(accounts.map((a) => [a.id, a.name]));
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="h1">RSS auto-post</h1>
        <p className="muted mt-1">
          Connect a blog, news site, podcast or YouTube channel feed and every new item is posted to your accounts
          automatically. Feeds are checked every 15 minutes; items already in the feed when you connect it are not posted.
        </p>
      </div>
      {accounts.length === 0 ? (
        <Empty title="Connect an account first"><Link href="/app/accounts" className="text-brand-600 underline">Go to Accounts</Link></Empty>
      ) : (
        <FeedForm accounts={accounts.map((a) => ({ id: a.id, name: a.name, platform: a.platform }))} />
      )}
      <p className="muted text-xs">
        Instagram and Pinterest need an image, so items without one are skipped there. YouTube cannot be used as a
        target because it only accepts videos.
      </p>
      {feeds.length > 0 && (
        <ul className="card divide-y divide-slate-100 p-0">
          {feeds.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{f.title}</p>
                <p className="muted truncate text-xs">{f.url}</p>
                <p className="muted text-xs">
                  To {f.accountIds.map((id) => names.get(id)).filter(Boolean).join(", ") || "no accounts"} ·{" "}
                  {f.mode === "slot" ? "next free slot" : "immediately"} ·{" "}
                  {!f.enabled ? "Paused" : f.lastCheckedAt ? `checked ${formatInZone(f.lastCheckedAt, user.timezone)}` : "not checked yet"}
                </p>
                {f.lastError && <p className="text-xs text-red-700">{f.lastError}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                <ActionButton method="POST" url={`/api/feeds/${f.id}`}>Check now</ActionButton>
                <ActionButton method="PATCH" url={`/api/feeds/${f.id}`} body={{ enabled: !f.enabled }}>{f.enabled ? "Pause" : "Resume"}</ActionButton>
                <ActionButton method="DELETE" url={`/api/feeds/${f.id}`} className="btn-danger" confirm="Disconnect this feed?">Remove</ActionButton>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
