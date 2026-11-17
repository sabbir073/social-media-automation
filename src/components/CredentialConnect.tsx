"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";

type Field = { name: string; label: string; secret?: boolean; placeholder?: string; help?: string };

/** Connect form for networks that use a pasted token instead of an OAuth redirect. */
export function CredentialConnect({ platform, label, fields }: { platform: string; label: string; fields: Field[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!open) return <button type="button" className="btn-secondary shrink-0" onClick={() => setOpen(true)}>Connect</button>;
  return (
    <form
      className="mt-3 w-full basis-full space-y-3 border-t border-slate-100 pt-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          await api("POST", "/api/accounts/connect", { platform, values: Object.fromEntries(new FormData(e.currentTarget)) });
          setOpen(false);
          router.refresh();
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {fields.map((f) => (
        <div key={f.name}>
          <label className="label" htmlFor={`${platform}-${f.name}`}>{f.label}</label>
          <input id={`${platform}-${f.name}`} name={f.name} type={f.secret ? "password" : "text"} className="input" placeholder={f.placeholder} autoComplete="off" required />
          {f.help && <p className="muted mt-1 text-xs">{f.help}</p>}
        </div>
      ))}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button className="btn" disabled={busy}>{busy ? "Connecting…" : `Connect ${label}`}</button>
        <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}
