"use client";

import { DateTime } from "luxon";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { api } from "@/lib/client";
import { PLATFORM_META } from "@/lib/platforms";
import { PlatformBadge } from "./ui";

type Account = { id: string; name: string; platform: string; healthy: boolean; hasSlots: boolean };
type Media = { id: string; kind: "IMAGE" | "VIDEO"; name: string; url: string };
type Target = { mode: "time" | "now"; when: string; caption: string; customCaption: boolean; boardId: string; privacy: string; repeat: string; repeatCount: number };
type Snippet = { id: string; name: string; body: string };
type Initial = { caption: string; title: string; link: string; media: Media[] };

const REPEATS = [
  ["0", "Do not repeat"],
  ["1", "Every day"],
  ["7", "Every week"],
  ["14", "Every 2 weeks"],
  ["30", "Every 30 days"],
];
type Board = { id: string; name: string };

const INPUT_FORMAT = "yyyy-MM-dd'T'HH:mm";

export function Composer({
  accounts,
  timezone,
  snippets = [],
  aiEnabled = false,
  initial,
}: {
  accounts: Account[];
  timezone: string;
  snippets?: Snippet[];
  aiEnabled?: boolean;
  initial?: Initial;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [caption, setCaption] = useState(initial?.caption ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [link, setLink] = useState(initial?.link ?? "");
  const [media, setMedia] = useState<Media[]>(initial?.media ?? []);
  const [library, setLibrary] = useState<Media[] | null>(null);
  const [aiBusy, setAiBusy] = useState("");
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
      return { ...t, [a.id]: { mode: "time", when: defaultWhen(), caption: "", customCaption: false, boardId: "", privacy: "public", repeat: "0", repeatCount: 4 } };
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

  // Files stay in the media library when removed from a post.
  const removeMedia = (id: string) => setMedia((m) => m.filter((x) => x.id !== id));

  async function openLibrary() {
    setError("");
    try {
      setLibrary((await api<{ media: Media[] }>("GET", "/api/media")).media);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function ai(action: "write" | "rewrite" | "shorten" | "hashtags") {
    setError("");
    setAiBusy(action);
    try {
      const platform = selected.length === 1 ? selected[0].platform : undefined;
      const r = await api<{ text: string }>("POST", "/api/ai", { action, text: caption, platform });
      setCaption(action === "hashtags" ? `${caption.trimEnd()}\n\n${r.text}` : r.text);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAiBusy("");
    }
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
      payload.push({
        accountId: a.id,
        scheduledAt,
        captionOverride: t.customCaption ? t.caption : null,
        options,
        repeatEveryDays: t.repeat !== "0" ? Number(t.repeat) : null,
        repeatCount: t.repeat !== "0" ? t.repeatCount : null,
      });
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
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {snippets.length > 0 && (
              <select
                className="input w-auto py-1 text-xs"
                value=""
                aria-label="Insert a saved template"
                onChange={(e) => {
                  const s = snippets.find((x) => x.id === e.target.value);
                  if (s) setCaption((c) => (c.trim() ? `${c.trimEnd()}\n\n${s.body}` : s.body));
                }}
              >
                <option value="">Insert template…</option>
                {snippets.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
            {aiEnabled &&
              ([["write", "Write with AI"], ["rewrite", "Improve"], ["shorten", "Shorten"], ["hashtags", "Add hashtags"]] as const).map(([action, label]) => (
                <button key={action} type="button" className="btn-secondary py-1 text-xs" disabled={Boolean(aiBusy) || caption.trim().length < 3} onClick={() => ai(action)}>
                  {aiBusy === action ? "Working…" : label}
                </button>
              ))}
            <span className="muted ml-auto text-xs tabular-nums">
              {selected.length === 0
                ? `${caption.length} characters`
                : [...new Set(selected.map((a) => a.platform))].map((p) => (
                    <span key={p} className={`ml-3 ${caption.length > PLATFORM_META[p].limit ? "font-medium text-red-600" : ""}`}>
                      {PLATFORM_META[p].label} {caption.length}/{PLATFORM_META[p].limit}
                    </span>
                  ))}
            </span>
          </div>
          {aiEnabled && <p className="muted mt-1 text-xs">For “Write with AI”, type a topic or a few notes in the box first.</p>}
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
          <p className="muted mt-2 text-xs">
            JPG, PNG, WEBP, MP4 or MOV.{" "}
            <button type="button" className="text-brand-600 hover:underline" onClick={openLibrary}>Choose from media library</button>
          </p>
          {library && (
            <div className="mt-3 rounded-lg border border-slate-200 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium">Media library</span>
                <button type="button" className="text-sm text-slate-500 hover:underline" onClick={() => setLibrary(null)}>Close</button>
              </div>
              {library.length === 0 ? (
                <p className="muted">Nothing uploaded yet.</p>
              ) : (
                <div className="flex max-h-56 flex-wrap gap-2 overflow-y-auto">
                  {library.map((m) => {
                    const picked = media.some((x) => x.id === m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        aria-pressed={picked}
                        title={m.name}
                        onClick={() => setMedia((cur) => (picked ? cur.filter((x) => x.id !== m.id) : [...cur, m]))}
                        className={`h-16 w-16 overflow-hidden rounded-lg border-2 bg-slate-100 text-xs text-slate-500 ${picked ? "border-brand-600" : "border-transparent"}`}
                      >
                        {m.kind === "IMAGE" ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={m.url} alt={m.name} className="h-full w-full object-cover" />
                        ) : (
                          "Video"
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
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
                  <div className="flex flex-wrap items-end gap-3">
                    <div>
                      <label className="label" htmlFor={`repeat-${a.id}`}>Repeat</label>
                      <select id={`repeat-${a.id}`} className="input w-auto" value={t.repeat} onChange={(e) => patch(a.id, { repeat: e.target.value })}>
                        {REPEATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </div>
                    {t.repeat !== "0" && (
                      <div>
                        <label className="label" htmlFor={`count-${a.id}`}>More times</label>
                        <input id={`count-${a.id}`} type="number" min={1} max={52} className="input w-24" value={t.repeatCount} onChange={(e) => patch(a.id, { repeatCount: Math.min(52, Math.max(1, Number(e.target.value) || 1)) })} />
                      </div>
                    )}
                  </div>
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
