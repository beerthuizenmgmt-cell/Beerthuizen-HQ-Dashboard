// De studio: kan dezelfde dag twee keer geboekt worden?
//
//   DOTENV_CONFIG_PATH=.env.production npx tsx scripts/audit-studio.mts
//
// Dat is de enige vraag die er echt toe doet. Een systeem dat soms "vrij"
// zegt terwijl er al iemand staat is erger dan geen systeem — dan sta je met
// twee klanten in dezelfde ruimte.

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { poolConfig, resolveDatabaseUrl } from "../src/lib/db-url";
import { isVrij, vraagAan, bevestig, verplaats, annuleer, bezetting, vrijeDagen } from "../src/lib/studio";

const db = new PrismaClient({ adapter: new PrismaPg(poolConfig(resolveDatabaseUrl()!)) });
const MERK = "AUDIT-";
let goed = 0, fout = 0;
const toets = (n: string, ok: boolean, g = "") => {
  console.log(`  ${ok ? "🟢" : "🔴"} ${n}${g ? ` — ${g}` : ""}`);
  ok ? goed++ : fout++;
};
const overDagen = (n: number) => { const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()+n); return d; };

async function main() {
  console.log("\nSTUDIO\n" + "═".repeat(70));

  const foto = await db.studioruimte.create({ data: { naam: `${MERK}Fotostudio`, soort: "fotostudio", dagtariefEur: 750 } });
  const podcast = await db.studioruimte.create({ data: { naam: `${MERK}Podcaststudio`, soort: "podcaststudio", dagtariefEur: 450 } });
  const klantA = await db.client.create({ data: { name: `${MERK}Klant A` } });
  const klantB = await db.client.create({ data: { name: `${MERK}Klant B` } });
  toets("twee ruimtes aangemaakt", Boolean(foto.id && podcast.id));

  const dag = overDagen(14);

  console.log("\nAanvragen blokkeren niets");
  const a1 = await vraagAan({ ruimteId: foto.id, dag, clientId: klantA.id, doel: "Productshoot" });
  toets("eerste aanvraag", a1.ok, a1.melding);
  const a2 = await vraagAan({ ruimteId: foto.id, dag, clientId: klantB.id, doel: "Campagneshoot" });
  toets("tweede aanvraag op dezelfde dag mag", a2.ok, a2.melding);
  toets("dag is nog steeds vrij", (await isVrij(foto.id, dag)).vrij);

  console.log("\nBevestigen claimt de dag");
  const b1 = await bevestig(a1.boekingId!);
  toets("eerste bevestiging lukt", b1.ok, b1.melding);
  const na = await isVrij(foto.id, dag);
  toets("dag is nu bezet", !na.vrij, na.reden);
  toets("met de naam erbij", na.bezetDoor?.klant === klantA.name, String(na.bezetDoor?.klant));

  const b2 = await bevestig(a2.boekingId!);
  toets("tweede bevestiging wordt geweigerd", !b2.ok, b2.melding);
  toets("en zegt door wie", b2.melding.includes("Klant A"));

  console.log("\nDe database houdt het ook tegen");
  let dbHieldTegen = false;
  try {
    await db.studioboeking.create({
      data: { ruimteId: foto.id, dag, dagdeel: "hele dag", status: "bevestigd", clientId: klantB.id },
    });
  } catch { dbHieldTegen = true; }
  toets("rechtstreeks in de database schrijven lukt niet", dbHieldTegen);

  console.log("\nAndere ruimte, zelfde dag");
  const p1 = await vraagAan({ ruimteId: podcast.id, dag, clientId: klantB.id, doel: "Opname" });
  const p2 = await bevestig(p1.boekingId!);
  toets("podcaststudio kan wél op dezelfde dag", p2.ok, p2.melding);

  console.log("\nVerplaatsen");
  const nieuweDag = overDagen(21);
  const v = await verplaats(a1.boekingId!, nieuweDag);
  toets("verplaatsen lukt", v.ok, v.melding);
  toets("oude dag is weer vrij", (await isVrij(foto.id, dag)).vrij);
  toets("nieuwe dag is bezet", !(await isVrij(foto.id, nieuweDag)).vrij);
  const verplaatst = await db.studioboeking.findUnique({ where: { id: a1.boekingId! } });
  toets("herkomst bewaard", verplaatst?.verplaatstVanaf !== null, String(verplaatst?.verplaatstVanaf?.toISOString().slice(0,10)));

  const b3 = await bevestig(a2.boekingId!);
  toets("de tweede klant kan nu wel bevestigen", b3.ok, b3.melding);

  const botsing = await verplaats(a1.boekingId!, dag);
  toets("verplaatsen naar een bezette dag wordt geweigerd", !botsing.ok, botsing.melding);

  console.log("\nAnnuleren");
  const zonderReden = await annuleer(a2.boekingId!, "   ");
  toets("annuleren zonder reden wordt geweigerd", !zonderReden.ok, zonderReden.melding);
  const geannuleerd = await annuleer(a2.boekingId!, "Klant heeft afgezegd wegens ziekte");
  toets("annuleren met reden lukt", geannuleerd.ok);
  toets("dag komt weer vrij", (await isVrij(foto.id, dag)).vrij);
  const opnieuw = await bevestig(a2.boekingId!);
  toets("geannuleerde boeking kan niet heropend worden", !opnieuw.ok, opnieuw.melding);

  console.log("\nFoute invoer");
  const verleden = await vraagAan({ ruimteId: foto.id, dag: overDagen(-3) });
  toets("dag in het verleden wordt geweigerd", !verleden.ok, verleden.melding);
  const nergens = await vraagAan({ ruimteId: "bestaat-niet", dag });
  toets("onbekende ruimte wordt geweigerd", !nergens.ok);
  toets("onbekende boeking bevestigen lukt niet", !(await bevestig("bestaat-niet")).ok);
  toets("onbekende boeking verplaatsen lukt niet", !(await verplaats("bestaat-niet", dag)).ok);

  const uit = await db.studioruimte.create({ data: { naam: `${MERK}Buiten gebruik`, actief: false } });
  toets("inactieve ruimte is niet vrij", !(await isVrij(uit.id, dag)).vrij);

  console.log("\nOverzicht");
  const vrij = await vrijeDagen(foto.id, new Date(), 30);
  toets("vrije dagen berekend", vrij.length === 29, `${vrij.length} van 30 vrij`);

  const stand = await bezetting(new Date(), 30);
  const fotoStand = stand.find((r) => r.naam.includes("Fotostudio"))!;
  toets("bezetting per ruimte", fotoStand.bezetteDagen === 1, `${fotoStand.bezetteDagen} dag(en)`);
  toets("bezettingsgraad over de periode", fotoStand.bezettingsgraad === 3, `${fotoStand.bezettingsgraad}%`);
  toets("geannuleerde boekingen tellen niet mee", !fotoStand.boekingen.some((b) => b.status === "geannuleerd"));

  await db.studioboeking.deleteMany({ where: { ruimte: { naam: { startsWith: MERK } } } });
  await db.studioruimte.deleteMany({ where: { naam: { startsWith: MERK } } });
  await db.client.deleteMany({ where: { name: { startsWith: MERK } } });

  console.log(`\n${"═".repeat(70)}\n${goed} geslaagd, ${fout} mislukt. Testdata opgeruimd.`);
  await db.$disconnect();
  if (fout > 0) process.exit(1);
}

main().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
