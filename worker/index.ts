/**
 * Background worker. Run exactly one scheduler; publishing itself is safe to scale because
 * each target is claimed atomically in Postgres before it is posted.
 *
 *   every 15 s   move due targets onto the publish queue
 *   every 5 min  sync Google Sheets, recover targets orphaned by a crash
 *   every 15 min check RSS feeds for new items
 *   every hour   refresh engagement numbers of recent posts
 *   every hour   expire subscriptions, re-verify account connections (refreshing tokens)
 */
import { Worker } from "bullmq";
import IORedis from "ioredis";
import { expireSubscriptions, isActive } from "@/lib/billing/entitlements";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { checkAccount } from "@/lib/providers";
import { claimDueTargets, publishTarget, recoverStuckTargets } from "@/lib/publish";
import { PUBLISH_QUEUE, publishQueue } from "@/lib/queue";
import { syncFeed } from "@/lib/feeds";
import { refreshMetrics } from "@/lib/metrics";
import { sendWeeklyReports } from "@/lib/reports";
import { syncSheet } from "@/lib/sheets";

const log = (...a: unknown[]) => console.log(new Date().toISOString(), "[worker]", ...a);

const worker = new Worker(
  PUBLISH_QUEUE,
  async (job) => {
    const outcome = await publishTarget(job.data.targetId);
    log(`target ${job.data.targetId}: ${outcome}`);
    return outcome;
  },
  { connection: new IORedis(env.redisUrl, { maxRetriesPerRequest: null }), concurrency: Number(process.env.PUBLISH_CONCURRENCY || 5) },
);
worker.on("error", (e) => log("queue error:", e.message));

/** Wraps a periodic task so a slow run never overlaps the next one and never crashes the process. */
function every(ms: number, name: string, fn: () => Promise<void>) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await fn();
    } catch (e) {
      log(`${name} failed:`, (e as Error).message);
    } finally {
      running = false;
    }
  };
  void run();
  return setInterval(run, ms);
}

const timers = [
  every(15_000, "enqueue", async () => {
    const ids = await claimDueTargets();
    if (!ids.length) return;
    try {
      await publishQueue().addBulk(ids.map((targetId) => ({ name: "publish", data: { targetId } })));
      log(`queued ${ids.length} target(s)`);
    } catch (e) {
      // Redis is unavailable: hand the targets back so the next tick retries them.
      await prisma.postTarget.updateMany({ where: { id: { in: ids }, status: "QUEUED" }, data: { status: "SCHEDULED" } });
      throw e;
    }
  }),

  every(5 * 60_000, "sheets", async () => {
    const sheets = await prisma.sheetConnection.findMany({
      where: { enabled: true },
      include: { user: { include: { subscription: true } } },
    });
    for (const s of sheets) {
      if (!isActive(s.user.subscription)) continue;
      try {
        log(`sheet ${s.id}: ${await syncSheet(s.id)}`);
      } catch (e) {
        log(`sheet ${s.id} failed: ${(e as Error).message}`);
      }
    }
  }),

  every(15 * 60_000, "feeds", async () => {
    const feeds = await prisma.feed.findMany({ where: { enabled: true }, select: { id: true } });
    for (const f of feeds) {
      try {
        log(`feed ${f.id}: ${await syncFeed(f.id)}`);
      } catch (e) {
        log(`feed ${f.id} failed: ${(e as Error).message}`);
      }
    }
  }),

  every(60 * 60_000, "metrics", async () => {
    const n = await refreshMetrics();
    if (n) log(`refreshed engagement numbers for ${n} post(s)`);
  }),

  every(5 * 60_000, "recover", async () => {
    const r = await recoverStuckTargets();
    if (r.requeued || r.failed) log(`recovered ${r.requeued} queued, failed ${r.failed} interrupted`);
  }),

  every(60 * 60_000, "maintenance", async () => {
    const expired = await expireSubscriptions();
    if (expired) log(`expired ${expired} subscription(s)`);
    const reports = await sendWeeklyReports();
    if (reports) log(`sent ${reports} weekly report(s)`);
    const stale = await prisma.socialAccount.findMany({
      where: { OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: new Date(Date.now() - 24 * 3_600_000) } }] },
      take: 500,
    });
    for (const account of stale) await checkAccount(account);
    if (stale.length) log(`re-verified ${stale.length} account connection(s)`);

  }),
];

async function shutdown(signal: string) {
  log(`${signal} received, finishing in-flight jobs`);
  timers.forEach(clearInterval);
  await worker.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

log("started");
