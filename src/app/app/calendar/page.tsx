import Link from "next/link";
import { DateTime } from "luxon";
import { PlatformBadge } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const metadata = { title: "Calendar" };

const DOT: Record<string, string> = {
  PUBLISHED: "bg-emerald-500",
  FAILED: "bg-red-500",
  CANCELED: "bg-slate-300",
};

export default async function Calendar({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const user = await requireUser();
  const zone = user.timezone;
  const requested = DateTime.fromFormat((await searchParams).m ?? "", "yyyy-MM", { zone });
  const month = (requested.isValid ? requested : DateTime.now().setZone(zone)).startOf("month");
  const gridStart = month.minus({ days: month.weekday - 1 });
  const gridEnd = month.endOf("month").plus({ days: 7 - month.endOf("month").weekday }).endOf("day");

  const targets = await prisma.postTarget.findMany({
    where: { post: { userId: user.id }, status: { not: "CANCELED" }, scheduledAt: { gte: gridStart.toJSDate(), lte: gridEnd.toJSDate() } },
    orderBy: { scheduledAt: "asc" },
    include: { account: true, post: true },
  });
  const byDay = new Map<string, typeof targets>();
  for (const t of targets) {
    const key = DateTime.fromJSDate(t.publishedAt ?? t.scheduledAt, { zone }).toISODate()!;
    byDay.set(key, [...(byDay.get(key) ?? []), t]);
  }
  const days: DateTime[] = [];
  for (let d = gridStart; d <= gridEnd; d = d.plus({ days: 1 })) days.push(d);
  const today = DateTime.now().setZone(zone).toISODate();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="h1">{month.toFormat("LLLL yyyy")}</h1>
        <div className="flex items-center gap-2">
          <Link className="btn-secondary" href={`/app/calendar?m=${month.minus({ months: 1 }).toFormat("yyyy-MM")}`}>Previous</Link>
          <Link className="btn-secondary" href="/app/calendar">Today</Link>
          <Link className="btn-secondary" href={`/app/calendar?m=${month.plus({ months: 1 }).toFormat("yyyy-MM")}`}>Next</Link>
          <Link className="btn" href="/app/compose">New post</Link>
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="grid min-w-[840px] grid-cols-7 overflow-hidden rounded-xl border border-slate-200 bg-slate-200 gap-px">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d} className="bg-slate-50 px-2 py-1.5 text-xs font-medium text-slate-600">{d}</div>
          ))}
          {days.map((d) => {
            const items = byDay.get(d.toISODate()!) ?? [];
            const outside = d.month !== month.month;
            return (
              <div key={d.toISODate()} className={`min-h-28 p-1.5 ${outside ? "bg-slate-50" : "bg-white"}`}>
                <p className={`mb-1 text-xs tabular-nums ${d.toISODate() === today ? "inline-block rounded-full bg-brand-600 px-1.5 font-semibold text-white" : outside ? "text-slate-400" : "text-slate-600"}`}>
                  {d.day}
                </p>
                <ul className="space-y-1">
                  {items.slice(0, 4).map((t) => (
                    <li key={t.id}>
                      <Link
                        href={`/app/posts?tab=${t.status === "PUBLISHED" ? "published" : t.status === "FAILED" ? "failed" : "upcoming"}`}
                        className="flex items-center gap-1 rounded-md border border-slate-200 px-1 py-0.5 text-[11px] leading-tight hover:border-brand-500"
                        title={`${t.account.name}: ${t.captionOverride || t.post.caption || t.post.title}`}
                      >
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT[t.status] ?? "bg-brand-500"}`} aria-label={t.status.toLowerCase()} />
                        <span className="shrink-0 tabular-nums text-slate-500">{DateTime.fromJSDate(t.publishedAt ?? t.scheduledAt, { zone }).toFormat("HH:mm")}</span>
                        <span className="scale-[0.6] -mx-1.5 -my-2"><PlatformBadge platform={t.account.platform} /></span>
                        <span className="truncate">{t.captionOverride || t.post.caption || t.post.title || "(no text)"}</span>
                      </Link>
                    </li>
                  ))}
                  {items.length > 4 && <li className="muted text-[11px]">+{items.length - 4} more</li>}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
      <p className="muted flex flex-wrap gap-4 text-xs">
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-brand-500" />Scheduled</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500" />Published</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-red-500" />Failed</span>
        <span>Times are in {zone}.</span>
      </p>
    </div>
  );
}
