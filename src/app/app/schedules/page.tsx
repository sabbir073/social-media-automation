import Link from "next/link";
import { SlotEditor } from "@/components/SlotEditor";
import { Empty, PlatformBadge } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const metadata = { title: "Schedules" };

export default async function Schedules() {
  const user = await requireUser();
  const accounts = await prisma.socialAccount.findMany({
    where: { userId: user.id },
    orderBy: [{ platform: "asc" }, { name: "asc" }],
    include: { slots: true },
  });
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="h1">Schedules</h1>
        <p className="muted mt-1">
          Give each account its own weekly posting times. When you write a post, “Next free slot” fills in the next
          open time for that account. Times are in {user.timezone}{" "}
          (<Link href="/app/settings" className="text-brand-600 underline">change</Link>).
        </p>
      </div>
      {accounts.length === 0 ? (
        <Empty title="Connect an account first">
          <Link href="/app/accounts" className="text-brand-600 underline">Go to Accounts</Link>
        </Empty>
      ) : (
        accounts.map((a) => (
          <section key={a.id} className="card space-y-4">
            <div className="flex items-center gap-3">
              <PlatformBadge platform={a.platform} />
              <h2 className="font-semibold">{a.name}</h2>
            </div>
            <SlotEditor accountId={a.id} initial={a.slots.map((s) => ({ dayOfWeek: s.dayOfWeek, time: s.time }))} />
          </section>
        ))
      )}
    </div>
  );
}
