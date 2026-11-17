import type { Plan, Subscription } from "@prisma/client";
import { prisma } from "../db";
import { env } from "../env";
import { HttpError } from "../http";

export type ActiveSub = Subscription & { plan: Plan };

export function isActive(sub: Pick<Subscription, "status" | "currentPeriodEnd"> | null | undefined): boolean {
  if (!sub) return false;
  if (sub.currentPeriodEnd.getTime() <= Date.now()) return false;
  // A canceled subscription stays usable until the paid period ends.
  return sub.status === "ACTIVE" || sub.status === "TRIALING" || sub.status === "CANCELED";
}

export async function getSubscription(userId: string): Promise<ActiveSub | null> {
  return prisma.subscription.findUnique({ where: { userId }, include: { plan: true } });
}

export async function requireActiveSubscription(userId: string): Promise<ActiveSub> {
  const sub = await getSubscription(userId);
  if (!sub || !isActive(sub)) throw new HttpError(402, "You need an active subscription to do this");
  return sub;
}

export async function startTrial(userId: string) {
  if (env.trialDays <= 0) return;
  const plan = await prisma.plan.findFirst({ where: { isActive: true }, orderBy: { sortOrder: "asc" } });
  if (!plan) return;
  const now = new Date();
  await prisma.subscription.create({
    data: {
      userId,
      planId: plan.id,
      status: "TRIALING",
      currentPeriodStart: now,
      currentPeriodEnd: new Date(now.getTime() + env.trialDays * 86_400_000),
      provider: "trial",
    },
  });
}

/** Starts or extends a paid period. Extends from the current end date when still active. */
export async function activateSubscription(
  userId: string,
  planId: string,
  opts: { days?: number; provider: string; providerRef?: string; periodEnd?: Date },
) {
  const existing = await prisma.subscription.findUnique({ where: { userId } });
  const now = new Date();
  const base =
    existing && existing.status !== "TRIALING" && existing.planId === planId && existing.currentPeriodEnd > now
      ? existing.currentPeriodEnd
      : now;
  const end = opts.periodEnd ?? new Date(base.getTime() + (opts.days ?? 30) * 86_400_000);
  const data = {
    planId,
    status: "ACTIVE" as const,
    currentPeriodStart: now,
    currentPeriodEnd: end,
    provider: opts.provider,
    providerRef: opts.providerRef ?? null,
  };
  return prisma.subscription.upsert({ where: { userId }, update: data, create: { userId, ...data } });
}

export async function cancelSubscription(userId: string) {
  await prisma.subscription.updateMany({
    where: { userId, status: { in: ["ACTIVE", "TRIALING"] } },
    data: { status: "CANCELED" },
  });
}

export async function expireSubscriptions() {
  const res = await prisma.subscription.updateMany({
    where: { status: { in: ["ACTIVE", "TRIALING", "CANCELED"] }, currentPeriodEnd: { lte: new Date() } },
    data: { status: "EXPIRED" },
  });
  return res.count;
}

export async function usage(userId: string) {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const [accounts, postsThisMonth, sheets] = await Promise.all([
    prisma.socialAccount.count({ where: { userId } }),
    prisma.postTarget.count({
      where: { post: { userId }, status: { not: "CANCELED" }, createdAt: { gte: monthStart } },
    }),
    prisma.sheetConnection.count({ where: { userId } }),
  ]);
  return { accounts, postsThisMonth, sheets };
}

export async function assertCanSchedule(userId: string, newTargets: number) {
  const sub = await requireActiveSubscription(userId);
  const u = await usage(userId);
  if (u.postsThisMonth + newTargets > sub.plan.maxPostsPerMonth) {
    throw new HttpError(
      402,
      `Your ${sub.plan.name} plan allows ${sub.plan.maxPostsPerMonth} scheduled posts per month. Upgrade to schedule more.`,
    );
  }
  return sub;
}
