"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { PlatformBadge } from "./ui";

type Msg = { ok: boolean; text: string } | null;
const Note = ({ msg }: { msg: Msg }) =>
  msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm whitespace-pre-line ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.text}</p>;

export function SnippetForm() {
  const router = useRouter();
  const [msg, setMsg] = useState<Msg>(null);
  return (
    <form
      className="card space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        try {
          await api("POST", "/api/snippets", Object.fromEntries(new FormData(form)));
          form.reset();
          setMsg({ ok: true, text: "Saved" });
          router.refresh();
        } catch (err) {
          setMsg({ ok: false, text: (err as Error).message });
        }
      }}
    >
      <h2 className="font-semibold">New template</h2>
      <div>
        <label className="label" htmlFor="sn-name">Name</label>
        <input id="sn-name" name="name" className="input max-w-sm" placeholder="Fashion hashtags" required maxLength={60} />
      </div>
      <div>
        <label className="label" htmlFor="sn-body">Text</label>
        <textarea id="sn-body" name="body" className="input min-h-24" placeholder="#fashion #style #ootd" required maxLength={5000} />
      </div>
      <Note msg={msg} />
      <button className="btn">Save template</button>
    </form>
  );
}

export function BulkUpload() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  return (
    <div className="space-y-3">
      <label className="btn-secondary cursor-pointer">
        {busy ? "Scheduling…" : "Upload CSV file"}
        <input
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setBusy(true);
            setMsg(null);
            try {
              const res = await fetch("/api/bulk", { method: "POST", headers: { "Content-Type": "text/csv" }, body: await file.text() });
              const json = await res.json();
              if (!res.ok) throw new Error(json.error || "Upload failed");
              const failed = (json.failed as { row: number; message: string }[]).map((f) => `Row ${f.row}: ${f.message}`).join("\n");
              setMsg({ ok: json.failed.length === 0, text: `${json.scheduled} post(s) scheduled.${failed ? `\n${failed}` : ""}` });
              router.refresh();
            } catch (err) {
              setMsg({ ok: false, text: (err as Error).message });
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
      <Note msg={msg} />
    </div>
  );
}

type Account = { id: string; name: string; platform: string };

