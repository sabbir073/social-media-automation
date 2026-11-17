import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { accountContext, getProvider } from "./providers";

/** Refreshes engagement numbers for recently published posts. Returns how many were updated. */
export async function refreshMetrics(limit = 300): Promise<number> {
  const targets = await prisma.postTarget.findMany({
    where: {
      status: "PUBLISHED",
      externalPostId: { not: null },
      publishedAt: { gte: new Date(Date.now() - 30 * 86_400_000) },
      account: { status: "CONNECTED" },
      OR: [{ metricsAt: null }, { metricsAt: { lt: new Date(Date.now() - 3 * 3_600_000) } }],
    },
    orderBy: { metricsAt: { sort: "asc", nulls: "first" } },
    take: limit,
    include: { account: true },
  });
  let updated = 0;
  for (const t of targets) {
    const provider = getProvider(t.account.platform);
    if (!provider.metrics) continue;
    try {
      const metrics = await provider.metrics(await accountContext(t.account), t.externalPostId!);
      await prisma.postTarget.update({
        where: { id: t.id },
        data: { metrics: metrics as Prisma.InputJsonValue, metricsAt: new Date() },
      });
      updated++;
    } catch {
      // Deleted posts and missing permissions are expected; try again next cycle.
      await prisma.postTarget.update({ where: { id: t.id }, data: { metricsAt: new Date() } });
    }
  }
  return updated;
}
