import Link from "next/link";
import { ActionButton } from "@/components/ActionButton";
import { GrantForm, PlanForm } from "@/components/AdminForms";
import { Empty, money, StatusBadge } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { isActive } from "@/lib/billing/entitlements";
import { prisma } from "@/lib/db";
import { formatInZone } from "@/lib/slots";

export const metadata = { title: "Admin" };
const PAGE = 50;

export default async function Admin({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const page = Math.max(1, Number(sp.page) || 1);
  const where = q ? { OR: [{ email: { contains: q, mode: "insensitive" as const } }, { name: { contains: q, mode: "insensitive" as const } }] } : {};
  const [pending, plans, users, userCount, activeSubs, published] = await Promise.all([
    prisma.payment.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, include: { user: true, plan: true } }),
    prisma.plan.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE,
      take: PAGE,
      include: { subscription: { include: { plan: true } }, _count: { select: { accounts: true, posts: true } } },
    }),
    prisma.user.count({ where }),
    prisma.subscription.count({ where: { status: "ACTIVE", currentPeriodEnd: { gt: new Date() } } }),
    prisma.postTarget.count({ where: { status: "PUBLISHED" } }),
  ]);
  const planOptions = plans.map((p) => ({ id: p.id, name: p.name }));

  return (
    <div className="space-y-10">
      <h1 className="h1">Admin</h1>

      <div className="grid grid-cols-3 gap-4">
        {[["Users", userCount], ["Paying subscribers", activeSubs], ["Posts published", published]].map(([l, v]) => (
          <div key={l as string} className="card">
            <p className="text-3xl font-semibold tabular-nums">{(v as number).toLocaleString()}</p>
            <p className="muted mt-1">{l}</p>
          </div>
        ))}
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Payments to review</h2>
        {pending.length === 0 ? (
          <Empty title="No payments waiting" />
        ) : (
          <ul className="card divide-y divide-slate-100 p-0">
            {pending.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{p.user.email} · {p.plan.name} · {money(p.amountCents, p.currency)}</p>
                  <p className="muted text-xs">Reference <span className="font-mono">{p.reference}</span> · {formatInZone(p.createdAt, admin.timezone)}</p>
                </div>
                <ActionButton method="POST" url={`/api/admin/payments/${p.id}`} body={{ action: "approve" }} className="btn" confirm="Confirm you received this payment? This starts 30 days of access.">
                  Approve
                </ActionButton>
                <ActionButton method="POST" url={`/api/admin/payments/${p.id}`} body={{ action: "reject" }} className="btn-danger" confirm="Reject this payment?">
                  Reject
                </ActionButton>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Plans</h2>
        <div className="card p-0">
          {plans.map((p) => <PlanForm key={p.id} plan={p} />)}
          <PlanForm />
        </div>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Users</h2>
          <form className="flex gap-2" action="/admin">
            <input name="q" defaultValue={q} className="input w-56 py-1" placeholder="Search name or email" aria-label="Search users" />
            <button className="btn-secondary">Search</button>
          </form>
        </div>
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600">
              <tr>
                <th scope="col" className="px-4 py-2">User</th>
                <th scope="col" className="px-4 py-2">Plan</th>
                <th scope="col" className="px-4 py-2">Until</th>
                <th scope="col" className="px-4 py-2">Accounts</th>
                <th scope="col" className="px-4 py-2">Posts</th>
                <th scope="col" className="px-4 py-2">Grant access</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-2">
                    <p className="font-medium">{u.name} {u.role === "ADMIN" && <span className="badge bg-slate-100 text-slate-600">Admin</span>}</p>
                    <p className="muted text-xs">{u.email}</p>
                  </td>
                  <td className="px-4 py-2">
                    {u.subscription ? (
                      <span className="flex items-center gap-2">{u.subscription.plan.name} <StatusBadge status={isActive(u.subscription) ? u.subscription.status : "EXPIRED"} /></span>
                    ) : "None"}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">{u.subscription ? formatInZone(u.subscription.currentPeriodEnd, admin.timezone) : ""}</td>
                  <td className="px-4 py-2 tabular-nums">{u._count.accounts}</td>
                  <td className="px-4 py-2 tabular-nums">{u._count.posts}</td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <GrantForm userId={u.id} plans={planOptions} />
                      {isActive(u.subscription) && (
                        <ActionButton method="DELETE" url={`/api/admin/users/${u.id}/subscription`} className="btn-danger" confirm={`End access for ${u.email} now?`}>
                          End
                        </ActionButton>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {userCount > PAGE && (
          <div className="mt-3 flex items-center justify-between text-sm">
            {page > 1 ? <Link className="btn-secondary" href={`/admin?q=${encodeURIComponent(q)}&page=${page - 1}`}>Previous</Link> : <span />}
            <span className="muted">Page {page} of {Math.ceil(userCount / PAGE)}</span>
            {page * PAGE < userCount ? <Link className="btn-secondary" href={`/admin?q=${encodeURIComponent(q)}&page=${page + 1}`}>Next</Link> : <span />}
          </div>
        )}
      </section>
    </div>
  );
}
