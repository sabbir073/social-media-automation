import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** Starter plans. Edit names, prices and limits from the admin panel afterwards. */
const plans = [
  { slug: "starter", name: "Starter", description: "For one brand getting started", priceCents: 900, maxAccounts: 4, maxPostsPerMonth: 120, maxSheets: 1, sortOrder: 1 },
  { slug: "pro", name: "Pro", description: "For busy creators and small teams", priceCents: 1900, maxAccounts: 12, maxPostsPerMonth: 600, maxSheets: 5, sortOrder: 2 },
  { slug: "agency", name: "Agency", description: "For agencies managing many brands", priceCents: 4900, maxAccounts: 50, maxPostsPerMonth: 3000, maxSheets: 25, sortOrder: 3 },
];

async function main() {
  for (const p of plans) {
    await prisma.plan.upsert({ where: { slug: p.slug }, update: {}, create: p });
  }
  console.log(`Seeded ${plans.length} plans`);
}

main().finally(() => prisma.$disconnect());
