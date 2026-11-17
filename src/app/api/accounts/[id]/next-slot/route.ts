import { prisma } from "@/lib/db";
import { handler, HttpError } from "@/lib/http";
import { nextSlots } from "@/lib/slots";

export const GET = handler<{ id: string }>(async ({ params, user }) => {
  const account = await prisma.socialAccount.findFirst({ where: { id: params.id, userId: user.id }, include: { slots: true } });
  if (!account) throw new HttpError(404, "Account not found");
  if (account.slots.length === 0) throw new HttpError(400, `Set weekly posting times for ${account.name} on the Schedules page first`);
  const busy = await prisma.postTarget.findMany({
    where: { accountId: account.id, status: { in: ["SCHEDULED", "QUEUED"] }, scheduledAt: { gt: new Date() } },
    select: { scheduledAt: true },
  });
  const [next] = nextSlots(account.slots, user.timezone, new Set(busy.map((b) => b.scheduledAt.getTime())), new Date());
  if (!next) throw new HttpError(400, "No free posting time found");
  return { scheduledAt: next.toISOString() };
});
