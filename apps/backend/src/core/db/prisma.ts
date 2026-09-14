import { PrismaClient } from "@prisma/client";

/**
 * Single PrismaClient for the process. In dev with --watch we cache it on
 * globalThis so hot reloads don't open a new connection pool each time.
 *
 * Full-class attendance saves intentionally keep enrollment/session locks while
 * persisting Check 1 and the authoritative register. Prisma's 5s interactive
 * transaction default is too short for that bounded workflow on production DB
 * latency, so keep a conservative 30s ceiling while preserving atomicity.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "production" ? ["error"] : ["error", "warn"],
    transactionOptions: {
      maxWait: 5_000,
      timeout: 30_000,
    },
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
