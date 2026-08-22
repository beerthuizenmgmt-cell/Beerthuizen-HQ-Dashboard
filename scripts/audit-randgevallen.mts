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
import { KANALEN, kanaal, kanaalkeuzeAlsPrompt } from "../src/lib/kanalen";
import { haalOverzicht } from "../src/lib/overzicht";
import { TOOL_CATALOG } from "../src/lib/ai/toolkit";

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

  toets(
    "een bericht zonder tag in de groep komt bij iemand terecht",
    /kiesAgentVoor/.test(kanaalBron),
  );
  toets(
    "agents onderling worden niet automatisch gerouteerd",
    /input\.fromType === "user"/.test(kanaalBron),
  );

  // ── De drie kanalen zijn echt drie kanalen ───────────────────────────────
  console.log("\nKanalen");

  toets("er zijn drie teamkanalen met een eigen doel", KANALEN.length === 3);
  toets(
    "elk kanaal zegt wanneer je het gebruikt",
    KANALEN.every((k) => k.wanneer.length > 40),
  );
  toets(
    "elk kanaal zegt ook wat er níét hoort",
    KANALEN.every((k) => k.nietHier.length > 20),
  );
  toets("een onbekend kanaal geeft niets terug", kanaal("bestaat-niet") === undefined);
  toets("het gereedschap legt de keuze uit", kanaalkeuzeAlsPrompt().includes("resultaten"));

  const gereedschapBron = await readFile(new URL("../src/lib/ai/tools.ts", import.meta.url), "utf8");
  toets(
    "de kanaalkeuze staat in de omschrijving van het gereedschap",
    /kanaalkeuzeAlsPrompt\(\)/.test(gereedschapBron),
  );
  toets(
    "de agent die antwoordt weet in welk kanaal hij zit",
    /kanaalUitleg/.test(kanaalBron),
  );

  const routeBron = await readFile(new URL("../src/lib/ai/routeren.ts", import.meta.url), "utf8");
  toets("bij twijfel gaat het naar de Head of Operations", /chief/.test(routeBron));
  toets("een mislukte keuze laat nooit niemand achter", /catch/.test(routeBron));
  toets("het kiezen gebruikt geen gereedschap en blijft dus snel", !/tools:/.test(routeBron));

  // ── Uitbesteden is geen zwart gat meer ───────────────────────────────────
  console.log("\nUitbesteden bevestigen");

  const takenBron = await readFile(new URL("../src/lib/actions/tasks.ts", import.meta.url), "utf8");
  toets("de agent bevestigt meteen dat hij begint", /heeft dit opgepakt/.test(takenBron));
  toets("het werk gebeurt na de bevestiging", /after\(/.test(takenBron));
  toets("aankondigen en uitvoeren zijn gescheiden", /kondigAan/.test(takenBron) && /voerUit/.test(takenBron));
  toets("een klapper tijdens het werk laat een spoor na", /kind: "error"/.test(takenBron));

  const briefBron = await readFile(new URL("../src/lib/orchestrator.ts", import.meta.url), "utf8");
  toets("langer werk hoort tussendoor gemeld te worden", /meld dan tussendoor/.test(briefBron));

  // ── HQ toont alleen wat er echt is ───────────────────────────────────────
  console.log("\nOverzicht op HQ");

  const cijfers = await haalOverzicht();
  toets(
    "taken per kolom tellen op tot het echte aantal",
    cijfers.taken.perStatus.reduce((n, r) => n + r.waarde, 0) === (await db.task.count()),
  );
  toets("het verloop beslaat zeven dagen", cijfers.taken.afgerondPerDag.length === 7);
  toets(
    "er wordt niets geteld dat er niet is",
    cijfers.taken.perAgent.every((r) => r.waarde > 0) &&
      cijfers.agents.kostenPerAgent.every((r) => r.waarde > 0),
  );
  toets(
    "advertenties gelden pas als gekoppeld zodra er een campagne staat",
    cijfers.advertenties.gekoppeld === (await db.adCampaign.count()) > 0,
  );

  const grafiekBron = await readFile(new URL("../src/components/grafiek.tsx", import.meta.url), "utf8");
  toets("een lege grafiek zegt dat er niets is", /leeg/.test(grafiekBron));
  toets(
    "ontbrekende koppelingen krijgen uitleg in plaats van een lege grafiek",
    /NogNietGekoppeld/.test(grafiekBron),
  );

  // Zes grafieken in dezelfde kleur lezen als één blok: je ziet wel dat er iets
  // staat, maar niet wat.
  const statusKleuren = new Set(cijfers.taken.perStatus.map((r) => r.kleur));
  toets(
    "elke taakstatus heeft een eigen kleur",
    statusKleuren.size === cijfers.taken.perStatus.length,
    `${statusKleuren.size} kleuren voor ${cijfers.taken.perStatus.length} statussen`,
  );
  toets(
    "vastgelopen is rood en klaar is groen",
    cijfers.taken.perStatus.every(
      (r) =>
        (r.label !== "Vastgelopen" || r.kleur.includes("danger")) &&
        (r.label !== "Klaar" || r.kleur.includes("ok")),
    ),
  );

  toets(
    "elke agent in de kostenring heeft een eigen kleur",
    new Set(cijfers.agents.kostenPerAgent.map((r) => r.kleur)).size ===
      cijfers.agents.kostenPerAgent.length,
  );

  const grafiekVorm = await readFile(new URL("../src/components/grafiek.tsx", import.meta.url), "utf8");
  toets("er is een ring voor verdelingen", /export function Ring/.test(grafiekVorm));
  toets("de ring toont ook het totaal", /midden \?\? totaal/.test(grafiekVorm));
  toets(
    "een ring met één segment krijgt geen kier",
    /data\.length > 1 \? 1\.5 : 0/.test(grafiekVorm),
  );

  const breinCanvas = await readFile(new URL("../src/components/brein-canvas.tsx", import.meta.url), "utf8");
  toets("elke agent krijgt zijn eigen wolk", /PLEKKEN/.test(breinCanvas));
  toets(
    "de kleur komt uit de database en niet uit een lijstje van ons",
    /lid\.color \?\? "#6366f1"/.test(breinCanvas),
  );
  toets("alleen wie echt werkt vuurt", /if \(werkt && !stil\)/.test(breinCanvas));
  toets("wie op pauze staat blijft zichtbaar", /slaapt \? 0\.\d+ :/.test(breinCanvas));
  toets(
    "het aantal deeltjes schaalt mee met het scherm",
    /oppervlak \/ \d+/.test(breinCanvas) && /Math\.min\(\d+, Math\.max\(/.test(breinCanvas),
  );
  toets(
    "er wordt niet doorgetekend als niemand kijkt",
    /visibilitychange/.test(breinCanvas) && /cancelAnimationFrame/.test(breinCanvas),
  );
  toets(
    "wie beweging uit heeft krijgt een stilstaand brein, geen leeg vlak",
    /prefers-reduced-motion/.test(breinCanvas) && /if \(!stil\) bezigId/.test(breinCanvas),
  );
  toets(
    "het eerste beeld staat er ook in een tabblad op de achtergrond",
    /teken\(\);\n\n    if \(!stil\) bezigId/.test(breinCanvas),
  );

  // De diepte is wat het ruimtelijk maakt in plaats van een platte sticker.
  toets("de massa draait om zijn as", /const draaiing = tijd \* /.test(breinCanvas));
  toets("er zit perspectief op", /const diepte = 1 \/ \(1\.9 \+ pz\)/.test(breinCanvas));
  toets("de massa ademt: zet uit en krimpt weer", /const adem =\s*\n?\s*1 \+ Math\.sin/.test(breinCanvas));
  toets(
    "de ademhaling heeft twee ritmes, geen zuivere sinus",
    (breinCanvas.match(/Math\.sin\(tijd \* 0\.\d+[^)]*\) \* 0\.0\d+/g) ?? []).length >= 2,
  );
  toets(
    "de schaal laat ruimte voor het uitzetten",
    /hoogte\) \* 0\.56/.test(breinCanvas),
  );

  // Antwoorden in een gesprek horen kort te zijn. "Kort" bleek te vaag: ze
  // liepen op tot vijftienhonderd tekens.
  toets("de teamchat vraagt om hoogstens een paar zinnen", /drie of vier zinnen/.test(kanaalBron));
  toets("geen opsommingen of kopjes in een chatbericht", /Geen opsommingen, geen kopjes/.test(kanaalBron));
  toets(
    "meer te vertellen wordt aangeboden, niet uitgestort",
    /vraag of hij het wil/.test(kanaalBron),
  );

  const telegramBron = await readFile(new URL("../src/lib/telegram.ts", import.meta.url), "utf8");
  toets("op de telefoon nog korter", /Hoogstens drie zinnen/.test(telegramBron));

  // ── De vormtaal van het dashboard ────────────────────────────────────────
  //
  // Geen getekende lijnen om dingen heen, maar licht dat van boven valt: kaarten
  // liggen op het vlak, invoervelden en codeblokken erin.
  console.log("\nVormtaal");

  const css = await readFile(new URL("../src/app/globals.css", import.meta.url), "utf8");
  const kaartRegel = css.slice(css.indexOf("  .card {"), css.indexOf("  .card {") + 400);

  toets("een kaart heeft geen getekende rand", !/border:\s*1px/.test(kaartRegel));
  toets("een kaart vangt licht van boven", /inset 0 1px 0 var\(--kaart-glans\)/.test(kaartRegel));
  toets("er is een verdiept vlak voor wat erin ligt", /\.verdiept \{/.test(css));
  toets("een invoerveld ligt verdiept", /\.input \{[^}]*var\(--verdiept-vlak\)/s.test(css));
  toets(
    "randen lopen naar de uiteinden weg",
    /\.rand-rechts::after/.test(css) && /transparent,\s*\n?\s*var\(--border\)/.test(css),
  );
  toets("lijsten worden gescheiden zonder streep van rand tot rand", /\.lijst > \* \+ \*::before/.test(css));
  toets("een echte tabel heeft zijn eigen scheiding", /\.lijst-tabel > tr \+ tr/.test(css));
  toets(
    "de crèmekleurige klantpagina heeft haar eigen licht",
    /--kaart-boven: #ffffff/.test(css) && /--verdiept-vlak: #efeae1/.test(css),
  );

  const alleTsx = await readFile(new URL("../src/app/(app)/layout.tsx", import.meta.url), "utf8");
  toets("de zijbalk heeft geen getrokken rand meer", !/border-r border-border/.test(alleTsx));

  const breinKader = await readFile(new URL("../src/components/brein-hq.tsx", import.meta.url), "utf8");
  toets(
    "er zit geen kader om het brein",
    !/border border-border/.test(breinKader) && !/bg-\[#05060a\]/.test(breinKader),
  );
  toets(
    "wat verder weg ligt wordt kleiner én doffer",
    /d\.grootte \* diepte/.test(breinCanvas) && /diepte \* 1\.3/.test(breinCanvas),
  );
  toets(
    "elk label is een deur naar het gesprek met die agent",
    /\/team\/dm-\$\{lid\.sleutel\}/.test(breinCanvas),
  );
  toets(
    "de labels wijken op een telefoon voor de lijst",
    /absolute hidden/.test(breinCanvas),
  );

  const breinBlok = await readFile(new URL("../src/components/brein-hq.tsx", import.meta.url), "utf8");
  toets("de namen staan ernaast in een leesbare lijst", /Agents/.test(breinBlok));
  toets("het bolletje in de lijst heeft de kleur van zijn wolk", /background: kleur/.test(breinBlok));

  const stijl = await readFile(new URL("../src/app/globals.css", import.meta.url), "utf8");
  toets("er ligt een sterrenveld achter het dashboard", /\.sterrenveld::before/.test(stijl));
  toets(
    "de sterren hangen aan het dashboard en niet aan de systeemvoorkeur",
    !/prefers-color-scheme: dark\)\s*\{\s*\.sterrenveld/.test(stijl),
  );
  toets("de inhoud staat bovenop de sterren", /\.sterrenveld > \*/.test(stijl));


  const stijlBron = await readFile(new URL("../src/app/globals.css", import.meta.url), "utf8");
  toets(
    "alle beweging zit achter prefers-reduced-motion",
    /@media \(prefers-reduced-motion: no-preference\)/.test(stijlBron),
  );
  toets(
    "zonder beweging staat de inhoud er gewoon",
    // .komt-op heeft buiten de media query geen eigen opacity; valt de animatie
    // weg, dan is het gevolg een stilstaande pagina en geen onzichtbare.
    !/\.komt-op\s*\{[^}]*opacity/.test(stijlBron.split("@media (prefers-reduced-motion")[0]),
  );

  // ── Wat de paginacontrole opleverde ──────────────────────────────────────
  console.log("\nSchermen");

  const factuurBron = await readFile(new URL("../src/components/factuur-tabel.tsx", import.meta.url), "utf8");
  toets(
    "het factuurformulier begint opnieuw bij een andere factuur",
    /<form key=\{open\?\.id \?\? "nieuw"\}/.test(factuurBron),
  );
  toets("een factuur wissen vraagt eerst na", /teWissen === factuur\.id/.test(factuurBron));

  const agentWisBron = await readFile(
    new URL("../src/components/agent-verwijderen.tsx", import.meta.url),
    "utf8",
  );
  toets("een agent verwijderen vraagt eerst na", /zekerWeten/.test(agentWisBron));
  toets("bij die vraag staat zijn naam", /\{naam\}/.test(agentWisBron));

  const creatorActies = await readFile(new URL("../src/lib/actions/creators.ts", import.meta.url), "utf8");
  toets("een creator kan bijgewerkt worden", /export async function werkCreatorBij/.test(creatorActies));
  toets("een creator kan weggehaald worden", /export async function verwijderCreator/.test(creatorActies));
  toets(
    "een naamscorrectie verjongt de cijfers niet",
    /nieuweCijfers\s*\?/.test(creatorActies),
  );
  toets(
    "twee creators mogen niet dezelfde naam krijgen",
    /id: \{ not: id \}/.test(creatorActies),
  );

  const monitorBron = await readFile(
    new URL("../src/components/monitoring-panel.tsx", import.meta.url),
    "utf8",
  );
  toets(
    "een proefdraai telt wat er zou activeren, niet wat er activeerde",
    /outcome\.zouActiveren/.test(monitorBron),
  );

  // ── Zelf uitzoeken in plaats van vragen ──────────────────────────────────
  console.log("\nZelfstandigheid");

  const zoek = TOOL_CATALOG.find((t) => t.key === "web_search");
  toets("de zoekmachine is gebouwd", Boolean(zoek?.implemented));
  toets("er staat er precies één in de catalogus", TOOL_CATALOG.filter((t) => t.key === "web_search").length === 1);
  toets("zonder sleutel wordt er niet gezocht", !(await zoek!.run!({}, { vraag: "test" })).ok);
  toets("zonder vraag wordt er niet gezocht", !(await zoek!.run!({ apiKey: "x" }, {})).ok);
  toets(
    "de agent wordt naar de bron gestuurd, niet naar de samenvatting",
    /lees_webpagina/.test(zoek!.definition!({}, "Zoekmachine").description),
  );

  const kaderBron = await readFile(new URL("../src/lib/ai/profiles.ts", import.meta.url), "utf8");
  toets("er staat een volgorde: eerst archief, dan dashboard, dan internet", /Eerst zelf uitzoeken/.test(kaderBron));
  toets(
    "vragen mag alleen over wat alleen Enriqueo weet",
    /alleen wat alleen hij kan weten/.test(kaderBron),
  );
  toets(
    "niet vinden is geen reden om te gokken",
    /Niets verzinnen blijft de belangrijkste regel/.test(kaderBron),
  );

  const hqBron = await readFile(new URL("../src/app/(app)/hq/page.tsx", import.meta.url), "utf8");
  toets("bij elke medewerker staat zijn functie", /\{lid\.rol\}/.test(hqBron));

  const cockpitBron = await readFile(new URL("../src/lib/cockpit.ts", import.meta.url), "utf8");
  toets("de briefing op HQ wordt ingekort", /eersteZinnen/.test(cockpitBron));

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
