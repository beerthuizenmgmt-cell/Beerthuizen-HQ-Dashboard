// Een inlog aanmaken of het wachtwoord ervan opnieuw zetten.
//
//   HQ_EMAIL='jij@voorbeeld.nl' HQ_WACHTWOORD='...' npx tsx scripts/wachtwoord-zetten.mts
//
// Met HQ_ROL='member' krijgt het account de dagelijkse kantooromgeving zonder
// instellingen en geldzaken; laat je hem weg, dan wordt het owner. Bij een
// bestaand account blijft de rol staan die er al was — een script hoort niemand
// ongevraagd te promoveren.
//
// Waarom dit bestaat: de seed maakt het eigenaarsaccount aan met een upsert
// waarvan de update-tak leeg is. Bestaat het account al, dan doet `npm run
// db:seed` niets meer met het wachtwoord — precies de situatie waarin je
// buitengesloten staat en er geen weg terug is.
//
// Het wachtwoord komt uit de omgeving en niet van de opdrachtregel: argumenten
// belanden in je shell-geschiedenis, omgevingsvariabelen van één commando niet.
// Het wordt hier ook nergens afgedrukt of gelogd.
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { poolConfig, resolveDirectUrl } from "../src/lib/db-url";

const email = process.env.HQ_EMAIL?.trim().toLowerCase();
const wachtwoord = process.env.HQ_WACHTWOORD;
const rol = process.env.HQ_ROL ?? "owner";

if (rol !== "owner" && rol !== "member") {
  console.error(`WEIGER: HQ_ROL is 'owner' of 'member', niet '${rol}'.`);
  process.exit(1);
}

if (!email || !wachtwoord) {
  console.error(
    "Zet HQ_EMAIL en HQ_WACHTWOORD.\n" +
      "Bijvoorbeeld: HQ_EMAIL='jij@voorbeeld.nl' HQ_WACHTWOORD='...' npx tsx scripts/wachtwoord-zetten.mts",
  );
  process.exit(1);
}

// Twaalf tekens is geen wet, maar dit account geeft toegang tot alles: klanten,
// facturen, contracten en de sleutels van het team.
if (wachtwoord.length < 12) {
  console.error("WEIGER: kies een wachtwoord van minstens 12 tekens.");
  process.exit(1);
}

const url = resolveDirectUrl();
if (!url) {
  console.error(
    "Geen database gevonden. Zet DATABASE_URL in .env — voor Supabase de directe\n" +
      "verbinding, niet die via de pooler.",
  );
  process.exit(1);
}

const db = new PrismaClient({ adapter: new PrismaPg(poolConfig(url)) });

// Kosten 12, gelijk aan de seed: een hash die hier goedkoper is dan daar zou een
// stil zwakker account opleveren dan het account dat de seed maakt.
const passwordHash = await bcrypt.hash(wachtwoord, 12);

const bestond = await db.user.findUnique({ where: { email }, select: { id: true } });

const user = await db.user.upsert({
  where: { email },
  // Alleen het wachtwoord: wie hier al stond houdt de rol die hij had.
  update: { passwordHash },
  create: { email, name: email.split("@")[0], role: rol, passwordHash },
});

console.log(
  bestond
    ? `✓ wachtwoord opnieuw gezet voor ${user.email} (${user.role})`
    : `✓ nieuw account ${user.email} aangemaakt als ${user.role}`,
);

await db.$disconnect();
