import { PLATFORM_META } from "@/lib/platforms";

export function PlatformBadge({ platform }: { platform: string }) {
  const m = PLATFORM_META[platform] ?? PLATFORM_META.MOCK;
  return (
    <span
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white ${m.color}`}
      title={m.label}
      aria-label={m.label}
    >
      {m.short}
    </span>
  );
}

const STATUS_STYLE: Record<string, string> = {
  CONNECTED: "bg-emerald-50 text-emerald-700",
  NEEDS_REAUTH: "bg-amber-50 text-amber-800",
  ERROR: "bg-red-50 text-red-700",
  SCHEDULED: "bg-brand-50 text-brand-700",
  QUEUED: "bg-brand-50 text-brand-700",
  PUBLISHING: "bg-brand-50 text-brand-700",
  PUBLISHED: "bg-emerald-50 text-emerald-700",
  FAILED: "bg-red-50 text-red-700",
  CANCELED: "bg-slate-100 text-slate-600",
  ACTIVE: "bg-emerald-50 text-emerald-700",
  TRIALING: "bg-brand-50 text-brand-700",
  EXPIRED: "bg-red-50 text-red-700",
  PENDING: "bg-amber-50 text-amber-800",
  PAID: "bg-emerald-50 text-emerald-700",
  REJECTED: "bg-red-50 text-red-700",
};

const STATUS_LABEL: Record<string, string> = {
  CONNECTED: "Connected",
  NEEDS_REAUTH: "Reconnect needed",
  ERROR: "Error",
  QUEUED: "Publishing",
  PUBLISHING: "Publishing",
  TRIALING: "Free trial",
};

export function StatusBadge({ status }: { status: string }) {
  const label = STATUS_LABEL[status] ?? status.charAt(0) + status.slice(1).toLowerCase();
  return <span className={`badge ${STATUS_STYLE[status] ?? "bg-slate-100 text-slate-600"}`}>{label}</span>;
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
      <p className="font-medium text-slate-800">{title}</p>
      {children && <div className="muted mt-1">{children}</div>}
    </div>
  );
}

export function money(cents: number, currency: string) {
  return new Intl.NumberFormat("en", { style: "currency", currency, minimumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
}
