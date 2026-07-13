import { Prisma, PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/**
 * Run a check-then-act sequence as a SERIALIZABLE transaction, retrying on
 * serialization conflicts. The booking/reclaim/role flows all rely on reads
 * inside the transaction staying valid until the write commits — plain READ
 * COMMITTED (the Postgres default) allows write-skew between them.
 */
export async function serializableTx<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (err) {
      const retriable =
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2034"; // transaction conflict / deadlock
      if (!retriable || attempt >= 3) throw err;
      await new Promise((r) => setTimeout(r, 25 * (attempt + 1)));
    }
  }
}
