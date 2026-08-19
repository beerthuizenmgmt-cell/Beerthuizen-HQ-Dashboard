// Probeert het systeem expres te laten struikelen.
//
//   npx tsx scripts/audit-randgevallen.mts
//
// Maakt testdata aan, kijkt hoe het systeem reageert, en ruimt alles weer op.
// Voert geen externe acties uit.

import "dotenv/config";
import { readFile } from "node:fs/promises";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { poolConfig, resolveDatabaseUrl } from "../src/lib/db-url";
import { zoekBestaandeKlant, beoordeelBriefing, haalAanvraag, maakToken } from "../src/lib/portaal";
import { assertUsableApiKey, keyProbleem } from "../src/lib/ai/provider";
import { markeerGoedkeuringUitgevoerd } from "../src/lib/goedkeuring-afronden";
import { TELEGRAM_MAX, isOpmaakfout, knipOp, zonderOpmaak } from "../src/lib/telegram-tekst";
import { verstuurGoedgekeurdeMail } from "../src/lib/mail";
import { webhookGeheimKlopt } from "../src/lib/telegram";

const db = new PrismaClient({ adapter: new PrismaPg(poolConfig(resolveDatabaseUrl()!)) });

const MERK = "AUDIT-TEST";
let goed = 0;
let fout = 0;

function toets(naam: string, gelukt: boolean, toelichting = "") {
  console.log(`  ${gelukt ? "🟢" : "🔴"} ${naam}${toelichting ? ` — ${toelichting}` : ""}`);
  if (gelukt) goed += 1;
  else fout += 1;
}

