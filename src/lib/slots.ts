import { DateTime } from "luxon";

export type Slot = { dayOfWeek: number; time: string };

/**
 * Next free times from a weekly slot list, in the owner's timezone.
 * `taken` holds epoch-millis of times already used on the same account.
 */
export function nextSlots(slots: Slot[], zone: string, taken: Set<number>, from: Date, count = 1): Date[] {
  const out: Date[] = [];
  if (slots.length === 0) return out;
  const start = DateTime.fromJSDate(from, { zone });
  if (!start.isValid) return out;
  for (let d = 0; d < 370 && out.length < count; d++) {
    const day = start.plus({ days: d });
    const todays = slots.filter((s) => s.dayOfWeek === day.weekday).sort((a, b) => a.time.localeCompare(b.time));
    for (const s of todays) {
      const [hour, minute] = s.time.split(":").map(Number);
      const at = DateTime.fromObject({ year: day.year, month: day.month, day: day.day, hour, minute }, { zone });
      if (!at.isValid) continue; // e.g. a time skipped by a DST change
      const ms = at.toMillis();
      if (ms <= from.getTime() || taken.has(ms)) continue;
      out.push(at.toJSDate());
      taken.add(ms);
      if (out.length >= count) break;
    }
  }
  return out;
}

export function isValidZone(zone: string): boolean {
  return DateTime.local().setZone(zone).isValid;
}

export function formatInZone(date: Date, zone: string): string {
  return DateTime.fromJSDate(date, { zone }).toFormat("ccc d LLL yyyy, HH:mm");
}
