"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";

type Plan = { id: string; name: string; description: string; price: string; maxAccounts: number; maxPostsPerMonth: number; maxSheets: number };

export function PlanPicker({ plans, currentPlanId }: { plans: Plan[]; currentPlanId: string | null }) {
  const router = useRouter();
  const [chosen, setChosen] = useState<Plan | null>(null);
  const [instructions, setInstructions] = useState("");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function choose(plan: Plan) {
    setMsg(null);
    setBusy(true);
    try {
      const r = await api<{ type: "redirect"; url: string } | { type: "manual"; instructions: string }>("POST", "/api/billing/checkout", { planId: plan.id });
      if (r.type === "redirect") {
        window.location.href = r.url;
        return;
      }
      setChosen(plan);
      setInstructions(r.instructions);
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!chosen) return;
    setBusy(true);
    setMsg(null);
    try {
      await api("POST", "/api/billing/payments", { planId: chosen.id, reference });
      setMsg({ ok: true, text: "Thanks. Your plan starts as soon as the payment is confirmed." });
      setChosen(null);
      setReference("");
      router.refresh();
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((p) => (
          <div key={p.id} className={`card flex flex-col ${chosen?.id === p.id ? "border-brand-500" : ""}`}>
            <h3 className="font-semibold">{p.name}</h3>
            <p className="muted text-xs">{p.description}</p>
            <p className="mt-3 text-2xl font-semibold">{p.price}<span className="muted text-sm font-normal"> / month</span></p>
            <ul className="mt-3 flex-1 space-y-1 text-sm text-slate-700">
              <li>{p.maxAccounts} connected accounts</li>
              <li>{p.maxPostsPerMonth.toLocaleString()} scheduled posts a month</li>
              <li>{p.maxSheets} Google Sheet{p.maxSheets === 1 ? "" : "s"}</li>
            </ul>
            <button type="button" className="btn mt-4" disabled={busy} onClick={() => choose(p)}>
              {currentPlanId === p.id ? "Renew" : "Choose"} {p.name}
            </button>
          </div>
        ))}
      </div>
      {chosen && (
        <form onSubmit={submit} className="card space-y-3">
          <h3 className="font-semibold">Pay for {chosen.name} ({chosen.price})</h3>
          <p className="text-sm whitespace-pre-line text-slate-700">{instructions}</p>
          <div>
            <label className="label" htmlFor="reference">Transaction ID</label>
            <input id="reference" className="input max-w-sm" value={reference} onChange={(e) => setReference(e.target.value)} required minLength={4} maxLength={100} />
          </div>
          <button className="btn" disabled={busy}>{busy ? "Sending…" : "Submit payment"}</button>
        </form>
      )}
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.text}</p>}
    </div>
  );
}
