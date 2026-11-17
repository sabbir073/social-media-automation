"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { DAYS } from "@/lib/platforms";

type Slot = { dayOfWeek: number; time: string };

export function SlotEditor({ accountId, initial }: { accountId: string; initial: Slot[] }) {
  const [slots, setSlots] = useState<Slot[]>(initial);
  const [day, setDay] = useState("0");
  const [time, setTime] = useState("09:00");
  const [state, setState] = useState<"idle" | "dirty" | "saving" | "saved">("idle");
  const [error, setError] = useState("");

  const sorted = [...slots].sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.time.localeCompare(b.time));

  function add() {
    const days = day === "0" ? [1, 2, 3, 4, 5, 6, 7] : day === "8" ? [1, 2, 3, 4, 5] : [Number(day)];
    setSlots((s) => {
      const next = [...s];
      for (const d of days) if (!next.some((x) => x.dayOfWeek === d && x.time === time)) next.push({ dayOfWeek: d, time });
      return next;
    });
    setState("dirty");
  }

  async function save() {
    setState("saving");
    setError("");
    try {
      await api("PUT", `/api/accounts/${accountId}/slots`, { slots });
      setState("saved");
    } catch (e) {
      setError((e as Error).message);
      setState("dirty");
    }
  }

  return (
    <div className="space-y-3">
      {sorted.length === 0 ? (
        <p className="muted">No posting times yet.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {sorted.map((s) => (
            <li key={`${s.dayOfWeek}-${s.time}`} className="badge gap-1 bg-slate-100 py-1 text-slate-700">
              {DAYS[s.dayOfWeek - 1].slice(0, 3)} {s.time}
              <button
                type="button"
                aria-label={`Remove ${DAYS[s.dayOfWeek - 1]} ${s.time}`}
                className="ml-1 text-slate-400 hover:text-red-600"
                onClick={() => {
                  setSlots((all) => all.filter((x) => !(x.dayOfWeek === s.dayOfWeek && x.time === s.time)));
                  setState("dirty");
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <select className="input w-auto" value={day} onChange={(e) => setDay(e.target.value)} aria-label="Day">
          <option value="0">Every day</option>
          <option value="8">Weekdays</option>
          {DAYS.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
        </select>
        <input type="time" className="input w-auto" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Time" required />
        <button type="button" className="btn-secondary" onClick={add}>Add time</button>
        <button type="button" className="btn" onClick={save} disabled={state !== "dirty"}>
          {state === "saving" ? "Saving…" : state === "saved" ? "Saved" : "Save"}
        </button>
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
