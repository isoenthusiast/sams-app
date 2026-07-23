import { prisma } from "../src/lib/prisma";

async function main() {
  const tables = await prisma.$queryRawUnsafe<Array<{ tablename: string }>>(
    `SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname='public' ORDER BY tablename`
  );
  console.log("ALL tables:", JSON.stringify(tables.map((t: any) => t.tablename)));

  await prisma.$disconnect();
  process.exit(0);
}

  await prisma.$disconnect();
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
