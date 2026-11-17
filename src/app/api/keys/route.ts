import { z } from "zod";
import { randomToken, sha256 } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { body, handler, HttpError } from "@/lib/http";

/** Creates an API key. The full key is returned once and only its hash is stored. */
export const POST = handler(async ({ req, user }) => {
  const { name } = await body(req, z.object({ name: z.string().trim().min(1, "Name the key").max(60) }));
  if ((await prisma.apiKey.count({ where: { userId: user.id } })) >= 10) throw new HttpError(400, "You can have up to 10 API keys");
  const key = `sk_${randomToken(32)}`;
  await prisma.apiKey.create({ data: { userId: user.id, name, prefix: key.slice(0, 10), keyHash: sha256(key) } });
  return { key };
});
