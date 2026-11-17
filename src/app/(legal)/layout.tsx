import Link from "next/link";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white">
      <header className="mx-auto max-w-3xl px-4 py-5">
        <Link href="/" className="text-lg font-semibold text-brand-700">{env.appName}</Link>
      </header>
      <main className="prose-legal mx-auto max-w-3xl px-4 pb-20">{children}</main>
    </div>
  );
}