export function FeedForm({ accounts }: { accounts: Account[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  return (
    <form
      className="card space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const f = new FormData(form);
        setBusy(true);
        setMsg(null);
        try {
          const r = await api<{ summary: string }>("POST", "/api/feeds", {
            url: f.get("url"),
            mode: f.get("mode"),
            template: f.get("template"),
            accountIds: f.getAll("accountIds"),
          });
          form.reset();
          setMsg({ ok: true, text: `Connected: ${r.summary}. New items will be posted from now on.` });
          router.refresh();
        } catch (err) {
          setMsg({ ok: false, text: (err as Error).message });
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2 className="font-semibold">Connect a feed</h2>
      <div>
        <label className="label" htmlFor="feed-url">Feed address</label>
        <input id="feed-url" name="url" type="url" className="input" placeholder="https://yourblog.com/feed" required />
      </div>
      <fieldset>
        <legend className="label">Post new items to</legend>
        <div className="flex flex-wrap gap-3">
          {accounts.map((a) => (
            <label key={a.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
              <input type="checkbox" name="accountIds" value={a.id} className="h-4 w-4 accent-brand-600" />
              <PlatformBadge platform={a.platform} />
              {a.name}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="feed-mode">When</label>
          <select id="feed-mode" name="mode" className="input">
            <option value="slot">Next free posting slot of each account</option>
            <option value="now">As soon as the item appears</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="feed-template">Post text</label>
          <input id="feed-template" name="template" className="input" defaultValue="{title}" required maxLength={1000} />
          <p className="muted mt-1 text-xs">{"{title}"} and {"{link}"} are replaced. The article link is attached automatically.</p>
        </div>
      </div>
      <Note msg={msg} />
      <button className="btn" disabled={busy}>{busy ? "Checking feed…" : "Connect feed"}</button>
    </form>
  );
}

type BioLink = { label: string; url: string };

export function BioForm({ initial, baseUrl }: { initial: { slug: string; title: string; bio: string; links: BioLink[] } | null; baseUrl: string }) {
  const router = useRouter();
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [bio, setBio] = useState(initial?.bio ?? "");
  const [links, setLinks] = useState<BioLink[]>(initial?.links.length ? initial.links : [{ label: "", url: "" }]);
  const [msg, setMsg] = useState<Msg>(null);
  const set = (i: number, p: Partial<BioLink>) => setLinks((l) => l.map((x, j) => (j === i ? { ...x, ...p } : x)));
  return (
    <form
      className="card space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await api("PUT", "/api/bio", { slug, title, bio, links: links.filter((l) => l.label.trim() && l.url.trim()) });
          setMsg({ ok: true, text: "Saved. Your page is live." });
          router.refresh();
        } catch (err) {
          setMsg({ ok: false, text: (err as Error).message });
        }
      }}
    >
      <div>
        <label className="label" htmlFor="bio-slug">Page address</label>
        <div className="flex items-center gap-2">
          <span className="muted shrink-0">{baseUrl}/b/</span>
          <input id="bio-slug" className="input max-w-52" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} placeholder="yourbrand" required />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="bio-title">Title</label>
        <input id="bio-title" className="input max-w-sm" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={60} />
      </div>
      <div>
        <label className="label" htmlFor="bio-text">Short description</label>
        <textarea id="bio-text" className="input" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={300} />
      </div>
      <fieldset className="space-y-2">
        <legend className="label">Links</legend>
        {links.map((l, i) => (
          <div key={i} className="flex flex-wrap gap-2">
            <input className="input w-48" value={l.label} onChange={(e) => set(i, { label: e.target.value })} placeholder="Button text" aria-label={`Link ${i + 1} text`} maxLength={60} />
            <input className="input min-w-0 flex-1" type="url" value={l.url} onChange={(e) => set(i, { url: e.target.value })} placeholder="https://" aria-label={`Link ${i + 1} address`} />
            <button type="button" className="btn-secondary" disabled={i === 0} onClick={() => setLinks((all) => all.map((x, j) => (j === i - 1 ? all[i] : j === i ? all[i - 1] : x)))} aria-label={`Move link ${i + 1} up`}>↑</button>
            <button type="button" className="btn-danger" onClick={() => setLinks((all) => all.filter((_, j) => j !== i))} aria-label={`Remove link ${i + 1}`}>×</button>
          </div>
        ))}
        {links.length < 30 && <button type="button" className="btn-secondary" onClick={() => setLinks((l) => [...l, { label: "", url: "" }])}>Add link</button>}
      </fieldset>
      <Note msg={msg} />
      <button className="btn">Save page</button>
    </form>
  );
}

export function IntegrationsForm({ initial }: { initial: { notifyFailures: boolean; utmEnabled: boolean; utmCampaign: string; shortLinks: boolean; webhookUrl: string; webhookSecret: string | null } }) {
  const [v, setV] = useState(initial);
  const [msg, setMsg] = useState<Msg>(null);
  const check = (k: "notifyFailures" | "utmEnabled" | "shortLinks", label: string, hint: string) => (
    <label className="flex items-start gap-3 text-sm">
      <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand-600" checked={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.checked })} />
      <span><span className="font-medium text-slate-800">{label}</span><br /><span className="muted text-xs">{hint}</span></span>
    </label>
  );
  return (
    <form
      className="card space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          const { webhookSecret: _s, ...data } = v;
          const r = await api<{ webhookSecret: string | null }>("PATCH", "/api/settings/integrations", data);
          setV({ ...v, webhookSecret: r.webhookSecret });
          setMsg({ ok: true, text: "Saved" });
        } catch (err) {
          setMsg({ ok: false, text: (err as Error).message });
        }
      }}
    >
      <h2 className="font-semibold">Notifications, links and webhooks</h2>
      {check("notifyFailures", "Email me when a post fails", "Sent once a post has permanently failed.")}
      {check("utmEnabled", "Add UTM tracking to links", "Adds utm_source (the network), utm_medium=social and your campaign name to each post's link.")}
      {v.utmEnabled && (
        <div>
          <label className="label" htmlFor="utm-campaign">Campaign name</label>
          <input id="utm-campaign" className="input max-w-xs" value={v.utmCampaign} onChange={(e) => setV({ ...v, utmCampaign: e.target.value })} maxLength={60} />
        </div>
      )}
      {check("shortLinks", "Shorten links and count clicks", "Each post's link becomes a short tracked link. Clicks show up in Analytics.")}
      <div>
        <label className="label" htmlFor="webhook-url">Webhook address <span className="muted font-normal">(optional)</span></label>
        <input id="webhook-url" type="url" className="input" value={v.webhookUrl} onChange={(e) => setV({ ...v, webhookUrl: e.target.value })} placeholder="https://your-server.com/hook" />
        <p className="muted mt-1 text-xs">Receives a JSON POST for post.published and post.failed, for tools like Zapier, Make or n8n.</p>
        {v.webhookSecret && <p className="mt-1 text-xs text-slate-700">Signing secret: <code className="rounded bg-slate-100 px-1 break-all">{v.webhookSecret}</code></p>}
      </div>
      <Note msg={msg} />
      <button className="btn">Save</button>
    </form>
  );
}

export function ApiKeyForm() {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        try {
          const r = await api<{ key: string }>("POST", "/api/keys", Object.fromEntries(new FormData(form)));
          setKey(r.key);
          setMsg(null);
          form.reset();
          router.refresh();
        } catch (err) {
          setMsg({ ok: false, text: (err as Error).message });
        }
      }}
    >
      <div className="flex flex-wrap gap-2">
        <input name="name" className="input max-w-xs" placeholder="Key name, e.g. Zapier" aria-label="Key name" required maxLength={60} />
        <button className="btn-secondary">Create API key</button>
      </div>
      {key && (
        <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          Copy this key now. It will not be shown again.<br />
          <code className="break-all font-mono">{key}</code>
        </p>
      )}
      <Note msg={msg} />
    </form>
  );
}
