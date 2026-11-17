import { prisma } from "@/lib/db";
import { handler } from "@/lib/http";

/** Hides the getting-started checklist. */
export const POST = handler(async ({ user }) => {
  await prisma.user.update({ where: { id: user.id }, data: { onboardingDone: true } });
});
