import { z } from "zod";
import { assertCanSchedule } from "@/lib/billing/entitlements";
import { prisma } from "@/lib/db";
import { body, handler, HttpError } from "@/lib/http";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("cancel") }),
  z.object({ action: z.literal("retry") }),
  z.object({ action: z.literal("reschedule"), scheduledAt: z.string().datetime({ offset: true }) }),
]);

async function find(id: string, userId: string) {
  const target = await prisma.postTarget.findFirst({ where: { id, post: { userId } } });
  if (!target) throw new HttpError(404, "Scheduled post not found");
  return target;
}

export const PATCH = handler<{ id: string }>(async ({ req, params, user }) => {
  const data = await body(req, schema);
  const target = await find(params.id, user.id);
  // Conditional updates: if the worker picked the target up meanwhile, the change is refused.
  let changed = 0;
  if (data.action === "cancel") {
    changed = (await prisma.postTarget.updateMany({ where: { id: target.id, status: "SCHEDULED" }, data: { status: "CANCELED" } })).count;
  } else if (data.action === "reschedule") {
    changed = (
      await prisma.postTarget.updateMany({
        where: { id: target.id, status: "SCHEDULED" },
        data: { scheduledAt: new Date(data.scheduledAt), nextAttemptAt: null },
      })
    ).count;
  } else {
    await assertCanSchedule(user.id, 0);
    changed = (
      await prisma.postTarget.updateMany({
        where: { id: target.id, status: { in: ["FAILED", "CANCELED"] } },
        data: { status: "SCHEDULED", attempts: 0, error: null, nextAttemptAt: null, ...(target.scheduledAt < new Date() ? { scheduledAt: new Date() } : {}) },
      })
    ).count;
  }
  if (changed === 0) throw new HttpError(409, "This post can no longer be changed");
});

export const DELETE = handler<{ id: string }>(async ({ params, user }) => {
  const target = await find(params.id, user.id);
  const r = await prisma.postTarget.deleteMany({ where: { id: target.id, status: { notIn: ["QUEUED", "PUBLISHING"] } } });
  if (r.count === 0) throw new HttpError(409, "This post is being published right now");
  await prisma.post.deleteMany({ where: { id: target.postId, targets: { none: {} } } });
});
