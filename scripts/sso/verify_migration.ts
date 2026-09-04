import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  // Column metadata from information_schema
  const rows = await prisma.$queryRawUnsafe<Array<{ column_name: string; data_type: string; column_default: string | null }>>(
    `SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name='User' AND column_name='mustChangePassword'`
  );
  console.log("mustChangePassword columns:", JSON.stringify(rows));

  // Confirm default is applied to a NEW user row (create a throwaway user, then delete)
  const u = await prisma.user.create({
    data: { name: "SAMS012 Probe", username: `sams012_probe_${Date.now()}`, passwordHash: "x" },
    select: { id: true, username: true, mustChangePassword: true },
  });
  console.log("new user mustChangePassword (default):", u.mustChangePassword);
  await prisma.user.delete({ where: { id: u.id } });
  console.log("DONE");
}

main()
  .catch((e) => { console.error("verify failed:", e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
