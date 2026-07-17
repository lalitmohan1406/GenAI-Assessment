import { PrismaClient } from "@prisma/client";

/**
 * Single shared PrismaClient. Next.js hot-reloads modules in dev, which would
 * otherwise create a new client (and a new DB connection pool) on every reload
 * and eventually exhaust connections. Caching it on `globalThis` avoids that.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
