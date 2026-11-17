"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";

type Mode = "login" | "register" | "forgot" | "reset";

const COPY: Record<Mode, { title: string; button: string }> = {
  login: { title: "Sign in", button: "Sign in" },
  register: { title: "Create your account", button: "Create account" },
  forgot: { title: "Reset your password", button: "Send reset link" },
  reset: { title: "Choose a new password", button: "Save password" },
};

export function AuthForm({ mode, token }: { mode: Mode; token?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    setBusy(true);
    setError("");
    try {
      if (mode === "register") {
        await api("POST", "/api/auth/register", { ...f, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
        router.push("/app");
        router.refresh();
      } else if (mode === "login") {
        await api("POST", "/api/auth/login", f);
        router.push("/app");
        router.refresh();
      } else if (mode === "forgot") {
        await api("POST", "/api/auth/forgot", f);
        setDone("If an account exists for that email, a reset link is on its way.");
      } else {
        await api("POST", "/api/auth/reset", { token, password: f.password });
        setDone("Password saved. You can sign in now.");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-sm">
      <h1 className="h1 mb-6 text-center">{COPY[mode].title}</h1>
      <form onSubmit={submit} className="card space-y-4">
        {mode === "register" && (
          <div>
            <label className="label" htmlFor="name">Name</label>
            <input id="name" name="name" className="input" autoComplete="name" required maxLength={80} />
          </div>
        )}
        {mode !== "reset" && (
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" name="email" type="email" className="input" autoComplete="email" required />
          </div>
        )}
        {mode !== "forgot" && (
          <div>
            <label className="label" htmlFor="password">{mode === "reset" ? "New password" : "Password"}</label>
            <input
              id="password"
              name="password"
              type="password"
              className="input"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              minLength={mode === "login" ? 1 : 8}
              required
            />
            {mode !== "login" && <p className="muted mt-1 text-xs">At least 8 characters.</p>}
          </div>
        )}
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        {done && <p role="status" className="text-sm text-emerald-700">{done}</p>}
        <button className="btn w-full" disabled={busy}>{busy ? "Please wait…" : COPY[mode].button}</button>
      </form>
      <p className="muted mt-4 text-center">
        {mode === "login" && (
          <>
            <Link className="text-brand-600 hover:underline" href="/forgot">Forgot password?</Link>
            {" · "}
            <Link className="text-brand-600 hover:underline" href="/register">Create an account</Link>
          </>
        )}
        {mode === "register" && (
          <>
            Already have an account? <Link className="text-brand-600 hover:underline" href="/login">Sign in</Link>
          </>
        )}
        {(mode === "forgot" || mode === "reset") && (
          <Link className="text-brand-600 hover:underline" href="/login">Back to sign in</Link>
        )}
      </p>
    </div>
  );
}
