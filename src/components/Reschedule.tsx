"use client";

import { DateTime } from "luxon";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";

const F = "yyyy-MM-dd'T'HH:mm";

export function Reschedule({ id, current, timezone }: { id: string; current: string; timezone: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [when, setWhen] = useState(() => DateTime.fromISO(current).setZone(timezone).toFormat(F));
  const [error, setError] = useState("");

  if (!open) return <button type="button" className="btn-secondary" onClick={() => setOpen(true)}>Change time</button>;
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const dt = DateTime.fromFormat(when, F, { zone: timezone });
        if (!dt.isValid || dt.toMillis() < Date.now()) return setError("Choose a time in the future");
        try {
          await api("PATCH", `/api/targets/${id}`, { action: "reschedule", scheduledAt: dt.toUTC().toISO() });
          setOpen(false);
          router.refresh();
        } catch (err) {
          setError((err as Error).message);
        }
      }}
    >
      <input type="datetime-local" className="input w-auto" value={when} onChange={(e) => setWhen(e.target.value)} aria-label="New date and time" required />
      <button className="btn-secondary">Save</button>
      <button type="button" className="text-sm text-slate-500 hover:underline" onClick={() => setOpen(false)}>Cancel</button>
      {error && <span role="alert" className="text-xs text-red-600">{error}</span>}
    </form>
  );
}
