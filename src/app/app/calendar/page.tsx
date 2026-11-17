import Link from "next/link";
import { DateTime } from "luxon";
import { CalendarGrid } from "@/components/CalendarGrid";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const metadata = { title: "Calendar" };

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
      <CalendarGrid
        timezone={zone}
        days={days.map((d) => ({
          date: d.toISODate()!,
          day: d.day,
          outside: d.month !== month.month,
          today: d.toISODate() === today,
          past: d.toISODate()! < today!,
          items: (byDay.get(d.toISODate()!) ?? []).map((t) => ({
            id: t.id,
            time: DateTime.fromJSDate(t.publishedAt ?? t.scheduledAt, { zone }).toFormat("HH:mm"),
            status: t.status,
            platform: t.account.platform,
            account: t.account.name,
            text: t.captionOverride || t.post.caption || t.post.title,
          })),
        }))}
      />
      <p className="muted flex flex-wrap gap-4 text-xs">
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-brand-500" />Scheduled</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500" />Published</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-red-500" />Failed</span>
        <span>Times are in {zone}. Drag a scheduled post to another day to move it.</span>
      </p>
    </div>
  );
}
