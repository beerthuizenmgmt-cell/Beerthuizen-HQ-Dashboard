// Een inlog aanmaken of het wachtwoord ervan opnieuw zetten.
//
//   npx tsx scripts/wachtwoord-zetten.mts
//
// Het script vraagt wat het nodig heeft. Je wachtwoord wordt onder het typen
// niet getoond en niet afgedrukt; het belandt ook niet in je shell-geschiedenis,
// want er staat niets van op de opdrachtregel.
//
// Waarom dit bestaat: de seed maakt het eigenaarsaccount aan met een upsert
// waarvan de update-tak leeg is. Bestaat het account al, dan doet `npm run
// db:seed` niets meer met het wachtwoord — precies de situatie waarin je
// buitengesloten staat en er geen weg terug is.
//
// Met HQ_ROL='member' krijgt een nieuw account de dagelijkse kantooromgeving
// zonder instellingen en geldzaken; laat je hem weg, dan wordt het owner. Bij
// een bestaand account blijft de rol staan die er al was — een script hoort
// niemand ongevraagd te promoveren. Voor onbewaakt draaien kun je HQ_EMAIL en
// HQ_WACHTWOORD meegeven; dan wordt er niets gevraagd.
import "dotenv/config";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { poolConfig, resolveDirectUrl } from "../src/lib/db-url";

/// De uitvoer loopt door een klep die we dichtzetten zodra er iets geheims
/// getypt wordt. Readline echoot dan nog wel, maar in het niets.
let gedempt = false;
const uitvoer = new Writable({
  write(stuk, codering: BufferEncoding, klaar) {
    if (!gedempt) process.stdout.write(stuk, codering);
    klaar();
  },
});

const rl = createInterface({ input: process.stdin, output: uitvoer, terminal: true });

async function vraag(tekst: string): Promise<string> {
  return (await rl.question(tekst)).trim();
}

/// Hetzelfde, maar wat je typt blijft onzichtbaar.
async function vraagGeheim(tekst: string): Promise<string> {
  process.stdout.write(tekst);
  gedempt = true;
  const antwoord = await rl.question("");
  gedempt = false;
  process.stdout.write("\n");
  return antwoord;
}

function stop(bericht: string): never {
  console.error(bericht);
  rl.close();
  process.exit(1);
}

const rol = process.env.HQ_ROL ?? "owner";
if (rol !== "owner" && rol !== "member") {
  stop(`WEIGER: HQ_ROL is 'owner' of 'member', niet '${rol}'.`);
}

// Zonder toetsenbord kunnen we niets vragen. Dan moet alles uit de omgeving
// komen, anders zou het script hier stil blijven hangen.
const interactief = process.stdin.isTTY === true;
if (!interactief && !(process.env.HQ_EMAIL && process.env.HQ_WACHTWOORD)) {
  stop(
    "Geen toetsenbord beschikbaar. Draai dit in een terminal, of geef HQ_EMAIL\n" +
      "en HQ_WACHTWOORD mee als omgevingsvariabelen.",
  );
}

// ── De database ──────────────────────────────────────────────────────────────

let url = resolveDirectUrl();

if (!url) {
  console.log(
    "\nNog geen database ingesteld.\n" +
      "In Supabase: Settings → Database → Connection string. Neem de directe\n" +
      "verbinding (poort 5432), niet die via de pooler (6543) — migraties en\n" +
      "beheerwerk lopen op de pooler vast.\n",
  );
  url = await vraagGeheim("Connectiestring: ");
  if (!url) stop("WEIGER: geen connectiestring opgegeven.");

  // Bewaren, zodat je hem maar één keer hoeft op te zoeken. .env staat in
  // .gitignore en gaat dus niet mee naar GitHub.
  const heeftAl = existsSync(".env") && /^\s*DATABASE_URL=/m.test(readFileSync(".env", "utf8"));
  if (!heeftAl) {
    const bestond = existsSync(".env");
    appendFileSync(".env", `${bestond ? "\n" : ""}DATABASE_URL="${url}"\n`);
    console.log("✓ opgeslagen in .env");
  }
}

// ── Wie er in mag ────────────────────────────────────────────────────────────

const email = (process.env.HQ_EMAIL ?? (await vraag("\nE-mailadres: "))).trim().toLowerCase();
if (!email.includes("@")) stop("WEIGER: dat is geen e-mailadres.");

let wachtwoord = process.env.HQ_WACHTWOORD ?? "";
if (!wachtwoord) {
  wachtwoord = await vraagGeheim("Wachtwoord: ");
  const nogmaals = await vraagGeheim("Nog een keer: ");
  if (wachtwoord !== nogmaals) stop("WEIGER: de twee wachtwoorden zijn niet gelijk.");
}

// Twaalf tekens is geen wet, maar dit account geeft toegang tot alles: klanten,
// facturen, contracten en de sleutels van het team.
if (wachtwoord.length < 12) stop("WEIGER: kies een wachtwoord van minstens 12 tekens.");

// ── Vastleggen ───────────────────────────────────────────────────────────────

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
    ? `\n✓ wachtwoord opnieuw gezet voor ${user.email} (${user.role})`
    : `\n✓ nieuw account ${user.email} aangemaakt als ${user.role}`,
);
console.log("  Inloggen kan op https://beerthuizen-hq.vercel.app\n");

await db.$disconnect();
rl.close();
