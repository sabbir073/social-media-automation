"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";

type PlanOption = { id: string; name: string };

export function GrantForm({ userId, plans }: { userId: string; plans: PlanOption[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setError("");
        try {
          await api("POST", `/api/admin/users/${userId}/subscription`, { planId: f.get("planId"), days: Number(f.get("days")) });
          router.refresh();
        } catch (err) {
          setError((err as Error).message);
        }
      }}
    >
      <select name="planId" className="input w-auto py-1" aria-label="Plan">
        {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <input name="days" type="number" min={1} max={3660} defaultValue={30} className="input w-20 py-1" aria-label="Days" />
      <button className="btn-secondary">Grant</button>
      {error && <span role="alert" className="text-xs text-red-600">{error}</span>}
    </form>
  );
}

export type PlanRow = {
  id?: string;
  name: string;
  description: string;
  priceCents: number;
  currency: string;
  maxAccounts: number;
  maxPostsPerMonth: number;
  maxSheets: number;
  isActive: boolean;
  sortOrder: number;
};

const BLANK: PlanRow = { name: "", description: "", priceCents: 1000, currency: "USD", maxAccounts: 5, maxPostsPerMonth: 100, maxSheets: 1, isActive: true, sortOrder: 10 };

export function PlanForm({ plan }: { plan?: PlanRow }) {
  const router = useRouter();
  const [p, setP] = useState<PlanRow>(plan ?? BLANK);
  const [msg, setMsg] = useState("");
  const num = (k: keyof PlanRow) => ({
    type: "number" as const,
    className: "input py-1",
    value: p[k] as number,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setP({ ...p, [k]: Number(e.target.value) }),
  });
  return (
    <form
      className="grid grid-cols-2 items-end gap-2 border-t border-slate-100 p-4 text-xs md:grid-cols-9"
      onSubmit={async (e) => {
        e.preventDefault();
        setMsg("");
        try {
          const { id, ...data } = p;
          await api(id ? "PATCH" : "POST", id ? `/api/admin/plans/${id}` : "/api/admin/plans", data);
          setMsg("Saved");
          if (!id) setP(BLANK);
          router.refresh();
        } catch (err) {
          setMsg((err as Error).message);
        }
      }}
    >
      <label>Name<input className="input py-1" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} required /></label>
      <label className="md:col-span-2">Description<input className="input py-1" value={p.description} onChange={(e) => setP({ ...p, description: e.target.value })} /></label>
      <label>Price (cents)<input {...num("priceCents")} min={0} /></label>
      <label>Currency<input className="input py-1" value={p.currency} maxLength={3} onChange={(e) => setP({ ...p, currency: e.target.value.toUpperCase() })} required /></label>
      <label>Accounts<input {...num("maxAccounts")} min={1} /></label>
      <label>Posts / month<input {...num("maxPostsPerMonth")} min={1} /></label>
      <label>Sheets<input {...num("maxSheets")} min={0} /></label>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1"><input type="checkbox" checked={p.isActive} onChange={(e) => setP({ ...p, isActive: e.target.checked })} />On sale</label>
        <button className="btn-secondary">{p.id ? "Save" : "Add"}</button>
      </div>
      {msg && <p role="status" className="col-span-full text-xs text-slate-600">{msg}</p>}
    </form>
  );
}
