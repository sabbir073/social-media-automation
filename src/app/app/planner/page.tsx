import Link from "next/link";
import { Planner } from "@/components/Planner";
import { Empty } from "@/components/ui";
import { aiEnabled } from "@/lib/ai";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const metadata = { title: "AI planner" };

export default async function PlannerPage() {
  const user = await requireUser();
  const accounts = await prisma.socialAccount.findMany({
    where: { userId: user.id },
    orderBy: [{ platform: "asc" }, { name: "asc" }],
    include: { _count: { select: { slots: true } } },
  });
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="h1">AI planner</h1>
        <p className="muted mt-1">
          Give one topic and get a batch of different posts written in your brand voice (set it under{" "}
          <Link href="/app/settings" className="text-brand-600 underline">Settings</Link>). Edit them, then save as drafts or schedule them all.
        </p>
      </div>
      {!aiEnabled() ? (
        <Empty title="The AI assistant is not set up on this site">The site owner needs to connect an AI model.</Empty>
      ) : accounts.length === 0 ? (
        <Empty title="Connect an account first"><Link href="/app/accounts" className="text-brand-600 underline">Go to Accounts</Link></Empty>
      ) : (
        <Planner accounts={accounts.map((a) => ({ id: a.id, name: a.name, platform: a.platform, hasSlots: a._count.slots > 0 }))} />
      )}
    </div>
  );
}
