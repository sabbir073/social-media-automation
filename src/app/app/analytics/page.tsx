import Link from "next/link";
import { DateTime } from "luxon";
import { Empty, PlatformBadge } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { engagement, readMetrics } from "@/lib/metrics-format";

export const metadata = { title: "Analytics" };

const RANGES = [7, 30, 90];

export default async function Analytics({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const user = await requireUser();
  const zone = user.timezone;
  const days = RANGES.includes(Number((await searchParams).days)) ? Number((await searchParams).days) : 30;
  const since = DateTime.now().setZone(zone).startOf("day").minus({ days: days - 1 });
  const mine = { post: { userId: user.id } };

  const [published, failed, clicks] = await Promise.all([
    prisma.postTarget.findMany({
      where: { ...mine, status: "PUBLISHED", publishedAt: { gte: since.toJSDate() } },
      include: { account: true, post: true },
      orderBy: { publishedAt: "asc" },
    }),
    prisma.postTarget.count({ where: { ...mine, status: "FAILED", updatedAt: { gte: since.toJSDate() } } }),
    prisma.shortLink.aggregate({ where: { userId: user.id, createdAt: { gte: since.toJSDate() } }, _sum: { clicks: true } }),
  ]);

  const rows = published.map((t) => ({ t, m: readMetrics(t.metrics) }));
  const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((a, r) => a + f(r), 0);
  const total = published.length + failed;
  const stats = [
    ["Posts published", published.length.toLocaleString()],
    ["Success rate", total ? `${Math.round((published.length / total) * 100)}%` : "–"],
    ["Engagement", sum((r) => engagement(r.m)).toLocaleString()],
    ["Views", sum((r) => r.m.views).toLocaleString()],
    ["Link clicks", (clicks._sum.clicks ?? 0).toLocaleString()],
  ];

  // Posts per day.
  const perDay = new Map<string, number>();
  for (let i = 0; i < days; i++) perDay.set(since.plus({ days: i }).toISODate()!, 0);
  for (const { t } of rows) {
    const k = DateTime.fromJSDate(t.publishedAt!, { zone }).toISODate()!;
    perDay.set(k, (perDay.get(k) ?? 0) + 1);
  }
  const series = [...perDay.entries()];
  const peak = Math.max(1, ...series.map(([, n]) => n));

  // Per account.
  const accounts = new Map<string, { name: string; platform: string; posts: number; engagement: number; views: number }>();
  for (const { t, m } of rows) {
    const a = accounts.get(t.accountId) ?? { name: t.account.name, platform: t.account.platform, posts: 0, engagement: 0, views: 0 };
    a.posts++;
    a.engagement += engagement(m);
    a.views += m.views;
    accounts.set(t.accountId, a);
  }

  // Best hours: average engagement by local hour, for hours with at least 2 posts.
  const hours = new Map<number, { n: number; e: number }>();
  for (const { t, m } of rows) {
    const h = DateTime.fromJSDate(t.publishedAt!, { zone }).hour;
    const x = hours.get(h) ?? { n: 0, e: 0 };
    hours.set(h, { n: x.n + 1, e: x.e + engagement(m) });
  }
  const bestHours = [...hours.entries()]
    .filter(([, x]) => x.n >= 2 && x.e > 0)
    .map(([h, x]) => ({ h, avg: x.e / x.n, n: x.n }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 3);

  const top = [...rows].sort((a, b) => engagement(b.m) - engagement(a.m)).filter((r) => engagement(r.m) > 0).slice(0, 5);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="h1">Analytics</h1>
        <div className="flex gap-1" role="group" aria-label="Date range">
          {RANGES.map((r) => (
            <Link key={r} href={`/app/analytics?days=${r}`} aria-current={r === days ? "true" : undefined} className={r === days ? "btn py-1.5" : "btn-secondary"}>
              {r} days
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {stats.map(([label, value]) => (
          <div key={label} className="card">
            <p className="text-2xl font-semibold tabular-nums">{value}</p>
            <p className="muted mt-1">{label}</p>
          </div>
        ))}
      </div>

      {published.length === 0 ? (
        <Empty title={`Nothing was published in the last ${days} days`}>Numbers appear here once your posts go out.</Empty>
      ) : (
        <>
          <section className="card">
            <h2 className="mb-4 font-semibold">Posts published per day</h2>
            <div className="flex h-36 items-end gap-px" role="img" aria-label={`Posts per day over the last ${days} days, peak ${peak}`}>
              {series.map(([day, n]) => (
                <div key={day} className="group relative flex h-full flex-1 items-end" title={`${DateTime.fromISO(day).toFormat("d LLL")}: ${n} post${n === 1 ? "" : "s"}`}>
                  <div className={`w-full rounded-t ${n ? "bg-brand-500" : "bg-slate-100"}`} style={{ height: `${n ? Math.max(6, (n / peak) * 100) : 2}%` }} />
                </div>
              ))}
            </div>
            <div className="muted mt-2 flex justify-between text-xs">
              <span>{since.toFormat("d LLL")}</span>
              <span>Peak: {peak} a day</span>
              <span>Today</span>
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="card overflow-x-auto p-0">
              <h2 className="p-5 pb-3 font-semibold">By account</h2>
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs text-slate-600">
                  <tr>
                    <th scope="col" className="px-5 py-2">Account</th>
                    <th scope="col" className="px-3 py-2 text-right">Posts</th>
                    <th scope="col" className="px-3 py-2 text-right">Engagement</th>
                    <th scope="col" className="px-5 py-2 text-right">Views</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[...accounts.values()].sort((a, b) => b.engagement - a.engagement).map((a) => (
                    <tr key={a.name + a.platform}>
                      <td className="px-5 py-2"><span className="flex items-center gap-2"><PlatformBadge platform={a.platform} /><span className="truncate">{a.name}</span></span></td>
                      <td className="px-3 py-2 text-right tabular-nums">{a.posts}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{a.engagement.toLocaleString()}</td>
                      <td className="px-5 py-2 text-right tabular-nums">{a.views.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="card space-y-3">
              <h2 className="font-semibold">Best times to post</h2>
              {bestHours.length === 0 ? (
                <p className="muted">Not enough data yet. This needs at least two posts with engagement in the same hour of the day.</p>
              ) : (
                <ol className="space-y-2 text-sm">
                  {bestHours.map((b) => (
                    <li key={b.h} className="flex items-center justify-between">
                      <span className="font-medium tabular-nums">{String(b.h).padStart(2, "0")}:00 – {String((b.h + 1) % 24).padStart(2, "0")}:00</span>
                      <span className="muted">{Math.round(b.avg).toLocaleString()} average engagement over {b.n} posts</span>
                    </li>
                  ))}
                </ol>
              )}
              <p className="muted text-xs">Based on your own posts in this period, in {zone}. Add these hours on the Schedules page.</p>
            </section>
          </div>

          <section>
            <h2 className="mb-3 text-lg font-semibold">Top posts</h2>
            {top.length === 0 ? (
              <Empty title="No engagement numbers yet">They are fetched from each network about once an hour.</Empty>
            ) : (
              <ul className="card divide-y divide-slate-100 p-0">
                {top.map(({ t, m }) => (
                  <li key={t.id} className="flex flex-wrap items-center gap-3 p-4">
                    <PlatformBadge platform={t.account.platform} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{t.post.title || t.captionOverride || t.post.caption || "(no text)"}</p>
                      <p className="muted text-xs">
                        {t.account.name} · {DateTime.fromJSDate(t.publishedAt!, { zone }).toFormat("d LLL, HH:mm")} ·{" "}
                        {Object.entries(m).filter(([, v]) => v > 0).map(([k, v]) => `${v.toLocaleString()} ${k}`).join(" · ")}
                      </p>
                    </div>
                    <Link href={`/app/compose?from=${t.postId}`} className="btn-secondary">Post again</Link>
                    {t.externalUrl && <a href={t.externalUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary">View</a>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
      <p className="muted text-xs">Engagement is likes, comments, shares and saves as reported by each network. Link clicks count your tracked short links.</p>
    </div>
  );
}
