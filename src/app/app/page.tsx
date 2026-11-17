import Link from "next/link";
import { Empty, PlatformBadge, StatusBadge } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatInZone } from "@/lib/slots";

export const metadata = { title: "Dashboard" };

export default async function Dashboard() {
  const user = await requireUser();
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const mine = { post: { userId: user.id } };
  const [accounts, scheduled, published, failed, upcoming, broken] = await Promise.all([
    prisma.socialAccount.count({ where: { userId: user.id } }),
    prisma.postTarget.count({ where: { ...mine, status: { in: ["SCHEDULED", "QUEUED", "PUBLISHING"] } } }),
    prisma.postTarget.count({ where: { ...mine, status: "PUBLISHED", publishedAt: { gte: monthStart } } }),
    prisma.postTarget.count({ where: { ...mine, status: "FAILED" } }),
    prisma.postTarget.findMany({
      where: { ...mine, status: "SCHEDULED" },
      orderBy: { scheduledAt: "asc" },
      take: 6,
      include: { account: true, post: true },
    }),
    prisma.socialAccount.findMany({ where: { userId: user.id, status: { not: "CONNECTED" } } }),
  ]);
  const stats = [
    { label: "Connected accounts", value: accounts, href: "/app/accounts" },
    { label: "Waiting to publish", value: scheduled, href: "/app/posts" },
    { label: "Published this month", value: published, href: "/app/posts?tab=published" },
    { label: "Failed", value: failed, href: "/app/posts?tab=failed" },
  ];
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="h1">Hello, {user.name.split(" ")[0]}</h1>
        <Link href="/app/compose" className="btn">New post</Link>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="card transition hover:border-brand-500">
            <p className="text-3xl font-semibold tabular-nums">{s.value}</p>
            <p className="muted mt-1">{s.label}</p>
          </Link>
        ))}
      </div>

      {broken.length > 0 && (
        <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <p className="font-medium text-amber-900">
            {broken.length} account{broken.length === 1 ? " needs" : "s need"} attention
          </p>
          <ul className="mt-2 space-y-1 text-sm text-amber-900">
            {broken.map((a) => (
              <li key={a.id}>{a.name}: {a.statusMessage ?? "connection problem"}</li>
            ))}
          </ul>
          <Link href="/app/accounts" className="mt-3 inline-block text-sm font-medium text-amber-900 underline">Fix on the Accounts page</Link>
        </div>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold">Coming up</h2>
        {upcoming.length === 0 ? (
          <Empty title="Nothing scheduled yet">
            {accounts === 0 ? (
              <Link href="/app/accounts" className="text-brand-600 underline">Connect your first account</Link>
            ) : (
              <Link href="/app/compose" className="text-brand-600 underline">Schedule your first post</Link>
            )}
          </Empty>
        ) : (
          <ul className="card divide-y divide-slate-100 p-0">
            {upcoming.map((t) => (
              <li key={t.id} className="flex items-center gap-3 p-4">
                <PlatformBadge platform={t.account.platform} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{t.captionOverride || t.post.caption || t.post.title || "(no text)"}</p>
                  <p className="muted truncate text-xs">{t.account.name} · {formatInZone(t.scheduledAt, user.timezone)}</p>
                </div>
                <StatusBadge status={t.status} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
