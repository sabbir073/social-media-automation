import { prisma } from "@/lib/db";
import { handler, HttpError } from "@/lib/http";
import { checkAccount } from "@/lib/providers";

export const POST = handler<{ id: string }>(async ({ params, user }) => {
  const account = await prisma.socialAccount.findFirst({ where: { id: params.id, userId: user.id } });
  if (!account) throw new HttpError(404, "Account not found");
  return checkAccount(account);
});
