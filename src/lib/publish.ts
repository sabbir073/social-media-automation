import { access } from "node:fs/promises";
import { isActive } from "./billing/entitlements";
import { prisma } from "./db";
import { accountContext, getProvider, markAccountBroken, ProviderError } from "./providers";
import { filePath, publicUrl } from "./storage";

export const MAX_ATTEMPTS = 3;
const BACKOFF_MIN = [2, 10];

/**
 * Publishes one target. Safe to call more than once: only a target in QUEUED state is
 * claimed, so duplicate jobs cannot double-post.
 */
export async function publishTarget(targetId: string): Promise<"published" | "retry" | "failed" | "skipped"> {
  const claimed = await prisma.postTarget.updateMany({
    where: { id: targetId, status: "QUEUED" },
    data: { status: "PUBLISHING" },
  });
  if (claimed.count !== 1) return "skipped";

  const target = await prisma.postTarget.findUniqueOrThrow({
    where: { id: targetId },
    include: {
      account: true,
      post: {
        include: {
          media: { orderBy: { position: "asc" }, include: { media: true } },
          user: { include: { subscription: true } },
        },
      },
    },
  });
  const { post, account } = target;
  const provider = getProvider(account.platform);

  try {
    if (!isActive(post.user.subscription)) {
      throw new ProviderError("Subscription is not active. Renew your plan, then retry this post.");
    }
    const media = [];
    for (const pm of post.media) {
      const path = filePath(pm.media.key);
      await access(path).catch(() => {
        throw new ProviderError(`Media file "${pm.media.originalName}" is missing from storage`);
      });
      media.push({
        key: pm.media.key,
        url: publicUrl(pm.media.key),
        path,
        mime: pm.media.mime,
        kind: pm.media.kind,
        size: pm.media.size,
      });
    }
    const input = {
      caption: target.captionOverride ?? post.caption,
      title: post.title,
      link: post.link,
      media,
      options: (target.options ?? {}) as Record<string, unknown>,
    };
    const problems = provider.validate(input);
    if (problems.length) throw new ProviderError(problems.join(" "));

    const ctx = await accountContext(account);
    const result = await provider.publish(ctx, input);

    await prisma.postTarget.update({
      where: { id: target.id },
      data: {
        status: "PUBLISHED",
        publishedAt: new Date(),
        externalPostId: result.externalId,
        externalUrl: result.url ?? null,
        error: null,
        attempts: { increment: 1 },
        nextAttemptAt: null,
      },
    });
    if (account.status !== "CONNECTED") {
      await prisma.socialAccount.update({
        where: { id: account.id },
        data: { status: "CONNECTED", statusMessage: null, lastCheckedAt: new Date() },
      });
    }
    return "published";
  } catch (e) {
    const err =
      e instanceof ProviderError ? e : new ProviderError((e as Error).message || "Unexpected error", { retryable: false });
    if (!(e instanceof ProviderError)) console.error(`[publish] target ${target.id}`, e);
    if (err.reauth) await markAccountBroken(account.id, err);

    const attempts = target.attempts + 1;
    const retry = err.retryable && !err.reauth && attempts < MAX_ATTEMPTS;
    await prisma.postTarget.update({
      where: { id: target.id },
      data: retry
        ? {
            status: "SCHEDULED",
            attempts,
            error: err.message.slice(0, 1000),
            nextAttemptAt: new Date(Date.now() + BACKOFF_MIN[Math.min(attempts - 1, BACKOFF_MIN.length - 1)] * 60_000),
          }
        : {
            status: "FAILED",
            attempts,
            nextAttemptAt: null,
            error: (err.reauth ? `Reconnect this account, then retry. ${err.message}` : err.message).slice(0, 1000),
          },
    });
    return retry ? "retry" : "failed";
  }
}

/** Moves due targets to QUEUED and returns their ids. Each id is returned exactly once. */
export async function claimDueTargets(limit = 200): Promise<string[]> {
  const now = new Date();
  const due = await prisma.postTarget.findMany({
    where: {
      status: "SCHEDULED",
      scheduledAt: { lte: now },
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
    },
    orderBy: { scheduledAt: "asc" },
    take: limit,
    select: { id: true },
  });
  const claimed: string[] = [];
  for (const t of due) {
    const r = await prisma.postTarget.updateMany({ where: { id: t.id, status: "SCHEDULED" }, data: { status: "QUEUED" } });
    if (r.count === 1) claimed.push(t.id);
  }
  return claimed;
}

/**
 * Recovers targets orphaned by a crash. QUEUED ones are safe to re-run. PUBLISHING ones may
 * already be live on the network, so they are failed for a human to check rather than re-posted.
 */
export async function recoverStuckTargets() {
  const cutoff = new Date(Date.now() - 45 * 60_000);
  const requeued = await prisma.postTarget.updateMany({
    where: { status: "QUEUED", updatedAt: { lt: cutoff } },
    data: { status: "SCHEDULED" },
  });
  const failed = await prisma.postTarget.updateMany({
    where: { status: "PUBLISHING", updatedAt: { lt: cutoff } },
    data: {
      status: "FAILED",
      error: "Publishing was interrupted. Check the account to see whether the post went out before retrying.",
    },
  });
  return { requeued: requeued.count, failed: failed.count };
}
