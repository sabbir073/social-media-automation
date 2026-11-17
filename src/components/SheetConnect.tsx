"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";

export function SheetConnect() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMsg(null);
        try {
          const r = await api<{ summary: string }>("POST", "/api/sheets", { url });
          setMsg({ ok: true, text: `Connected. ${r.summary}` });
          setUrl("");
          router.refresh();
        } catch (err) {
          setMsg({ ok: false, text: (err as Error).message });
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="label" htmlFor="sheet-url">Google Sheet link</label>
      <div className="flex flex-wrap gap-2">
        <input id="sheet-url" className="input min-w-0 flex-1" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" required />
        <button className="btn" disabled={busy}>{busy ? "Connecting…" : "Connect sheet"}</button>
      </div>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.text}</p>}
    </form>
  );
}
