import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __devadsPrisma: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  globalThis.__devadsPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__devadsPrisma = prisma;
}

export * from "@prisma/client";
