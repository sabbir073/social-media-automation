"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/client";

const LINKS = [
  { href: "/app", label: "Dashboard" },
  { href: "/app/compose", label: "New post" },
  { href: "/app/posts", label: "Posts" },
  { href: "/app/accounts", label: "Accounts" },
  { href: "/app/schedules", label: "Schedules" },
  { href: "/app/sheets", label: "Google Sheets" },
  { href: "/app/billing", label: "Billing" },
  { href: "/app/settings", label: "Settings" },
];

export function Nav({ isAdmin }: { isAdmin: boolean }) {
  const path = usePathname();
  const router = useRouter();
  const links = isAdmin ? [...LINKS, { href: "/admin", label: "Admin" }] : LINKS;
  return (
    <nav aria-label="Main" className="flex gap-1 overflow-x-auto md:flex-col">
      {links.map((l) => {
        const active = l.href === "/app" ? path === "/app" : path.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap ${
              active ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
      <button
        type="button"
        className="rounded-lg px-3 py-2 text-left text-sm font-medium whitespace-nowrap text-slate-600 hover:bg-slate-100 md:mt-4"
        onClick={async () => {
          await api("POST", "/api/auth/logout");
          router.push("/login");
          router.refresh();
        }}
      >
        Sign out
      </button>
    </nav>
  );
}
