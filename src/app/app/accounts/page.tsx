import { ActionButton } from "@/components/ActionButton";
import { Empty, PlatformBadge, StatusBadge } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getSubscription, isActive } from "@/lib/billing/entitlements";
import { prisma } from "@/lib/db";
import { availableProviders } from "@/lib/providers";
import { formatInZone } from "@/lib/slots";

export const metadata = { title: "Accounts" };

export default async function Accounts({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; connected?: string; skipped?: string }>;
}) {
  const user = await requireUser();
  const q = await searchParams;
  const [accounts, sub] = await Promise.all([
    prisma.socialAccount.findMany({ where: { userId: user.id }, orderBy: [{ platform: "asc" }, { name: "asc" }] }),
    getSubscription(user.id),
  ]);
  const providers = availableProviders();
  const active = isActive(sub);
  const full = sub ? accounts.length >= sub.plan.maxAccounts : true;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="h1">Accounts</h1>
        <p className="muted mt-1">
          Connect the pages and channels you want to post to.
          {sub && ` Using ${accounts.length} of ${sub.plan.maxAccounts} on the ${sub.plan.name} plan.`}
        </p>
      </div>

      {q.error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{q.error}</p>}
      {q.connected && (
        <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          {q.connected} account{q.connected === "1" ? "" : "s"} connected.
          {q.skipped && ` ${q.skipped} more could not be added because your plan's account limit was reached.`}
        </p>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold">Connect a network</h2>
        {providers.length === 0 ? (
          <Empty title="No networks are set up yet">The site owner still needs to add the platform app credentials.</Empty>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {providers.map((p) => (
              <div key={p.platform} className="card flex items-start gap-3">
                <PlatformBadge platform={p.platform} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{p.label}</p>
                  <p className="muted mt-0.5 text-xs">{p.hint}</p>
                </div>
                {active && !full ? (
                  <a href={`/api/oauth/${p.platform.toLowerCase()}/start`} className="btn-secondary shrink-0">Connect</a>
                ) : (
                  <span className="muted shrink-0 text-xs">{active ? "Plan limit reached" : "Needs a plan"}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Connected</h2>
        {accounts.length === 0 ? (
          <Empty title="No accounts connected yet">Pick a network above to get started.</Empty>
        ) : (
          <ul className="card divide-y divide-slate-100 p-0">
            {accounts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 p-4">
                <PlatformBadge platform={a.platform} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {a.name} {a.username && <span className="muted font-normal">@{a.username.replace(/^@/, "")}</span>}
                  </p>
                  <p className="muted text-xs">
                    {a.status !== "CONNECTED" && a.statusMessage
                      ? a.statusMessage
                      : a.lastCheckedAt
                        ? `Last verified ${formatInZone(a.lastCheckedAt, user.timezone)}`
                        : "Not verified yet"}
                  </p>
                </div>
                <StatusBadge status={a.status} />
                <div className="flex flex-wrap gap-2">
                  {a.status === "NEEDS_REAUTH" && active ? (
                    <a href={`/api/oauth/${a.platform.toLowerCase()}/start`} className="btn-secondary">Reconnect</a>
                  ) : (
                    <ActionButton method="POST" url={`/api/accounts/${a.id}/check`}>Check</ActionButton>
                  )}
                  <ActionButton
                    method="DELETE"
                    url={`/api/accounts/${a.id}`}
                    className="btn-danger"
                    confirm={`Remove ${a.name}? Its scheduled posts will be deleted too.`}
                  >
                    Remove
                  </ActionButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
