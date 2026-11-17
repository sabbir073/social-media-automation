import { prisma } from "@/lib/db";
import { handler } from "@/lib/http";

/** Marks every notification as read. */
export const POST = handler(async ({ user }) => {
  await prisma.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
});

export const DELETE = handler(async ({ user }) => {
  await prisma.notification.deleteMany({ where: { userId: user.id } });
});
