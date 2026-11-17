"use client";

import Link from "next/link";
import { DateTime } from "luxon";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { PLATFORM_META } from "@/lib/platforms";

export type CalItem = { id: string; time: string; status: string; platform: string; account: string; text: string };
export type CalDay = { date: string; day: number; outside: boolean; today: boolean; past: boolean; items: CalItem[] };

const DOT: Record<string, string> = { PUBLISHED: "bg-emerald-500", FAILED: "bg-red-500" };

/** Month grid. Scheduled posts can be dragged to another day; they keep their time of day. */
export function CalendarGrid({ days, timezone }: { days: CalDay[]; timezone: string }) {
  const router = useRouter();
  const [over, setOver] = useState("");
  const [error, setError] = useState("");

  async function move(id: string, time: string, date: string) {
    setError("");
    const when = DateTime.fromFormat(`${date} ${time}`, "yyyy-MM-dd HH:mm", { zone: timezone });
    if (!when.isValid || when.toMillis() < Date.now()) return setError("Posts can only be moved to a time in the future.");
    try {
      await api("PATCH", `/api/targets/${id}`, { action: "reschedule", scheduledAt: when.toUTC().toISO() });
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <div className="overflow-x-auto">
        <div className="grid min-w-[840px] grid-cols-7 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d} className="bg-slate-50 px-2 py-1.5 text-xs font-medium text-slate-600">{d}</div>
          ))}
          {days.map((d) => (
            <div
              key={d.date}
              onDragOver={(e) => {
                if (d.past) return;
                e.preventDefault();
                setOver(d.date);
              }}
              onDragLeave={() => setOver((o) => (o === d.date ? "" : o))}
              onDrop={(e) => {
                e.preventDefault();
                setOver("");
                const [id, time, from] = e.dataTransfer.getData("text/plain").split("|");
                if (id && from !== d.date) void move(id, time, d.date);
              }}
              className={`min-h-28 p-1.5 ${over === d.date ? "bg-brand-50 ring-2 ring-brand-500 ring-inset" : d.outside ? "bg-slate-50" : "bg-white"}`}
            >
              <p className={`mb-1 text-xs tabular-nums ${d.today ? "inline-block rounded-full bg-brand-600 px-1.5 font-semibold text-white" : d.outside ? "text-slate-400" : "text-slate-600"}`}>{d.day}</p>
              <ul className="space-y-1">
                {d.items.slice(0, 5).map((t) => {
                  const movable = t.status === "SCHEDULED";
                  return (
                    <li key={t.id}>
                      <Link
                        href={`/app/posts?tab=${t.status === "PUBLISHED" ? "published" : t.status === "FAILED" ? "failed" : "upcoming"}`}
                        draggable={movable}
                        onDragStart={(e) => e.dataTransfer.setData("text/plain", `${t.id}|${t.time}|${d.date}`)}
                        className={`flex items-center gap-1 rounded-md border border-slate-200 px-1 py-0.5 text-[11px] leading-tight hover:border-brand-500 ${movable ? "cursor-grab active:cursor-grabbing" : ""}`}
                        title={`${t.account}: ${t.text}${movable ? " (drag to another day to move)" : ""}`}
                      >
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT[t.status] ?? "bg-brand-500"}`} />
                        <span className="shrink-0 text-slate-500 tabular-nums">{t.time}</span>
                        <span className={`shrink-0 rounded px-1 text-[9px] font-bold text-white ${PLATFORM_META[t.platform]?.color ?? "bg-slate-600"}`}>{PLATFORM_META[t.platform]?.short ?? "?"}</span>
                        <span className="truncate">{t.text || "(no text)"}</span>
                      </Link>
                    </li>
                  );
                })}
                {d.items.length > 5 && <li className="muted text-[11px]">+{d.items.length - 5} more</li>}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
