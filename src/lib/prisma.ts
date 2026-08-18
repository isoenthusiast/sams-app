import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set — add it to .env / .env.local");
  }
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
