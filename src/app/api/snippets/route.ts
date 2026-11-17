import { z } from "zod";
import { prisma } from "@/lib/db";
import { body, handler, HttpError } from "@/lib/http";

const schema = z.object({ name: z.string().trim().min(1, "Give it a name").max(60), body: z.string().trim().min(1, "Add some text").max(5000) });

export const POST = handler(async ({ req, user }) => {
  const data = await body(req, schema);
  if ((await prisma.snippet.count({ where: { userId: user.id } })) >= 200) throw new HttpError(400, "You can save up to 200 templates");
  await prisma.snippet.create({ data: { userId: user.id, ...data } });
});
