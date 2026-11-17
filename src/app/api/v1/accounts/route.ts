import { prisma } from "@/lib/db";
import { handler } from "@/lib/http";

/** Public API: list connected accounts (ids are needed to create posts). */
export const GET = handler(
  async ({ user }) => {
    const accounts = await prisma.socialAccount.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
    return {
      accounts: accounts.map((a) => ({ id: a.id, platform: a.platform.toLowerCase(), name: a.name, username: a.username, status: a.status.toLowerCase(), paused: a.paused })),
    };
  },
  { apiKey: true },
);
