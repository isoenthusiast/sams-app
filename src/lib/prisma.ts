import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL ?? "postgresql://seam:seam123@localhost:5432/seam_assurance";
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

let cachedPrisma: PrismaClient;

export const prisma = new Proxy({} as PrismaClient, {
  get(_, prop) {
    if (!cachedPrisma) {
      cachedPrisma = globalForPrisma.prisma ?? createPrismaClient();
      if (process.env.NODE_ENV !== "production") {
        globalForPrisma.prisma = cachedPrisma;
      }
    }
    const value = (cachedPrisma as unknown as Record<string | symbol, unknown>)[prop];
    if (typeof value === "function") {
      return value.bind(cachedPrisma);
    }
    return value;
  },
});
