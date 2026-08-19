// Een inlog die alleen lokaal bestaat.
//
//   npx tsx scripts/dev-gebruiker.mts
//
// De geïmporteerde gebruikers dragen de wachtwoordhashes van productie mee;
// daar kun je lokaal niet mee inloggen zonder het echte wachtwoord te kennen,
// en dat wil je ook niet. Dit maakt een aparte ontwikkelaar aan.
import "dotenv/config";
import bcrypt from "bcryptjs";

const { db } = await import("../src/lib/db");
if (!process.env.DATABASE_URL?.includes("localhost")) {
  console.error("WEIGER: dit is geen lokale database.");
  process.exit(1);
}

const email = "dev@localhost";
const wachtwoord = "dev-alleen-lokaal";

await db.user.upsert({
  where: { email },
  update: { passwordHash: await bcrypt.hash(wachtwoord, 10), role: "owner" },
  create: { email, name: "Ontwikkelaar", role: "owner", passwordHash: await bcrypt.hash(wachtwoord, 10) },
});
console.log(`  ${email} / ${wachtwoord} — eigenaar, alleen op deze machine`);
