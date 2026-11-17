"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";

type Props = {
  method: "POST" | "PATCH" | "PUT" | "DELETE";
  url: string;
  body?: unknown;
  confirm?: string;
  className?: string;
  redirectTo?: string;
  children: React.ReactNode;
};

/** A button that calls one API endpoint, then refreshes the page data. */
export function ActionButton({ method, url, body, confirm, className = "btn-secondary", redirectTo, children }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    if (confirm && !window.confirm(confirm)) return;
    setBusy(true);
    setError("");
    try {
      const res = await api(method, url, body);
      if (res?.ok === false && res.message) setError(res.message);
      if (redirectTo) router.push(redirectTo);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button type="button" className={className} onClick={run} disabled={busy}>
        {busy ? "Working…" : children}
      </button>
      {error && (
        <span role="alert" className="max-w-xs text-xs text-red-600">
          {error}
        </span>
      )}
    </span>
  );
}
