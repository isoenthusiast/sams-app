import { seedSso } from "./seed";
import { prisma } from "@/lib/prisma";

// Standalone seed runner: `tsx scripts/sso/run_seed.ts`
seedSso()
  .then(() => console.log("SAMS-012 SSO fixtures seeded."))
  .catch((e) => { console.error("SAMS-012 seed errored:", e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
