"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";

function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function run(fn: () => Promise<void>, success: string) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, text: success });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }
  const note = msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>{msg.text}</p>;
  return { busy, run, note };
}

export function ProfileForm({ name, timezone, zones }: { name: string; timezone: string; zones: string[] }) {
  const router = useRouter();
  const { busy, run, note } = useSubmit();
  return (
    <form
      className="card space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(e.currentTarget));
        void run(async () => {
          await api("PATCH", "/api/settings", f);
          router.refresh();
        }, "Saved");
      }}
    >
      <h2 className="font-semibold">Profile</h2>
      <div>
        <label className="label" htmlFor="name">Name</label>
        <input id="name" name="name" className="input max-w-sm" defaultValue={name} required maxLength={80} />
      </div>
      <div>
        <label className="label" htmlFor="timezone">Timezone</label>
        <select id="timezone" name="timezone" className="input max-w-sm" defaultValue={timezone}>
          {zones.map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}
        </select>
        <p className="muted mt-1 text-xs">All schedule times, posting slots and sheet dates use this timezone.</p>
      </div>
      {note}
      <button className="btn" disabled={busy}>Save profile</button>
    </form>
  );
}

export function PasswordForm() {
  const { busy, run, note } = useSubmit();
  return (
    <form
      className="card space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const f = Object.fromEntries(new FormData(form));
        void run(async () => {
          await api("POST", "/api/settings", f);
          form.reset();
        }, "Password changed");
      }}
    >
      <h2 className="font-semibold">Password</h2>
      <div>
        <label className="label" htmlFor="current">Current password</label>
        <input id="current" name="current" type="password" className="input max-w-sm" autoComplete="current-password" required />
      </div>
      <div>
        <label className="label" htmlFor="next">New password</label>
        <input id="next" name="next" type="password" className="input max-w-sm" autoComplete="new-password" minLength={8} required />
      </div>
      {note}
      <button className="btn" disabled={busy}>Change password</button>
    </form>
  );
}

export function DeleteAccountForm() {
  const router = useRouter();
  const { busy, run, note } = useSubmit();
  return (
    <form
      className="card space-y-4 border-red-200"
      onSubmit={(e) => {
        e.preventDefault();
        if (!window.confirm("Delete your account and all its data? This cannot be undone.")) return;
        const f = Object.fromEntries(new FormData(e.currentTarget));
        void run(async () => {
          await api("DELETE", "/api/settings", f);
          router.push("/");
          router.refresh();
        }, "Account deleted");
      }}
    >
      <h2 className="font-semibold text-red-700">Delete account</h2>
      <p className="text-sm text-slate-700">
        Removes your account, connected accounts and their access tokens, scheduled posts and uploaded files. Posts already
        published stay on the social networks.
      </p>
      <div>
        <label className="label" htmlFor="del-password">Confirm with your password</label>
        <input id="del-password" name="password" type="password" className="input max-w-sm" autoComplete="current-password" required />
      </div>
      {note}
      <button className="btn-danger" disabled={busy}>Delete my account</button>
    </form>
  );
}
