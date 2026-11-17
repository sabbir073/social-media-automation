import Link from "next/link";
import { Composer } from "@/components/Composer";
import { Empty } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const metadata = { title: "New post" };

export default async function Compose() {
  const user = await requireUser();
  const accounts = await prisma.socialAccount.findMany({
    where: { userId: user.id },
    orderBy: [{ platform: "asc" }, { name: "asc" }],
    include: { _count: { select: { slots: true } } },
  });
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="h1">New post</h1>
        <p className="muted mt-1">Write once, then give every account its own date and time. Times are in {user.timezone}.</p>
      </div>
      {accounts.length === 0 ? (
        <Empty title="Connect an account first">
          <Link href="/app/accounts" className="text-brand-600 underline">Go to Accounts</Link>
        </Empty>
      ) : (
        <Composer
          timezone={user.timezone}
          accounts={accounts.map((a) => ({
            id: a.id,
            name: a.name,
            platform: a.platform,
            healthy: a.status === "CONNECTED",
            hasSlots: a._count.slots > 0,
          }))}
        />
      )}
    </div>
  );
}
