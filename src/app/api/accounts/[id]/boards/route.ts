import { prisma } from "@/lib/db";
import { handler, HttpError } from "@/lib/http";
import { accountContext, ProviderError } from "@/lib/providers";
import { listBoards } from "@/lib/providers/pinterest";

export const GET = handler<{ id: string }>(async ({ params, user }) => {
  const account = await prisma.socialAccount.findFirst({ where: { id: params.id, userId: user.id, platform: "PINTEREST" } });
  if (!account) throw new HttpError(404, "Account not found");
  try {
    return { boards: await listBoards((await accountContext(account)).accessToken) };
  } catch (e) {
    if (e instanceof ProviderError) throw new HttpError(502, e.message);
    throw e;
  }
});
