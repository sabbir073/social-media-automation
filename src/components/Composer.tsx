"use client";

import { DateTime } from "luxon";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { api } from "@/lib/client";
import { PlatformBadge } from "./ui";

type Account = { id: string; name: string; platform: string; healthy: boolean; hasSlots: boolean };
type Media = { id: string; kind: "IMAGE" | "VIDEO"; name: string; url: string };
type Target = { mode: "time" | "now"; when: string; caption: string; customCaption: boolean; boardId: string; privacy: string };
type Board = { id: string; name: string };

const INPUT_FORMAT = "yyyy-MM-dd'T'HH:mm";

export function Composer({ accounts, timezone }: { accounts: Account[]; timezone: string }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [caption, setCaption] = useState("");
  const [title, setTitle] = useState("");
  const [link, setLink] = useState("");
  const [media, setMedia] = useState<Media[]>([]);
  const [targets, setTargets] = useState<Record<string, Target>>({});
  const [boards, setBoards] = useState<Record<string, Board[] | "loading" | "error">>({});
  const [uploading, setUploading] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const defaultWhen = () => DateTime.now().setZone(timezone).plus({ hours: 1 }).startOf("minute").toFormat(INPUT_FORMAT);
  const patch = (id: string, p: Partial<Target>) => setTargets((t) => ({ ...t, [id]: { ...t[id], ...p } }));
  const selected = accounts.filter((a) => targets[a.id]);
  const needsTitle = selected.some((a) => a.platform === "YOUTUBE" || a.platform === "PINTEREST");

  function toggle(a: Account) {
    setTargets((t) => {
      if (t[a.id]) {
        const { [a.id]: _removed, ...rest } = t;
        return rest;
      }
      return { ...t, [a.id]: { mode: "time", when: defaultWhen(), caption: "", customCaption: false, boardId: "", privacy: "public" } };
    });
    if (a.platform === "PINTEREST" && !boards[a.id]) {
      setBoards((b) => ({ ...b, [a.id]: "loading" }));
      api<{ boards: Board[] }>("GET", `/api/accounts/${a.id}/boards`)
        .then((r) => setBoards((b) => ({ ...b, [a.id]: r.boards })))
        .catch(() => setBoards((b) => ({ ...b, [a.id]: "error" })));
    }
  }

  async function upload(files: FileList | null) {
    if (!files) return;
    setError("");
    for (const file of Array.from(files)) {
      setUploading((n) => n + 1);
      try {
        const res = await fetch("/api/media", {
          method: "PUT",
          headers: { "Content-Type": file.type, "X-Filename": encodeURIComponent(file.name) },
          body: file,
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || `Could not upload ${file.name}`);
        setMedia((m) => [...m, json]);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (fileInput.current) fileInput.current.value = "";
  }

  async function removeMedia(id: string) {
    setMedia((m) => m.filter((x) => x.id !== id));
    await api("DELETE", `/api/media/${id}`).catch(() => {});
  }

  async function nextSlot(id: string) {
    setError("");
    try {
      const r = await api<{ scheduledAt: string }>("GET", `/api/accounts/${id}/next-slot`);
      patch(id, { mode: "time", when: DateTime.fromISO(r.scheduledAt).setZone(timezone).toFormat(INPUT_FORMAT) });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (selected.length === 0) return setError("Choose at least one account.");
    const payload = [];
    for (const a of selected) {
      const t = targets[a.id];
      let scheduledAt = "now";
      if (t.mode === "time") {
        const dt = DateTime.fromFormat(t.when, INPUT_FORMAT, { zone: timezone });
        if (!dt.isValid) return setError(`${a.name}: choose a date and time.`);
        if (dt.toMillis() < Date.now() - 60_000) return setError(`${a.name}: that time is in the past.`);
        scheduledAt = dt.toUTC().toISO()!;
      }
      const options: Record<string, unknown> = {};
      if (a.platform === "PINTEREST") {
        options.boardId = t.boardId;
        const list = boards[a.id];
        if (Array.isArray(list)) options.boardName = list.find((b) => b.id === t.boardId)?.name;
      }
      if (a.platform === "YOUTUBE") options.privacy = t.privacy;
      payload.push({ accountId: a.id, scheduledAt, captionOverride: t.customCaption ? t.caption : null, options });
    }
    setBusy(true);
    try {
      await api("POST", "/api/posts", { caption, title, link, mediaIds: media.map((m) => m.id), targets: payload });
      router.push("/app/posts");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="card space-y-4">
        <div>
          <label className="label" htmlFor="caption">Text</label>
          <textarea id="caption" className="input min-h-32" value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={5000} placeholder="What do you want to share?" />
          <p className="muted mt-1 text-right text-xs tabular-nums">{caption.length} characters</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="title">Title {needsTitle ? "" : <span className="muted font-normal">(YouTube and Pinterest)</span>}</label>
            <input id="title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} />
          </div>
          <div>
            <label className="label" htmlFor="link">Link <span className="muted font-normal">(optional)</span></label>
            <input id="link" type="url" className="input" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" />
          </div>
        </div>
        <div>
          <span className="label">Images or video</span>
          <div className="flex flex-wrap gap-3">
            {media.map((m) => (
              <div key={m.id} className="relative h-24 w-24 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                {m.kind === "IMAGE" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.url} alt={m.name} className="h-full w-full object-cover" />
                ) : (
                  <video src={m.url} className="h-full w-full object-cover" muted preload="metadata" />
                )}
                <button
                  type="button"
                  onClick={() => removeMedia(m.id)}
                  aria-label={`Remove ${m.name}`}
                  className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-slate-900/70 text-sm text-white hover:bg-slate-900"
                >
                  ×
                </button>
              </div>
            ))}
            <label className="flex h-24 w-24 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 text-center text-xs text-slate-500 hover:border-brand-500 hover:text-brand-600">
              {uploading > 0 ? "Uploading…" : "Add file"}
              <input
                ref={fileInput}
                type="file"
                multiple
                className="sr-only"
                accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
                onChange={(e) => upload(e.target.files)}
              />
            </label>
          </div>
          <p className="muted mt-2 text-xs">JPG, PNG, WEBP, MP4 or MOV.</p>
        </div>
      </div>

      <fieldset className="space-y-3">
        <legend className="mb-1 text-lg font-semibold">Where and when</legend>
        {accounts.map((a) => {
          const t = targets[a.id];
          const list = boards[a.id];
          return (
            <div key={a.id} className={`card p-4 ${t ? "border-brand-500" : ""}`}>
              <label className="flex cursor-pointer items-center gap-3">
                <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={Boolean(t)} onChange={() => toggle(a)} />
                <PlatformBadge platform={a.platform} />
                <span className="min-w-0 flex-1 truncate font-medium">{a.name}</span>
                {!a.healthy && <span className="badge bg-amber-50 text-amber-800">Needs attention</span>}
              </label>
              {t && (
                <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
                  <div className="flex flex-wrap items-end gap-3">
                    <div>
                      <label className="label" htmlFor={`when-${a.id}`}>Publish</label>
                      <select className="input w-auto" value={t.mode} onChange={(e) => patch(a.id, { mode: e.target.value as Target["mode"] })} aria-label={`When to publish to ${a.name}`}>
                        <option value="time">At a set time</option>
                        <option value="now">Right away</option>
                      </select>
                    </div>
                    {t.mode === "time" && (
                      <>
                        <input id={`when-${a.id}`} type="datetime-local" className="input w-auto" value={t.when} onChange={(e) => patch(a.id, { when: e.target.value })} required />
                        {a.hasSlots && (
                          <button type="button" className="btn-secondary" onClick={() => nextSlot(a.id)}>Next free slot</button>
                        )}
                        {selected.length > 1 && (
                          <button
                            type="button"
                            className="text-sm text-brand-600 hover:underline"
                            onClick={() => setTargets((all) => Object.fromEntries(Object.entries(all).map(([id, x]) => [id, { ...x, mode: "time", when: t.when }])))}
                          >
                            Use this time for all
                          </button>
                        )}
                      </>
                    )}
                  </div>
                  {a.platform === "PINTEREST" && (
                    <div>
                      <label className="label" htmlFor={`board-${a.id}`}>Board</label>
                      {list === "error" ? (
                        <p className="text-sm text-red-600">Could not load boards. Check this account on the Accounts page.</p>
                      ) : (
                        <select id={`board-${a.id}`} className="input w-auto" value={t.boardId} onChange={(e) => patch(a.id, { boardId: e.target.value })} required>
                          <option value="">{list === "loading" || !list ? "Loading boards…" : "Choose a board"}</option>
                          {Array.isArray(list) && list.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                      )}
                    </div>
                  )}
                  {a.platform === "YOUTUBE" && (
                    <div>
                      <label className="label" htmlFor={`privacy-${a.id}`}>Visibility</label>
                      <select id={`privacy-${a.id}`} className="input w-auto" value={t.privacy} onChange={(e) => patch(a.id, { privacy: e.target.value })}>
                        <option value="public">Public</option>
                        <option value="unlisted">Unlisted</option>
                        <option value="private">Private</option>
                      </select>
                    </div>
                  )}
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={t.customCaption} onChange={(e) => patch(a.id, { customCaption: e.target.checked, caption: t.caption || caption })} />
                    Use different text here
                  </label>
                  {t.customCaption && (
                    <textarea className="input min-h-24" value={t.caption} onChange={(e) => patch(a.id, { caption: e.target.value })} maxLength={5000} aria-label={`Text for ${a.name}`} />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </fieldset>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <button className="btn" disabled={busy || uploading > 0}>
        {busy
          ? "Saving…"
          : selected.length > 0 && selected.every((a) => targets[a.id].mode === "now")
            ? "Publish now"
            : selected.length > 1
              ? `Schedule to ${selected.length} accounts`
              : "Schedule post"}
      </button>
    </form>
  );
}
