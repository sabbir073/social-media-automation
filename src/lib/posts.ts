import type { Prisma } from "@prisma/client";
import { assertCanSchedule } from "./billing/entitlements";
import { prisma } from "./db";
import { HttpError } from "./http";
import { getProvider } from "./providers";

export type TargetInput = {
  accountId: string;
  scheduledAt: Date;
  captionOverride?: string | null;
  options?: Record<string, unknown>;
};

export type PostInput = {
  caption: string;
  title: string;
  link: string;
  mediaIds: string[];
  targets: TargetInput[];
};

/** Creates one post with an independent schedule per account, after validating every target. */
export async function createPost(userId: string, input: PostInput, source: "app" | "sheet" = "app") {
  if (input.targets.length === 0) throw new HttpError(400, "Choose at least one account");
  const ids = input.targets.map((t) => t.accountId);
  if (new Set(ids).size !== ids.length) throw new HttpError(400, "Each account can only be chosen once per post");

  const [accounts, media] = await Promise.all([
    prisma.socialAccount.findMany({ where: { userId, id: { in: ids } } }),
    prisma.mediaAsset.findMany({ where: { userId, id: { in: input.mediaIds } } }),
  ]);
  if (accounts.length !== ids.length) throw new HttpError(400, "One of the chosen accounts no longer exists");
  if (media.length !== new Set(input.mediaIds).size) throw new HttpError(400, "One of the media files no longer exists");
  const ordered = input.mediaIds.map((id) => media.find((m) => m.id === id)!);

  const horizon = Date.now() + 366 * 86_400_000;
  for (const t of input.targets) {
    const account = accounts.find((a) => a.id === t.accountId)!;
    if (Number.isNaN(t.scheduledAt.getTime())) throw new HttpError(400, `${account.name}: invalid date`);
    if (t.scheduledAt.getTime() > horizon) throw new HttpError(400, `${account.name}: schedule within one year`);
    const errors = getProvider(account.platform).validate({
      caption: t.captionOverride?.trim() ? t.captionOverride : input.caption,
      title: input.title,
      link: input.link,
      media: ordered.map((m) => ({ kind: m.kind })),
      options: t.options ?? {},
    });
    if (errors.length) throw new HttpError(400, `${account.name}: ${errors.join(" ")}`);
  }

  await assertCanSchedule(userId, input.targets.length);

  return prisma.post.create({
    data: {
      userId,
      caption: input.caption,
      title: input.title,
      link: input.link,
      source,
      media: { create: ordered.map((m, i) => ({ mediaId: m.id, position: i })) },
      targets: {
        create: input.targets.map((t) => ({
          accountId: t.accountId,
          scheduledAt: t.scheduledAt,
          captionOverride: t.captionOverride?.trim() ? t.captionOverride : null,
          options: (t.options ?? {}) as Prisma.InputJsonValue,
        })),
      },
    },
    include: { targets: true },
  });
}
