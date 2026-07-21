import { prisma } from "./src/lib/prisma";
import bcrypt from "bcryptjs";

async function main() {
  const hash = await bcrypt.hash("Assessor123!", 10);

  const assessors = [
    { username: "megan",    name: "Megan" },
    { username: "paul",     name: "Paul" },
    { username: "tecklee",  name: "Teck Lee" },
    { username: "presca",   name: "Presca" },
    { username: "denry",    name: "Denry" },
    { username: "regina",   name: "Regina" },
  ];

  console.log("=== Creating assessor accounts ===");
  console.log(`Default password: Assessor123!\n`);

  for (const a of assessors) {
    const existing = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM "User" WHERE username = $1`, a.username
    );

    if (existing.length > 0) {
      await prisma.$executeRawUnsafe(
        `UPDATE "User" SET "passwordHash" = $1 WHERE username = $2`, hash, a.username
      );
      console.log(`  ✅ ${a.name} (${a.username}) — password reset`);
    } else {
      const id = `usr_${Date.now()}_${a.username}`;
      await prisma.$executeRawUnsafe(
        `INSERT INTO "User" (id, name, username, "passwordHash", role, "createdAt", "totalPoints", "dailyPointStreak", "confidenceInfluencer")
         VALUES ($1, $2, $3, $4, 'Assessor', NOW(), 0, 0, false)`,
        id, a.name, a.username, hash
      );
      console.log(`  🆕 ${a.name} (${a.username}) — created`);
    }
  }

  // Verify
  console.log("\n=== All Users ===");
  const allUsers = await prisma.$queryRawUnsafe<Array<{ username: string; name: string; role: string }>>(
    `SELECT username, name, role FROM "User" ORDER BY name`
  );
  console.table(allUsers);
  console.log(`\nTotal: ${allUsers.length} users`);
  console.log(`Password for all assessors: "Assessor123!"`);
  console.log(`Admin password: "PaaP6ggFHqsr" (unchanged)`);
  
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
