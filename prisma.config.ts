// Prisma leest hier waar de database staat. Lokaal komt dat uit .env, op Vercel
// uit de POSTGRES_*-variabelen die de gekoppelde database injecteert.
import "dotenv/config";
import { defineConfig } from "prisma/config";

const url =
  process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL;

// Migraties moeten langs de pooler heen: die blokkeert de locks die Prisma
// nodig heeft.
const directUrl =
  process.env.DIRECT_DATABASE_URL || process.env.POSTGRES_URL_NON_POOLING || url;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "npx tsx prisma/seed.ts",
  },
  datasource: {
    url: directUrl,
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
