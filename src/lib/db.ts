import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { resolveDatabaseUrl, poolConfig } from "./db-url";

// Next hergebruikt modules tussen hot reloads; zonder deze cache bouwt elke
// reload een nieuwe pool op en loopt Postgres vol.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const connectionString = resolveDatabaseUrl();
  if (!connectionString) {
    throw new Error(
      "Geen databaseverbinding gevonden. Lokaal: start `npm run db:dev` en zet DATABASE_URL in .env. " +
        "Op Vercel: koppel de Postgres-database aan dit project.",
    );
  }

  return new PrismaClient({
    adapter: new PrismaPg(poolConfig(connectionString)),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
