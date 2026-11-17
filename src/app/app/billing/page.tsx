import { ActionButton } from "@/components/ActionButton";
import { PlanPicker } from "@/components/PlanPicker";
import { money, StatusBadge } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getSubscription, isActive, usage } from "@/lib/billing/entitlements";
import { prisma } from "@/lib/db";
import { formatInZone } from "@/lib/slots";

export const metadata = { title: "Billing" };

export default async function Billing() {
  const user = await requireUser();
  const [sub, plans, payments, used] = await Promise.all([
    getSubscription(user.id),
    prisma.plan.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    prisma.payment.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 20, include: { plan: true } }),
    usage(user.id),
  ]);
  const active = isActive(sub);
  return (
    <div className="max-w-4xl space-y-8">
      <h1 className="h1">Billing</h1>

      <section className="card space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-semibold">{sub ? `${sub.plan.name} plan` : "No plan yet"}</h2>
          {sub && <StatusBadge status={active ? sub.status : "EXPIRED"} />}
        </div>
        {sub && (
          <>
            <p className="text-sm text-slate-700">
              {!active
                ? `Ended ${formatInZone(sub.currentPeriodEnd, user.timezone)}.`
                : sub.status === "CANCELED"
                  ? `Canceled. You keep access until ${formatInZone(sub.currentPeriodEnd, user.timezone)}.`
                  : `${sub.status === "TRIALING" ? "Trial ends" : "Paid until"} ${formatInZone(sub.currentPeriodEnd, user.timezone)}.`}
            </p>
            <dl className="grid grid-cols-3 gap-4 text-sm">
              {[
                ["Accounts", used.accounts, sub.plan.maxAccounts],
                ["Posts this month", used.postsThisMonth, sub.plan.maxPostsPerMonth],
                ["Sheets", used.sheets, sub.plan.maxSheets],
              ].map(([label, n, max]) => (
                <div key={label as string}>
                  <dt className="muted text-xs">{label}</dt>
                  <dd className="font-medium tabular-nums">{n} of {(max as number).toLocaleString()}</dd>
                </div>
              ))}
            </dl>
            {active && sub.status === "ACTIVE" && (
              <ActionButton method="POST" url="/api/billing/cancel" confirm="Cancel your plan? You keep access until the end of the paid period.">
                Cancel plan
              </ActionButton>
            )}
          </>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Plans</h2>
        <PlanPicker
          currentPlanId={sub?.planId ?? null}
          plans={plans.map((p) => ({
            id: p.id,
            name: p.name,
            description: p.description,
            price: money(p.priceCents, p.currency),
            maxAccounts: p.maxAccounts,
            maxPostsPerMonth: p.maxPostsPerMonth,
            maxSheets: p.maxSheets,
          }))}
        />
      </section>

      {payments.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Payments</h2>
          <div className="card overflow-x-auto p-0">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-600">
                <tr>
                  <th scope="col" className="px-4 py-2">Date</th>
                  <th scope="col" className="px-4 py-2">Plan</th>
                  <th scope="col" className="px-4 py-2">Amount</th>
                  <th scope="col" className="px-4 py-2">Reference</th>
                  <th scope="col" className="px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-2 whitespace-nowrap">{formatInZone(p.createdAt, user.timezone)}</td>
                    <td className="px-4 py-2">{p.plan.name}</td>
                    <td className="px-4 py-2 tabular-nums">{money(p.amountCents, p.currency)}</td>
                    <td className="px-4 py-2 font-mono text-xs">{p.reference}</td>
                    <td className="px-4 py-2"><StatusBadge status={p.status} />{p.note && <span className="muted ml-2 text-xs">{p.note}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
