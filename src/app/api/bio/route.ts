import { z } from "zod";
import { prisma } from "@/lib/db";
import { body, handler, HttpError } from "@/lib/http";

const RESERVED = new Set(["admin", "api", "app", "login", "register", "media", "privacy", "terms"]);

const schema = z.object({
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{2,29}$/, "Use 3-30 letters, numbers or dashes"),
  title: z.string().trim().min(1, "Add a title").max(60),
  bio: z.string().trim().max(300).default(""),
  links: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(60),
        url: z.string().trim().url().max(1000).refine((u) => /^https?:\/\//i.test(u), "Links must start with http:// or https://"),
      }),
    )
    .max(30),
});

/** Creates or updates the user's public link-in-bio page. */
export const PUT = handler(async ({ req, user }) => {
  const data = await body(req, schema);
  if (RESERVED.has(data.slug)) throw new HttpError(400, "That address is reserved");
  const taken = await prisma.bioPage.findUnique({ where: { slug: data.slug } });
  if (taken && taken.userId !== user.id) throw new HttpError(409, "That address is already taken");
  await prisma.bioPage.upsert({ where: { userId: user.id }, update: data, create: { userId: user.id, ...data } });
});

export const DELETE = handler(async ({ user }) => {
  await prisma.bioPage.deleteMany({ where: { userId: user.id } });
});
