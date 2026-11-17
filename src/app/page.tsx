import Link from "next/link";
import { money } from "@/components/ui";
import { getUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

const FEATURES = [
  ["A timetable for every network", "Send the same post to Facebook at 9:00, Instagram at 18:00 and Pinterest on Saturday. Each account keeps its own schedule."],
  ["Plan in Google Sheets", "Fill in a spreadsheet row per post and it is scheduled automatically. Edit the row and the post updates."],
  ["Connection status at a glance", "See which pages and channels are connected and get told the moment one needs to be reconnected."],
  ["Posting slots", "Set weekly posting times per account once, then drop new posts into the next free slot."],
];

export default async function Landing() {
  const [user, plans] = await Promise.all([getUser(), prisma.plan.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } })]);
  return (
    <div className="bg-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
        <span className="text-lg font-semibold text-brand-700">{env.appName}</span>
        <nav aria-label="Account" className="flex items-center gap-3 text-sm">
          {user ? (
            <Link href="/app" className="btn">Open dashboard</Link>
          ) : (
            <>
              <Link href="/login" className="font-medium text-slate-700 hover:text-slate-900">Sign in</Link>
              <Link href="/register" className="btn">Start free</Link>
            </>
          )}
        </nav>
      </header>

      <main>
        <section className="mx-auto max-w-3xl px-4 py-20 text-center">
          <h1 className="text-4xl font-semibold tracking-tight text-balance text-slate-900 sm:text-5xl">
            Schedule once. Publish everywhere, each on its own time.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-slate-600">
            Connect your Facebook Pages, Instagram, YouTube and Pinterest, then let {env.appName} publish your posts
            automatically from the app or from a Google Sheet.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Link href={user ? "/app" : "/register"} className="btn px-6 py-3 text-base">
              {env.trialDays > 0 ? `Try free for ${env.trialDays} days` : "Get started"}
            </Link>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-6 px-4 pb-20 sm:grid-cols-2" aria-label="Features">
          {FEATURES.map(([title, text]) => (
            <div key={title} className="card">
              <h2 className="font-semibold">{title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{text}</p>
            </div>
          ))}
        </section>

        {plans.length > 0 && (
          <section className="border-t border-slate-200 bg-slate-50 px-4 py-20" aria-labelledby="pricing">
            <h2 id="pricing" className="text-center text-3xl font-semibold tracking-tight">Simple monthly pricing</h2>
            <div className="mx-auto mt-10 grid max-w-5xl gap-6 md:grid-cols-3">
              {plans.map((p) => (
                <div key={p.id} className="card flex flex-col">
                  <h3 className="font-semibold">{p.name}</h3>
                  <p className="muted">{p.description}</p>
                  <p className="mt-4 text-3xl font-semibold">{money(p.priceCents, p.currency)}<span className="muted text-sm font-normal"> / month</span></p>
                  <ul className="mt-4 flex-1 space-y-2 text-sm text-slate-700">
                    <li>{p.maxAccounts} connected accounts</li>
                    <li>{p.maxPostsPerMonth.toLocaleString()} scheduled posts a month</li>
                    <li>{p.maxSheets} Google Sheet{p.maxSheets === 1 ? "" : "s"}</li>
                  </ul>
                  <Link href={user ? "/app/billing" : "/register"} className="btn mt-6">Choose {p.name}</Link>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-8 text-sm text-slate-500">
        <span>© {new Date().getFullYear()} {env.appName}</span>
        <nav aria-label="Legal" className="flex gap-4">
          <Link href="/privacy" className="hover:text-slate-800">Privacy</Link>
          <Link href="/terms" className="hover:text-slate-800">Terms</Link>
          <Link href="/data-deletion" className="hover:text-slate-800">Data deletion</Link>
        </nav>
      </footer>
    </div>
  );
}
