import { prisma } from "@/lib/db";
import { handler, HttpError } from "@/lib/http";

/** Public API: status of a post and each of its targets. */
export const GET = handler<{ id: string }>(
  async ({ params, user }) => {
    const post = await prisma.post.findFirst({ where: { id: params.id, userId: user.id }, include: { targets: { include: { account: true } } } });
    if (!post) throw new HttpError(404, "Post not found");
    return {
      id: post.id,
      caption: post.caption,
      targets: post.targets.map((t) => ({
        id: t.id,
        accountId: t.accountId,
        platform: t.account.platform.toLowerCase(),
        status: t.status.toLowerCase(),
        scheduledAt: t.scheduledAt,
        publishedAt: t.publishedAt,
        url: t.externalUrl,
        error: t.error,
        metrics: t.metrics,
      })),
    };
  },
  { apiKey: true },
);
