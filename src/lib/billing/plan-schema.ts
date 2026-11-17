import { z } from "zod";

export const planSchema = z.object({
  name: z.string().trim().min(1).max(40),
  description: z.string().trim().max(200).default(""),
  priceCents: z.number().int().min(0).max(10_000_000),
  currency: z.string().trim().toUpperCase().length(3),
  maxAccounts: z.number().int().min(1).max(10_000),
  maxPostsPerMonth: z.number().int().min(1).max(1_000_000),
  maxSheets: z.number().int().min(0).max(1000),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(1000).default(0),
});

