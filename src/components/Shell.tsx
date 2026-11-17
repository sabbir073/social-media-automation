import Link from "next/link";
import type { User } from "@prisma/client";
import { getSubscription, isActive } from "@/lib/billing/entitlements";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { Nav } from "./Nav";

export async function Shell({ user, children }: { user: User; children: React.ReactNode }) {
  const [sub, unread] = await Promise.all([
    getSubscription(user.id),
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);
  const active = isActive(sub);
  const daysLeft = sub ? Math.ceil((sub.currentPeriodEnd.getTime() - Date.now()) / 86_400_000) : 0;
  return (
    <div className="mx-auto flex min-h-screen max-w-7xl flex-col md:flex-row">
      <aside className="border-b border-slate-200 bg-white p-4 md:w-56 md:shrink-0 md:border-r md:border-b-0">
        <div className="mb-4 flex items-center justify-between">
          <Link href="/app" className="text-lg font-semibold text-brand-700">{env.appName}</Link>
          <Link href="/app/notifications" className="relative rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
              <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
            </svg>
            {unread > 0 && <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">{unread > 9 ? "9+" : unread}</span>}
          </Link>
        </div>
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
