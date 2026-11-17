"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";

type Account = { id: string; name: string; platform: string; hasSlots: boolean };

/** Turns one topic into several ready-to-edit posts, generated one at a time. */
export function Planner({ accounts }: { accounts: Account[] }) {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [count, setCount] = useState(5);
  const [posts, setPosts] = useState<string[]>([]);
  const [progress, setProgress] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const account = accounts.find((a) => a.id === accountId);

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    setPosts([]);
    try {
      setProgress("Thinking of ideas…");
      const r = await api<{ text: string }>("POST", "/api/ai", { action: "angles", text: `${count} ideas about: ${topic}` });
      const angles = r.text.split("\n").map((l) => l.replace(/^[\s\-*•\d.)]+/, "").trim()).filter((l) => l.length > 3).slice(0, count);
      if (angles.length === 0) throw new Error("The AI did not return any ideas. Try a more specific topic.");
      for (const [i, angle] of angles.entries()) {
        setProgress(`Writing post ${i + 1} of ${angles.length}…`);
        const p = await api<{ text: string }>("POST", "/api/ai", { action: "write", text: `Topic: ${topic}\nAngle: ${angle}`, platform: account?.platform });
        setPosts((all) => [...all, p.text]);
      }
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setProgress("");
      setBusy(false);
    }
  }

  async function saveDrafts() {
    setBusy(true);
    try {
      for (const caption of posts.filter((p) => p.trim())) await api("POST", "/api/drafts", { caption });
      router.push("/app/drafts");
      router.refresh();
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
      setBusy(false);
    }
  }

  async function scheduleAll() {
    if (!account) return;
    setBusy(true);
    setMsg(null);
    let done = 0;
    try {
      for (const caption of posts.filter((p) => p.trim())) {
        const slot = await api<{ scheduledAt: string }>("GET", `/api/accounts/${account.id}/next-slot`);
        await api("POST", "/api/posts", { caption, targets: [{ accountId: account.id, scheduledAt: slot.scheduledAt }] });
        done++;
      }
      router.push("/app/calendar");
      router.refresh();
    } catch (err) {
      setMsg({ ok: false, text: `${done} scheduled, then: ${(err as Error).message}` });
      setPosts((all) => all.filter((p) => p.trim()).slice(done));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={generate} className="card space-y-4">
        <div>
          <label className="label" htmlFor="pl-topic">What do you want to post about?</label>
          <textarea id="pl-topic" className="input min-h-20" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Our winter collection launch: wool coats, 20% off this week, free delivery in Dhaka" required minLength={5} maxLength={1000} />
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="label" htmlFor="pl-account">Write for</label>
            <select id="pl-account" className="input w-auto" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="pl-count">Posts</label>
            <select id="pl-count" className="input w-auto" value={count} onChange={(e) => setCount(Number(e.target.value))}>
              {[3, 5, 7].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <button className="btn" disabled={busy}>{busy && progress ? progress : "Plan my posts"}</button>
        </div>
        <p className="muted text-xs">Posts are written one at a time, so they appear as they finish. A model running on your own computer can take a minute per post.</p>
      </form>

      {posts.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Review and edit</h2>
          {posts.map((p, i) => (
            <div key={i} className="card flex gap-3 p-3">
              <span className="muted mt-2 w-5 shrink-0 text-right text-sm tabular-nums">{i + 1}</span>
              <textarea className="input min-h-28 flex-1" value={p} onChange={(e) => setPosts((all) => all.map((x, j) => (j === i ? e.target.value : x)))} aria-label={`Post ${i + 1}`} />
              <button type="button" className="btn-danger self-start" onClick={() => setPosts((all) => all.filter((_, j) => j !== i))} aria-label={`Remove post ${i + 1}`}>×</button>
            </div>
          ))}
          {!busy && (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn" onClick={saveDrafts}>Save all as drafts</button>
              {account?.hasSlots ? (
                <button type="button" className="btn-secondary px-4 py-2" onClick={scheduleAll}>Schedule all to {account.name}'s next free slots</button>
              ) : (
                <span className="muted text-xs">Set posting times for {account?.name} on the Schedules page to schedule them all in one click.</span>
              )}
            </div>
          )}
        </section>
      )}
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.text}</p>}
    </div>
  );
}