async function main() {
  console.log("\nRANDGEVALLEN\n" + "─".repeat(64));

  // ── API-sleutels ─────────────────────────────────────────────────────────
  console.log("\nSleutelcontrole");
  toets("spatie wordt geweigerd", keyProbleem("sk-or v1-abc") !== null);
  toets("liggend streepje wordt geweigerd", keyProbleem("sk-or—v1-abc") !== null);
  toets("te lange waarde wordt geweigerd", (keyProbleem("x".repeat(2000)) ?? "").includes("2000 tekens"));
  toets("geldige sleutel wordt geaccepteerd", keyProbleem("sk-or-v1-" + "a".repeat(64)) === null);
  try {
    assertUsableApiKey("goed-genoeg");
    toets("assert laat een geldige sleutel door", true);
  } catch {
    toets("assert laat een geldige sleutel door", false);
  }

  // ── Klantherkenning ──────────────────────────────────────────────────────
  console.log("\nKlantherkenning");
  const klantA = await db.client.create({
    data: { name: `${MERK} Alpha BV`, kvk: "99887766", vatId: "NL999888777B01", email: "a@audit.test" },
  });

  const opKvk = await zoekBestaandeKlant({ bedrijfsnaam: "Heel iets anders", kvk: "99887766" });
  toets("gelijk KvK-nummer geeft zekere match", opKvk.zekerheid === "zeker" && opKvk.clientId === klantA.id);

  const opBtw = await zoekBestaandeKlant({ bedrijfsnaam: "Anders", btw: "NL999888777B01" });
  toets("gelijk btw-nummer geeft zekere match", opBtw.zekerheid === "zeker");

  const opNaam = await zoekBestaandeKlant({ bedrijfsnaam: `${MERK} Alpha` });
  toets("gelijke naam geeft alleen een vermoeden", opNaam.zekerheid === "mogelijk", opNaam.reden);

  const onbekend = await zoekBestaandeKlant({ bedrijfsnaam: "Volstrekt Onbekend NV" });
  toets("onbekende klant geeft geen match", onbekend.zekerheid === "geen");

  const leeg = await zoekBestaandeKlant({});
  toets("lege invoer geeft geen match", leeg.zekerheid === "geen");

  const kortKvk = await zoekBestaandeKlant({ kvk: "123" });
  toets("te kort KvK-nummer koppelt niet", kortKvk.zekerheid === "geen");

  // ── Briefingbeoordeling ──────────────────────────────────────────────────
  console.log("\nBriefingbeoordeling");
  const leegGaten = beoordeelBriefing({});
  toets("lege briefing levert gaten op", leegGaten.length >= 6, `${leegGaten.length} punten`);

  const volledig = beoordeelBriefing({
    budgetStatus: "Ja, een vast budget",
    budget: "25.000",
    periodeTot: "2026-11-30",
    deadline: "2026-09-05",
    doelgroep: "Mensen van 25 tot 40 die drie tot vijf keer per week gericht trainen en bewust etiketten lezen.",
    deliverables: "Reels of shorts, Stories",
    creatorsInGedachten: "Ja, ik heb namen",
    hergebruik: "Ja, ook voor advertenties",
    bestanden: "https://drive.google.com/x",
  });
  toets("volledige briefing levert geen gaten op", volledig.length === 0, `${volledig.length} punten`);

  const korteDoelgroep = beoordeelBriefing({ doelgroep: "Iedereen" });
  toets("te korte doelgroep wordt herkend", korteDoelgroep.some((g) => g.veld === "doelgroep"));

  const weetNiet = beoordeelBriefing({ deliverables: "Weet ik nog niet" });
  toets('"weet ik nog niet" telt als ontbrekend', weetNiet.some((g) => g.veld === "deliverables"));

  toets("elk gat noemt van wie het moet komen", leegGaten.every((g) => g.vanWie.length > 0));

  // ── Portaaltokens ────────────────────────────────────────────────────────
  console.log("\nPortaaltokens");
  toets("token is lang genoeg om niet te raden", maakToken().length >= 40);
  toets("twee tokens zijn nooit gelijk", maakToken() !== maakToken());
  toets("onbekend token geeft niets terug", (await haalAanvraag("bestaat-echt-niet")) === null);

  const verlopen = await db.portalRequest.create({
    data: { token: maakToken(), type: "klantgegevens", label: `${MERK} verlopen`, expiresAt: new Date(Date.now() - 864e5) },
  });
  const uitkomstVerlopen = await haalAanvraag(verlopen.token);
  toets("verlopen link wordt als verlopen gemeld", uitkomstVerlopen !== null && "verlopen" in uitkomstVerlopen && uitkomstVerlopen.verlopen === true);

  const gebruikt = await db.portalRequest.create({
    data: {
      token: maakToken(),
      type: "klantgegevens",
      label: `${MERK} gebruikt`,
      status: "ingevuld",
      expiresAt: new Date(Date.now() + 864e5),
    },
  });
  const uitkomstGebruikt = await haalAanvraag(gebruikt.token);
  toets("gebruikte link geeft niets meer prijs", uitkomstGebruikt !== null && "alIngevuld" in uitkomstGebruikt);

  // ── Facturen ─────────────────────────────────────────────────────────────
  console.log("\nFacturen");
  const f1 = await db.invoice.create({
    data: {
      number: `${MERK}-001`,
      clientName: klantA.name,
      clientId: klantA.id,
      direction: "uitgaand",
      issuedOn: new Date("2026-07-01"),
      dueOn: new Date("2026-07-31"),
      amountEur: 1000,
      status: "verzonden",
      sentAt: new Date("2026-07-01"),
    },
  });
  toets("factuur aanmaken lukt", Boolean(f1.id));

  let dubbelGeweigerd = false;
  try {
    await db.invoice.create({
      data: {
        number: `${MERK}-001`,
        clientName: klantA.name,
        issuedOn: new Date("2026-07-01"),
        dueOn: new Date("2026-07-31"),
        amountEur: 500,
      },
    });
  } catch {
    dubbelGeweigerd = true;
  }
  toets("dubbel factuurnummer wordt geweigerd", dubbelGeweigerd);

  const { verrijk, debiteurenstand } = await import("../src/lib/facturen");
  const verrijkt = verrijk(f1);
  toets("dagen openstaand wordt berekend", verrijkt.dagenOpenstaand > 0, `${verrijkt.dagenOpenstaand} dagen`);
  toets("te laat wordt herkend", verrijkt.teLaat);
  toets("volgende stap is bekend", verrijkt.volgendeStap.length > 0, verrijkt.volgendeStap);

  const stand = await debiteurenstand();
  toets("debiteurenstand telt de factuur mee", stand.teOntvangenEur >= 1000);

  // ── Betalingskoppeling ───────────────────────────────────────────────────
  console.log("\nBetalingskoppeling");
  const { zoekFactuur } = await import("../src/lib/betalingen");

  const exact = await zoekFactuur({ amountEur: 1000, reference: `Betaling ${MERK}-001` });
  toets("nummer plus bedrag geeft zekere match", exact.zekerheid === "zeker", exact.reden);

  const verkeerdBedrag = await zoekFactuur({ amountEur: 750, reference: `Betaling ${MERK}-001` });
  toets("juist nummer maar afwijkend bedrag koppelt niet", verkeerdBedrag.zekerheid === "onzeker", verkeerdBedrag.reden);

  const alleenBedrag = await zoekFactuur({ amountEur: 1000, reference: "Overboeking" });
  toets("alleen een bedrag koppelt niet automatisch", alleenBedrag.zekerheid !== "zeker", alleenBedrag.reden);

  const nergens = await zoekFactuur({ amountEur: 12345.67, reference: "Iets anders" });
  toets("onbekend bedrag geeft geen match", nergens.zekerheid === "geen");

  // ── Uitbesteden overschrijft geen afronding ──────────────────────────────
  //
  // Ingebouwde agents werken synchroon binnen sendToAgent. Tegen de tijd dat
  // dispatchTask zijn eigen statusregel wegschrijft, kan de agent de taak al
  // hebben afgerond. Deed dispatchTask dat met de momentopname van vóór het
  // versturen, dan verdween elke afronding weer onder "bezig".
  console.log("\nUitbesteden");

  const proefAgent = await db.agent.findFirst({ select: { id: true } });
  const maakProeftaak = async (status: "assigned") =>
    db.task.create({ data: { title: `${MERK} uitbesteden`, status, agentId: proefAgent?.id ?? null } });

  // De agent rondt af terwijl het uitbesteden nog loopt.
  const afgerond = await maakProeftaak("assigned");
  await db.task.update({ where: { id: afgerond.id }, data: { status: "done" } });
  await db.task.updateMany({ where: { id: afgerond.id, status: "assigned" }, data: { status: "in_progress" } });
  const naAfronden = await db.task.findUnique({ where: { id: afgerond.id }, select: { status: true } });
  toets("afgeronde taak blijft klaar staan", naAfronden?.status === "done", `stond op ${naAfronden?.status}`);

  // De agent loopt vast terwijl het uitbesteden nog loopt.
  const vast = await maakProeftaak("assigned");
  await db.task.update({ where: { id: vast.id }, data: { status: "blocked" } });
  await db.task.updateMany({ where: { id: vast.id, status: "assigned" }, data: { status: "in_progress" } });
  const naVastlopen = await db.task.findUnique({ where: { id: vast.id }, select: { status: true } });
  toets("vastgelopen taak blijft vastgelopen", naVastlopen?.status === "blocked", `stond op ${naVastlopen?.status}`);

  // En een taak waar de agent nog niets mee deed, gaat wél gewoon door.
  const onaangeraakt = await maakProeftaak("assigned");
  await db.task.updateMany({ where: { id: onaangeraakt.id, status: "assigned" }, data: { status: "in_progress" } });
  const naStilte = await db.task.findUnique({ where: { id: onaangeraakt.id }, select: { status: true } });
  toets("onaangeraakte taak gaat naar bezig", naStilte?.status === "in_progress", `stond op ${naStilte?.status}`);

  // De valkuil zelf: schrijft dispatchTask nog een status uit een oude snapshot?
  const bron = await readFile(new URL("../src/lib/actions/tasks.ts", import.meta.url), "utf8");
  toets(
    "dispatchTask schrijft geen status uit een oude momentopname",
    !/status:\s*task\.status\s*===/.test(bron),
  );

  // ── Een blokkade levert één taak op, niet twee ───────────────────────────
  //
  // De knop "maak hier een taak van" gaf geen terugkoppeling en bleef staan.
  // Twee keer klikken leverde dus twee identieke taken op het bord op.
  console.log("\nBlokkade naar taak");

  // Meeting.date is uniek, dus we prikken een dag ver buiten het echte bereik.
  const TESTDAG = new Date("2000-01-01T00:00:00Z");
  await db.standupEntry.deleteMany({ where: { meeting: { date: TESTDAG } } });
  await db.meeting.deleteMany({ where: { date: TESTDAG } });
  const overleg = await db.meeting.create({ data: { date: TESTDAG, status: "ready" } });
  const melder = await db.agent.findFirst({ select: { id: true } });
  const melding = await db.standupEntry.create({
    data: {
      meetingId: overleg.id,
      agentId: melder!.id,
      blockers: `${MERK} wacht op een budget`,
      receivedAt: new Date(),
    },
  });

  const alsGeklikt = async () => {
    const nu = await db.standupEntry.findUnique({ where: { id: melding.id } });
    if (nu?.taskId) return;
    const taak = await db.task.create({
      data: { title: `${MERK} Blokkade oplossen: ${nu!.blockers}`, status: "assigned", priority: "high", source: "standup" },
    });
    await db.standupEntry.update({ where: { id: melding.id }, data: { taskId: taak.id } });
  };

  await alsGeklikt();
  await alsGeklikt();
  await alsGeklikt();

  const gemaakt = await db.task.count({ where: { title: { startsWith: `${MERK} Blokkade` } } });
  toets("drie keer klikken geeft één taak", gemaakt === 1, `${gemaakt} taken`);

  const gekoppeld = await db.standupEntry.findUnique({ where: { id: melding.id }, select: { taskId: true } });
  toets("de melding weet welke taak eruit kwam", gekoppeld?.taskId != null);

  const actiebron = await readFile(new URL("../src/lib/actions/standup.ts", import.meta.url), "utf8");
  toets("taskFromBlocker slaat de taak terug op de melding", /standupEntry\.update/.test(actiebron));
  toets("taskFromBlocker stopt als er al een taak is", /if\s*\(entry\.taskId\)\s*return/.test(actiebron));

  await db.standupEntry.deleteMany({ where: { meetingId: overleg.id } });
  await db.meeting.delete({ where: { id: overleg.id } });

  // ── Goedgekeurd is niet hetzelfde als uitgevoerd ─────────────────────────
  //
  // Akkoord geven zet de actie klaar als taak; de mail gaat niet vanzelf weg.
  // executedAt werd nergens geschreven, dus op de goedkeuringenpagina was niet
  // te zien of een akkoord ook echt was uitgevoerd. Op precies die pagina wil je
  // dat verschil kunnen zien.
  console.log("\nGoedkeuring afronden");

  const vrager = await db.agent.findFirst({ select: { id: true } });
  const maakGoedkeuring = async (status: "approved" | "rejected") => {
    const taak = await db.task.create({ data: { title: `${MERK} na akkoord`, status: "assigned" } });
    const goedkeuring = await db.approval.create({
      data: {
        agentId: vrager!.id,
        kind: "email_send",
        title: `${MERK} verzoek`,
        summary: "Testverzoek.",
        payload: { ontvanger: "niemand@testadres.invalid" },
        status,
        linkedTaskId: taak.id,
      },
    });
    return { taak, goedkeuring };
  };

  const akkoord = await maakGoedkeuring("approved");
  await markeerGoedkeuringUitgevoerd(akkoord.taak.id);
  const naUitvoeren = await db.approval.findUnique({ where: { id: akkoord.goedkeuring.id } });
  toets("afgeronde taak markeert het akkoord als uitgevoerd", naUitvoeren?.executedAt != null);

  // Nog een keer afronden mag de eerste tijdstempel niet overschrijven.
  const eerste = naUitvoeren?.executedAt;
  await markeerGoedkeuringUitgevoerd(akkoord.taak.id);
  const nogmaals = await db.approval.findUnique({ where: { id: akkoord.goedkeuring.id } });
  toets("het tijdstip blijft op de eerste keer staan", nogmaals?.executedAt?.getTime() === eerste?.getTime());

  // Een afgewezen verzoek hoort nooit als uitgevoerd te eindigen.
  const afgewezen = await maakGoedkeuring("rejected");
  await markeerGoedkeuringUitgevoerd(afgewezen.taak.id);
  const naAfwijzen = await db.approval.findUnique({ where: { id: afgewezen.goedkeuring.id } });
  toets("een afgewezen verzoek wordt nooit uitgevoerd", naAfwijzen?.executedAt == null);

  await db.approval.deleteMany({ where: { title: { startsWith: MERK } } });

  // ── Telegram: waarom berichten soms niet binnenkwamen ────────────────────
  //
  // De tekst komt van een agent en gaat over echte klanten. Zit er een teken in
  // dat de Markdown-lezer van Telegram als opmaak leest, dan weigert hij het
  // hele bericht — niet een stukje, alles. Berichten zonder zulke tekens kwamen
  // gewoon aan; vandaar "soms".
  console.log("\nTelegram");

  toets(
    "een opmaakklacht wordt herkend",
    isOpmaakfout(new Error("Bad Request: can't parse entities: Can't find end of the entity")),
  );
  toets("een gewone storing wordt niet als opmaakfout gezien", !isOpmaakfout(new Error("Bad Gateway")));
  toets(
    "een geblokkeerde bot is geen opmaakfout",
    !isOpmaakfout(new Error("Forbidden: bot was blocked by the user")),
  );

  const lastig = "Bijlage: rapport_q4_definitief.pdf — 30% * 2 op [offerte #88]";
  toets("opmaaktekens gaan eruit bij de tweede poging", !/[*_`]/.test(zonderOpmaak(lastig)));
  toets("de inhoud blijft staan", zonderOpmaak(lastig).includes("rapport") && zonderOpmaak(lastig).includes("offerte"));

  // Te lange berichten weigert Telegram in hun geheel. Een teamsamenvatting of
  // een contractanalyse haalt die grens makkelijk.
  const kort = "Kort bericht.";
  toets("een kort bericht blijft één bericht", knipOp(kort).length === 1);

  const lang = Array.from({ length: 400 }, (_, i) => `Regel ${i} met wat tekst erachter.`).join("\n");
  const stukken = knipOp(lang);
  toets("een lang bericht wordt opgeknipt", stukken.length > 1, `${stukken.length} stukken`);
  toets("elk stuk past binnen de limiet", stukken.every((d) => d.length <= TELEGRAM_MAX));
  toets(
    "er gaat niets verloren bij het knippen",
    stukken.join("\n").replace(/\s+/g, " ") === lang.replace(/\s+/g, " "),
  );

  // Tekst zonder enige regelovergang kan niet netjes geknipt worden; dan moet
  // hij alsnog hard doormidden in plaats van de limiet te overschrijden.
  const eenLangeRegel = "x".repeat(TELEGRAM_MAX * 2 + 50);
  toets("ook tekst zonder regeleindes blijft binnen de limiet",
    knipOp(eenLangeRegel).every((d) => d.length <= TELEGRAM_MAX));

  // ── Mail gaat alleen weg met jouw akkoord ────────────────────────────────
  //
  // De grendels zitten in verstuurGoedgekeurdeMail, niet in de knop erboven.
  // Anders kan een tweede tabblad, een script of een agent er alsnog een mail
  // doorheen duwen die je niet gezien hebt.
  console.log("\nMail versturen");

  const afzenderAgent = await db.agent.findFirst({ select: { id: true } });
  const maakMailverzoek = async (
    status: "pending" | "approved" | "rejected",
    payload: Record<string, string>,
    kind = "email_send",
    executedAt: Date | null = null,
  ) =>
    db.approval.create({
      data: {
        agentId: afzenderAgent!.id,
        kind,
        title: `${MERK} mailverzoek`,
        summary: "Testverzoek.",
        payload,
        status,
        executedAt,
      },
    });

  const goedePayload = { ontvanger: "iemand@testadres.invalid", onderwerp: "Test", tekst: "Hallo." };

  const nogNietBeslist = await maakMailverzoek("pending", goedePayload);
  const a = await verstuurGoedgekeurdeMail(nogNietBeslist.id);
  toets("een verzoek zonder akkoord wordt geweigerd", !a.ok, a.message);

  const afgewezenVerzoek = await maakMailverzoek("rejected", goedePayload);
  const b = await verstuurGoedgekeurdeMail(afgewezenVerzoek.id);
  toets("een afgewezen verzoek wordt geweigerd", !b.ok, b.message);

  const alVerstuurd = await maakMailverzoek("approved", goedePayload, "email_send", new Date());
  const c = await verstuurGoedgekeurdeMail(alVerstuurd.id);
  toets("een al verstuurde mail gaat niet nog een keer", !c.ok, c.message);

  const geenMail = await maakMailverzoek("approved", goedePayload, "external_message");
  const d = await verstuurGoedgekeurdeMail(geenMail.id);
  toets("een verzoek van een ander soort wordt geweigerd", !d.ok, d.message);

  const kromAdres = await maakMailverzoek("approved", { ...goedePayload, ontvanger: "geen adres" });
  const e = await verstuurGoedgekeurdeMail(kromAdres.id);
  toets("een onbruikbaar adres wordt geweigerd", !e.ok, e.message);

  const zonderTekst = await maakMailverzoek("approved", { ...goedePayload, tekst: "" });
  const f = await verstuurGoedgekeurdeMail(zonderTekst.id);
  toets("een leeg bericht wordt geweigerd", !f.ok, f.message);

  const bestaatNiet = await verstuurGoedgekeurdeMail("bestaat-echt-niet");
  toets("een onbekend verzoek wordt geweigerd", !bestaatNiet.ok, bestaatNiet.message);

  // Geen van deze pogingen mag een verzoek als uitgevoerd hebben achtergelaten.
  const perOngelukUitgevoerd = await db.approval.count({
    where: { title: { startsWith: MERK }, executedAt: { not: null }, id: { not: alVerstuurd.id } },
  });
  toets("geen enkele geweigerde poging is als verstuurd geboekt", perOngelukUitgevoerd === 0);

  await db.approval.deleteMany({ where: { title: { startsWith: MERK } } });

  // ── De inkomende Telegram-lijn ───────────────────────────────────────────
  //
  // Dit adres is vanaf internet bereikbaar. Alles hangt aan het geheim dat
  // Telegram meestuurt: klopt dat niet, dan mag er geen agent aan het werk
  // gezet worden door een vreemde.
  console.log("\nInkomende lijn");

  const setting = await db.setting.findUnique({ where: { key: "telegram" } });
  const bewaard = (setting?.value ?? {}) as Record<string, string>;
  const echtGeheim = bewaard.webhookSecret ?? null;

  toets("een lege header wordt geweigerd", !(await webhookGeheimKlopt(null)));
  toets("een verkeerd geheim wordt geweigerd", !(await webhookGeheimKlopt("niet-het-geheim")));
  toets(
    "een geheim van de juiste lengte maar verkeerde inhoud wordt geweigerd",
    !(await webhookGeheimKlopt("x".repeat(echtGeheim?.length ?? 48))),
  );

  if (echtGeheim) {
    toets("het echte geheim wordt geaccepteerd", await webhookGeheimKlopt(echtGeheim));
  } else {
    // Lokaal staat de lijn bewust uit; dan hoort niets erdoor te komen.
    toets("zonder ingestelde lijn komt er niets binnen", !(await webhookGeheimKlopt("wat-dan-ook")));
  }

  const route = await readFile(
    new URL("../src/app/api/telegram/inkomend/route.ts", import.meta.url),
    "utf8",
  );
  toets("de route controleert het geheim vóór alles", /webhookGeheimKlopt/.test(route));
  toets("een verkeerd geheim krijgt geen bevestiging", /status:\s*404/.test(route));
  toets("alleen de eigen chat wordt verwerkt", /config\.chatId/.test(route));
  toets("berichten van bots worden genegeerd", /is_bot/.test(route));
  toets("Telegram krijgt direct antwoord, het denkwerk komt erna", /after\(/.test(route));

  // ── Een gesprek in plaats van losse opdrachten ───────────────────────────
  console.log("\nTeamchat");

  const kanaalBron = await readFile(new URL("../src/lib/orchestrator.ts", import.meta.url), "utf8");
  toets("het antwoord van een agent komt terug in het kanaal", /fromType:\s*"agent"/.test(kanaalBron));
  toets("de agent krijgt de eerdere berichten mee", /message\.findMany/.test(kanaalBron));
  toets(
    "een agent die zelf al postte krijgt er geen tweede versie onder",
    /alGepost/.test(kanaalBron),
  );
  toets(
    "vastleggen en bezorgen zijn gescheiden, zodat je bericht meteen in beeld staat",
    /export async function plaatsBericht/.test(kanaalBron) &&
      /export async function bezorgBericht/.test(kanaalBron),
  );

  const actieBron = await readFile(new URL("../src/lib/actions/messages.ts", import.meta.url), "utf8");
  toets("het denkwerk gebeurt na de bevestiging", /after\(/.test(actieBron));
  toets("een mislukt antwoord laat een spoor na", /bericht_niet_bezorgd/.test(actieBron));

  // ── Opruimen ─────────────────────────────────────────────────────────────
  await db.taskUpdate.deleteMany({ where: { task: { title: { startsWith: MERK } } } });
  await db.task.deleteMany({ where: { title: { startsWith: MERK } } });
  await db.invoice.deleteMany({ where: { number: { startsWith: MERK } } });
  await db.portalRequest.deleteMany({ where: { label: { startsWith: MERK } } });
  await db.client.deleteMany({ where: { name: { startsWith: MERK } } });

  console.log(`\n${"─".repeat(64)}\n${goed} geslaagd, ${fout} mislukt. Testdata opgeruimd.`);
  await db.$disconnect();
  if (fout > 0) process.exit(1);
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
