import Link from "next/link";
import type { User } from "@prisma/client";
import { getSubscription, isActive } from "@/lib/billing/entitlements";
import { env } from "@/lib/env";
import { Nav } from "./Nav";

export async function Shell({ user, children }: { user: User; children: React.ReactNode }) {
  const sub = await getSubscription(user.id);
  const active = isActive(sub);
  const daysLeft = sub ? Math.ceil((sub.currentPeriodEnd.getTime() - Date.now()) / 86_400_000) : 0;
  return (
    <div className="mx-auto flex min-h-screen max-w-7xl flex-col md:flex-row">
      <aside className="border-b border-slate-200 bg-white p-4 md:w-56 md:shrink-0 md:border-r md:border-b-0">
        <Link href="/app" className="mb-4 block text-lg font-semibold text-brand-700">{env.appName}</Link>
        <Nav isAdmin={user.role === "ADMIN"} />
        <p className="muted mt-6 hidden truncate text-xs md:block" title={user.email}>{user.email}</p>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-8">
        {!active && (
          <div role="alert" className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Your subscription is not active, so scheduled posts will not be published.{" "}
            <Link href="/app/billing" className="font-medium underline">Choose a plan</Link>
          </div>
        )}
        {active && sub?.status === "TRIALING" && daysLeft <= 3 && (
          <div className="mb-6 rounded-lg border border-brand-100 bg-brand-50 p-4 text-sm text-brand-700">
            Your free trial ends in {daysLeft} day{daysLeft === 1 ? "" : "s"}.{" "}
            <Link href="/app/billing" className="font-medium underline">Choose a plan</Link>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
