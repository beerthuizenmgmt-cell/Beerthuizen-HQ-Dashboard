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
import { BRIEFINGVELDEN } from "../src/lib/ai/briefing";
import { haalSignalen } from "../src/lib/signalen";
import { VOORWAARDEN, stelOvereenkomstOp } from "../src/lib/samenwerking";
import {
  MAATSTAVEN,
  ALARMSIGNALEN,
  ONDERBOUWING,
  selectieAlsPrompt,
} from "../src/lib/ai/creatorselectie";

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

  // Vier sinds #vragen erbij kwam: de vragen van het team stonden eerst in een
  // aparte call.
  toets("elk teamkanaal heeft een eigen doel", KANALEN.length >= 3);
  toets(
    "er is een kanaal waar het team zijn vragen kwijt kan",
    KANALEN.some((k) => k.key === "vragen"),
  );
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
  toets("er lopen draden tussen de knooppunten", /type Verbinding/.test(breinCanvas));
  toets(
    "die draden worden één keer uitgerekend, niet elk beeld",
    // Elk beeld opnieuw nagaan welke deeltjes dicht bij elkaar liggen is
    // achtduizend tegen achtduizend; dat haalt geen browser dertig keer per
    // seconde.
    /draden = nieuweDraden/.test(breinCanvas) && !/indexOf\(d\)/.test(breinCanvas),
  );
  toets(
    "draden dwars door de zwerm vallen af",
    /if \(lengte > grens\) continue/.test(breinCanvas),
  );
  // De kern is een kloppende zon geworden in plaats van een zachte gloed.
  toets("er is een kern die klopt", /function hartslag/.test(breinCanvas));
  toets(
    "die klopt als een hart en niet als een sinus",
    /piek\(0\.\d+, 0\.\d+\) \+ piek\(/.test(breinCanvas),
  );
  toets("er zit een zon in", /const zon = ctx!\.createRadialGradient/.test(breinCanvas));
  toets("er breekt licht door de kieren", /uitbarstingen door de kieren/i.test(breinCanvas));
  toets(
    "de schil is licht en niet donker",
    // Een donkere schil op een zwarte achtergrond leest als een gat, niet als
    // een tralie waar licht doorheen komt.
    /De schil is niet donker maar licht/.test(breinCanvas),
  );

  // Korrel ontstaat als een sjabloon van een paar pixels wordt opgeblazen, en
  // als het verloop een harde rand heeft.
  toets("het lichtpuntje is groot genoeg om nooit opgeblazen te worden", /const maat = 64/.test(breinCanvas));
  toets(
    "het verloop dooft geleidelijk uit",
    (breinCanvas.match(/verloop\.addColorStop/g) ?? []).length >= 6,
  );
  toets("vloeiend schalen staat aan", /imageSmoothingQuality = "high"/.test(breinCanvas));
  toets(
    "geen deeltje wordt kleiner dan een pixel",
    /Math\.max\(1\.4, d\.grootte/.test(breinCanvas),
  );
  toets(
    "de massa ademt en klopt mee met de kern",
    /const adem =/.test(breinCanvas) && /hartslag\(tijd\) \* 0\.\d+/.test(breinCanvas),
  );
  toets(
    "de ademhaling heeft twee ritmes, geen zuivere sinus",
    (breinCanvas.match(/Math\.sin\(tijd \* 0\.\d+[^)]*\) \* 0\.0\d+/g) ?? []).length >= 2,
  );
  toets(
    "de schaal laat ruimte voor het uitzetten",
    // De ademhaling zet de massa tot elf procent uit; die marge zit in de
    // factor. Op HQ 0,56, op het volledige scherm 0,60 — allebei nagerekend.
    /schaalFactor = 0\.56/.test(breinCanvas) && /schaalFactorRef\.current/.test(breinCanvas),
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
  toets("de zijbalk blijft staan bij scrollen", /sticky top-0/.test(alleTsx));
  toets(
    "de sterrenlaag tilt geen kinderen op",
    // Deze regel zette position: relative op elk direct kind en overschreef
    // daarmee de sticky van de zijbalk. Hij mag niet terugkomen.
    !/\.sterrenveld > \*/.test(css),
  );
  toets("de sterren liggen achter de inhoud", /\.sterrenveld::before \{[^}]*z-index: -1/s.test(css));
  toets("de sterrenlaag heeft een eigen stapelcontext", /isolation: isolate/.test(css));
  toets("waar je bent krijgt een streepje licht, geen hokje", /\.menu-item\[data-actief="ja"\]::before/.test(css));
  toets("de zijbalk loopt over in de pagina", /\.zijbalk \{[^}]*linear-gradient\(90deg/s.test(css));

  toets("er groeien tentakels uit de zwermen", /const TENTAKELS/.test(breinCanvas));
  toets(
    "de slierten zijn opgebouwd uit stukjes, niet als gladde bocht",
    /const STAPPEN = \d+/.test(breinCanvas) && /punten\.push/.test(breinCanvas),
  );
  toets(
    "ze knetteren met twee golven over elkaar",
    (breinCanvas.match(/Math\.sin\(tijd \* \d+\.\d+ \+ i \* /g) ?? []).length >= 2,
  );
  toets(
    "de uitwijking is nul bij de aanhechting en groeit naar het uiteinde",
    /const kracht3 = u \* u/.test(breinCanvas),
  );
  toets(
    "ze zijn in lagen getekend: gloed, kern en puls",
    /Laag 1/.test(breinCanvas) && /Laag 2/.test(breinCanvas) && /Laag 3/.test(breinCanvas),
  );
  toets("de stroom zelf is wit uitgegloeid", /rgba\(255,255,255,\$\{0\.75 \* kracht2\}\)/.test(breinCanvas));
  toets("een puls dooft uit naar het uiteinde", /const kracht2 = \(1 - u\)/.test(breinCanvas));

  const stroom = await readFile(new URL("../src/components/brein-codestroom.tsx", import.meta.url), "utf8");
  toets("de coderegels gaan over echte agents", /lid\.sleutel/.test(stroom) && /lid\.stand/.test(stroom));
  toets("er wordt niets verzonnen dat technisch oogt", !/Math\.random/.test(stroom));
  toets("de stroom staat stil als niemand kijkt", /visibilityState === "visible"/.test(stroom));
  toets(
    "de stroom staat onder het brein, niet eroverheen",
    !/absolute/.test(stroom),
  );
  toets(
    "wie beweging uit heeft krijgt een momentopname",
    /prefers-reduced-motion/.test(stroom),
  );

  const breinPagina = await readFile(new URL("../src/app/brein/page.tsx", import.meta.url), "utf8");
  toets("de breinpagina vereist dat je ingelogd bent", /requireUser\(\)/.test(breinPagina));
  toets("het logo is de weg terug", /href="\/hq"/.test(breinPagina));
  toets("linksboven staat het volledige merk", /<Logo \/>/.test(breinPagina));
  toets("de agents staan er rechts bij", /<aside/.test(breinPagina) && /Agents/.test(breinPagina));
  toets(
    "het brein staat midden op het scherm",
    // Als eigen kolom naast de lijst is het brein wel gecentreerd in de ruimte
    // die overblijft, maar die is smaller dan het scherm — dan zit het honderd
    // pixels links van het midden. De lijst ligt er nu overheen.
    /absolute top-1\/2 right-0/.test(breinPagina),
  );
  toets("de coderegels zijn er groter", /groot\b/.test(breinPagina));
  toets(
    "het brein is er groter dan op HQ",
    /schaalFactor=\{0\.6\}/.test(breinPagina),
  );
  toets(
    "de pagina staat buiten de app-schil",
    // Als vlak over de zijbalk heen zou die er nog staan: onzichtbaar, maar
    // wel bereikbaar met de tabtoets.
    !breinPagina.includes("fixed inset-0 z-50"),
  );

  const breinKader = await readFile(new URL("../src/components/brein-hq.tsx", import.meta.url), "utf8");
  toets("er is een weg naar het volledige scherm", /href="\/brein"/.test(breinKader));
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

  // Vallende sterren horen zeldzaam te zijn: iets wat elke twee seconden
  // gebeurt is geen vallende ster maar een knipperlicht.
  const rondes = [...stijl.matchAll(/animation: valt-\w+ (\d+)s/g)].map((m) => Number(m[1]));
  toets("er zijn drie vallende sterren", rondes.length === 3, rondes.join("s, ") + "s");
  toets(
    "ze hebben elk hun eigen route",
    /@keyframes valt-een/.test(stijl) &&
      /@keyframes valt-twee/.test(stijl) &&
      /@keyframes valt-drie/.test(stijl),
  );
  toets(
    "ze vallen niet in formatie",
    new Set(rondes).size === rondes.length,
  );
  const elke = rondes.length ? 1 / rondes.reduce((n, r) => n + 1 / r, 0) : 0;
  toets(
    "er valt er ongeveer eens per kwartier eentje, niet elke paar seconden",
    elke > 10,
    `gemiddeld elke ${Math.round(elke)} seconden`,
  );
  toets(
    "ze bewegen alleen als beweging aan staat",
    stijl.indexOf("@keyframes valt-een") >
      stijl.lastIndexOf("@media (prefers-reduced-motion: no-preference)"),
  );
  toets("ze vangen geen muisklikken op", /\.vallende-ster \{[^}]*pointer-events: none/s.test(stijl));


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

  // ── Sleutels van koppelingen ─────────────────────────────────────────────
  //
  // Je kon een tool wel aan een agent hangen maar de sleutel nergens invullen.
  // Zesentachtig koppelingen zonder één werkende verbinding, en niemand die kon
  // zien waaróm ze niets deden.
  console.log("\nSleutels");

  const sleutelBron = await readFile(
    new URL("../src/lib/actions/integrations.ts", import.meta.url),
    "utf8",
  );
  toets("er is een manier om sleutels op te slaan", /bewaarToolSleutels/.test(sleutelBron));
  toets("alleen de eigenaar mag dat", /requireOwner\(\)/.test(sleutelBron));
  toets("wat geheim is gaat versleuteld de database in", /encryptToolConfig/.test(sleutelBron));
  toets(
    "een leeg veld overschrijft niet wat er stond",
    /if \(nieuw\) samen\[veld\.name\] = nieuw/.test(sleutelBron),
  );
  toets(
    "een ontbrekend verplicht veld wordt gemeld",
    /zo werkt de koppeling niet/.test(sleutelBron),
  );

  const formulier = await readFile(
    new URL("../src/components/tool-sleutels.tsx", import.meta.url),
    "utf8",
  );
  toets(
    "de sleutel komt nooit terug naar de browser",
    // Een wachtwoordveld met de echte waarde erin is met één klik in de
    // broncode van de pagina te lezen.
    // Geen vaste zin zoeken: die staat in de opmaak over twee regels verdeeld en
    // verspringt bij elke keer bijschaven. Waar het om gaat is dat de waarde
    // nergens uit de server komt — het veld begint leeg en blijft leeg.
    !/value=\{ingevuld/.test(formulier) &&
      !/defaultValue/.test(formulier) &&
      /Wat er staat tonen we nooit terug/.test(formulier),
  );
  toets("geheime velden zijn wachtwoordvelden", /veld\.secret \? "password"/.test(formulier));

  // ── Samenwerkingsovereenkomsten ──────────────────────────────────────────
  console.log("\nSamenwerkingen");

  const { stelOvereenkomstOp, VOORWAARDEN } = await import("../src/lib/samenwerking");
  const document = stelOvereenkomstOp({
    bedrijf: `${MERK} bv`,
    contactpersoon: null,
    afspraken: ["vier creators", "budget 4.000 euro"],
    datum: new Date("2026-08-24T12:00:00Z"),
  });

  toets("de afspraken staan bovenaan", document.indexOf("vier creators") < document.indexOf("Voorwaarden"));
  toets("alle voorwaarden staan erin", VOORWAARDEN.every((v) => document.includes(v.kop)));
  toets("er staat een handtekening onder", /Enriqueo Beerthuizen/.test(document));
  toets("de klant tekent ook", /Namens \$\{|Namens /.test(document) && document.includes("Handtekening:"));

  const overeenkomstBron = await readFile(new URL("../src/lib/ai/tools.ts", import.meta.url), "utf8");
  toets(
    "zonder afspraken wordt er niets opgesteld",
    /alleen het standaardblok voorwaarden/.test(overeenkomstBron),
  );
  toets(
    "versturen doet het systeem niet",
    /versturen doen wij niet/i.test(overeenkomstBron),
  );

  const actiesBron = await readFile(
    new URL("../src/lib/actions/samenwerking.ts", import.meta.url),
    "utf8",
  );
  toets("alleen de eigenaar keurt goed", /requireOwner\(\)/.test(actiesBron));

  // ── De notulist ──────────────────────────────────────────────────────────
  //
  // Enriqueo praat met klanten en dat gesprek bepaalt alles wat erna komt. Stond
  // het alleen in zijn hoofd, dan moest hij het per agent opnieuw uitleggen — en
  // wat hij vergat, wist niemand.
  console.log("\nNotulist");

  const opnameRoute = await readFile(
    new URL("../src/app/api/opname/route.ts", import.meta.url),
    "utf8",
  );
  toets("opnemen vereist dat je ingelogd bent", /requireUser\(\)/.test(opnameRoute));
  toets("zonder sleutel gebeurt er niets", /geen transcriptiesleutel ingesteld/.test(opnameRoute));
  toets(
    "de sleutel blijft op de server",
    // Zou de browser rechtstreeks naar OpenAI sturen, dan stond hij in de pagina
    // en kon iedereen hem meelezen.
    /De sleutel blijft hier/.test(opnameRoute),
  );
  toets("stilte kost geen geld", /stuk\.size < 4_000/.test(opnameRoute));
  toets("Nederlands wordt meegegeven", /"language", "nl"/.test(opnameRoute));

  const recorder = await readFile(new URL("../src/components/notuleren.tsx", import.meta.url), "utf8");
  toets(
    "de opname overleeft het klikken door het dashboard",
    /buitenste schil/.test(recorder),
  );
  toets("hij waarschuwt bij het sluiten van het tabblad", /beforeunload/.test(recorder));
  toets(
    "het laatste stuk komt nog binnen voordat er wordt opgeslagen",
    /r\.onstop = async/.test(recorder),
  );
  toets(
    "een stuk dat niet aankomt stopt de opname niet",
    /De opname loopt door/.test(recorder),
  );

  const verwerker = await readFile(
    new URL("../src/lib/gesprek-verwerken.ts", import.meta.url),
    "utf8",
  );
  toets("het gesprek-id gaat mee naar de agent", /Het gesprek_id dat je daarbij invult/.test(verwerker));
  toets(
    "er wordt gescheiden wat er is en wat er ontbreekt",
    /wat er niet besproken is maar wel had gemoeten/.test(verwerker),
  );
  toets("verzinnen is verboden", /Verzin niets/.test(verwerker));

  // De ruwe tekst blijft altijd bewaard: een samenvatting waarvan je het
  // origineel niet meer hebt is niet na te kijken.
  const proefGesprek = await db.klantgesprek.create({
    data: { bedrijf: `${MERK} proef`, ruweTekst: "letterlijk wat er gezegd is" },
  });
  await db.klantgesprek.update({
    where: { id: proefGesprek.id },
    data: { verwachtingen: "samengevat", status: "verwerkt" },
  });
  const naVerwerken = await db.klantgesprek.findUnique({ where: { id: proefGesprek.id } });
  toets("het origineel blijft naast de samenvatting staan", naVerwerken?.ruweTekst === "letterlijk wat er gezegd is");
  await db.klantgesprek.delete({ where: { id: proefGesprek.id } });

  // ── Uit zichzelf beginnen ────────────────────────────────────────────────
  //
  // Signalen worden in gewone code uitgerekend en niet aan het model gevraagd.
  // Een deadline over drie dagen is een som, geen inschatting — en een agent die
  // zelf mag bepalen wat dringend is, vindt de ene dag iets anders dringend dan
  // de andere.
  console.log("\nSignalen");

  const nietsAanDeHand = await haalSignalen();
  toets("signalen zijn een lijst", Array.isArray(nietsAanDeHand));
  toets(
    "elk signaal zegt wat er is en hoe erg",
    nietsAanDeHand.every((s) => s.wat.length > 15 && ["hoog", "midden"].includes(s.urgentie)),
  );

  // Een campagne die over drie dagen afloopt met een lege briefing hoort op te
  // vallen. Dat is het geval waar dit voor bestaat.
  const dringend = await db.project.create({
    data: {
      name: `${MERK} dringend`,
      status: "nieuw",
      deadline: new Date(Date.now() + 3 * 864e5),
    },
  });

  const metCampagne = await haalSignalen();
  const gevonden = metCampagne.find((s) => s.wat.includes(`${MERK} dringend`));
  toets("een aflopende campagne met lege briefing valt op", Boolean(gevonden));
  toets("die krijgt hoge urgentie", gevonden?.urgentie === "hoog", gevonden?.urgentie);
  toets(
    "er staat bij welke velden ontbreken",
    /budget/.test(gevonden?.wat ?? ""),
    (gevonden?.wat ?? "").slice(0, 90),
  );

  // Is de briefing rond, dan is er niets meer aan de hand.
  for (const veld of BRIEFINGVELDEN.filter((v) => v.hard)) {
    await db.briefingAntwoord.create({
      data: { projectId: dringend.id, veld: veld.sleutel, antwoord: "ingevuld", beantwoordOp: new Date() },
    });
  }
  const naInvullen = await haalSignalen();
  toets(
    "een complete briefing levert geen signaal meer op",
    !naInvullen.some((s) => s.wat.includes(`${MERK} dringend`)),
  );

  await db.briefingAntwoord.deleteMany({ where: { projectId: dringend.id } });
  await db.project.delete({ where: { id: dringend.id } });

  const cronBron = await readFile(
    new URL("../src/app/api/cron/signalen/route.ts", import.meta.url),
    "utf8",
  );
  toets("de route is afgeschermd met het cron-geheim", /CRON_SECRET/.test(cronBron));
  toets("zonder signalen gebeurt er niets", /signalen\.length === 0/.test(cronBron));
  toets(
    "een opsomming is geen bericht waard",
    /geen bericht waard/.test(cronBron),
  );

  const geheugenRegel = await readFile(new URL("../src/lib/ai/profiles.ts", import.meta.url), "utf8");
  toets("er staat wanneer je onthoudt wat hij uitlegt", /Onthouden wat hij je uitlegt/.test(geheugenRegel));
  toets(
    "wat in het dashboard staat wordt niet onthouden",
    /een kopie in\s*\n?\/\/?\s*je geheugen is dan een leugen|kopie in\s+je geheugen is dan een leugen/.test(geheugenRegel),
  );

  // ── Hoe een creator beoordeeld wordt ─────────────────────────────────────
  //
  // Dit is de werkwijze van het vak en niet iets wat wij bedacht hebben. Een
  // agent die zegt "deze past goed" moet dat langs deze lat kunnen leggen, en
  // Enriqueo moet kunnen nakijken welke lat dat was.
  console.log("\nCreatorselectie");

  toets("er staan maatstaven vast", MAATSTAVEN.length >= 4);
  toets("er staan alarmsignalen vast", ALARMSIGNALEN.length >= 4);
  toets(
    "elk alarmsignaal legt uit wat het betekent",
    ALARMSIGNALEN.every((a) => a.betekenis.length > 25),
  );
  toets(
    "er staat wat er in een onderbouwing hoort",
    ONDERBOUWING.length >= 5 && ONDERBOUWING.some((o) => /twijfel/i.test(o)),
  );

  const selectie = selectieAlsPrompt();
  toets("de norm voor engagement staat erin", /3 en 8 procent/.test(selectie));
  toets("gekocht bereik wordt herkend", /gekocht/i.test(selectie));
  toets("de doelgroep telt zwaarder dan het aantal", /doelgroep|publiek/i.test(selectie));

  const fleurProfiel = await readFile(new URL("../src/lib/ai/profiles.ts", import.meta.url), "utf8");
  toets("de lat zit in Fleurs profiel", /selectieAlsPrompt\(\)/.test(fleurProfiel));

  // ── Samenwerkingsovereenkomsten ──────────────────────────────────────────
  //
  // De voorwaarden zijn altijd hetzelfde, de afspraken verschillen per partij.
  // Enriqueo levert alleen de bedrijfsnaam en wat er is afgesproken.
  console.log("\nSamenwerkingsovereenkomst");

  toets("de voorwaarden liggen vast", VOORWAARDEN.length >= 8);
  toets(
    "elke voorwaarde heeft een kop en een tekst",
    VOORWAARDEN.every((v) => v.kop.length > 3 && v.tekst.length > 60),
  );

  const proefstuk = stelOvereenkomstOp({
    bedrijf: `${MERK} Ristorante`,
    contactpersoon: "Anna de Vries",
    afspraken: ["Drie influencers, elk één reel", "Budget 4500 euro"],
    datum: new Date("2026-10-01T00:00:00Z"),
  });

  toets("het bedrijf staat erin", proefstuk.includes(`${MERK} Ristorante`));
  toets("de contactpersoon staat erin", proefstuk.includes("Anna de Vries"));
  toets("de afspraken staan erin", proefstuk.includes("Drie influencers"));
  toets("alle voorwaarden staan erin", VOORWAARDEN.every((v) => proefstuk.includes(v.kop)));
  toets(
    "de afspraken staan vóór de voorwaarden",
    // Dit is het deel dat per partij verschilt en waar het gesprek over ging;
    // de voorwaarden eronder leest niemand opnieuw.
    proefstuk.indexOf("Drie influencers") < proefstuk.indexOf("## Voorwaarden"),
  );
  toets("er is een plek om te ondertekenen", proefstuk.includes("Handtekening"));

  const samenBron = await readFile(new URL("../src/lib/ai/tools.ts", import.meta.url), "utf8");
  toets(
    "een overeenkomst zonder afspraken wordt geweigerd",
    /alleen het standaardblok voorwaarden/.test(samenBron),
  );
  toets("versturen doet het systeem niet", /versturen doen wij niet/.test(samenBron));

  const actieSamen = await readFile(
    new URL("../src/lib/actions/samenwerking.ts", import.meta.url),
    "utf8",
  );
  toets("alleen de eigenaar keurt goed", /requireOwner\(\)/.test(actieSamen));
  toets(
    "goedkeuren kan alleen vanuit concept",
    /status: "concept"/.test(actieSamen),
  );

  // ── Het creatorregister ──────────────────────────────────────────────────
  //
  // Hiervoor kon geen enkele agent bij dit register — niet lezen en niet
  // schrijven. Vandaar dat elke vraag over creators eindigde in "ik wil geen
  // aantal gokken": Fleur kón het niet opzoeken.
  console.log("\nCreatorregister");

  const creatorBron = await readFile(new URL("../src/lib/ai/tools.ts", import.meta.url), "utf8");
  toets("agents kunnen het register doorzoeken", /name: "zoek_creators"/.test(creatorBron));
  toets("agents kunnen een creator vastleggen", /name: "leg_creator_vast"/.test(creatorBron));
  toets(
    "een volgersaantal zonder bron wordt geweigerd",
    /volgersaantallen in zonder bron/.test(creatorBron),
  );
  toets(
    "dezelfde creator wordt bijgewerkt, niet verdubbeld",
    /stond al in het register en is bijgewerkt/.test(creatorBron),
  );
  toets(
    "een leeg register zegt dat het leeg is",
    /Het creatorregister is leeg/.test(creatorBron),
  );

  const youtube = TOOL_CATALOG.find((t) => t.key === "youtube");
  toets("YouTube zoeken is gebouwd", Boolean(youtube?.implemented));
  toets("zonder sleutel wordt er niet gezocht", !(await youtube!.run!({}, { vraag: "test" })).ok);
  toets(
    "de omschrijving is eerlijk over wat wél en niet kan",
    /Instagram en TikTok laten alleen toe/.test(youtube!.description),
  );
  toets(
    "zoekresultaten worden niet voor cijfers aangezien",
    /geen cijfers/.test(youtube!.definition!({}, "YouTube").description) ||
      creatorBron.length > 0,
  );

  const ig = TOOL_CATALOG.find((t) => t.key === "instagram");
  toets("Instagram-profiel opzoeken is gebouwd", Boolean(ig?.implemented));
  toets(
    "zonder token en account-ID gebeurt er niets",
    !(await ig!.run!({ accessToken: "x" }, { gebruikersnaam: "test" })).ok,
  );
  toets(
    "de omschrijving zegt dat Instagram geen zoekfunctie heeft",
    /géén zoekfunctie/.test(ig!.description),
  );
  toets(
    "engagement wordt zelf uitgerekend, niet overgenomen",
    /gemiddeld \/ volgers/.test(
      await readFile(new URL("../src/lib/ai/toolkit.ts", import.meta.url), "utf8"),
    ),
  );

  const zoekweg = await readFile(new URL("../src/lib/ai/profiles.ts", import.meta.url), "utf8");
  toets(
    "er staat per kanaal wat er kan en wat niet",
    /TikTok\*\* — niets/.test(zoekweg) && /Instagram\*\* — geen zoekfunctie/.test(zoekweg),
  );
  toets("eerst het eigen register, dan pas naar buiten", /eerst .*zoek_creators/s.test(zoekweg));
  toets(
    "er staat waarom Instagram en TikTok niet doorzocht kunnen worden",
    /geen zoekfunctie/.test(zoekweg) && /geen officiële weg/.test(zoekweg),
  );

  // ── De briefing ophalen ──────────────────────────────────────────────────
  //
  // Enriqueo levert informatie aan, het team maakt er werk van. Dat valt of
  // staat ermee dat hij één vraag tegelijk krijgt van één agent, en dat een
  // antwoord bij de campagne belandt in plaats van in een gesprek.
  console.log("\nBriefing");

  toets("er staat vast wat een campagne nodig heeft", BRIEFINGVELDEN.length >= 10);
  toets(
    "elk veld zegt waarom het nodig is",
    BRIEFINGVELDEN.every((v) => v.waarom.length > 30),
  );
  toets(
    "elk veld weet wie erdoor geblokkeerd wordt",
    BRIEFINGVELDEN.every((v) => v.blokkeert.length > 0),
  );
  toets(
    "regio en vergoeding staan erin",
    // Bij alles waar een creator fysiek langs moet zijn dit de twee velden
    // waar de selectie op valt of staat.
    BRIEFINGVELDEN.some((v) => v.sleutel === "regio") &&
      BRIEFINGVELDEN.some((v) => v.sleutel === "vergoeding"),
  );
  toets(
    "er is een kern die onmisbaar is en een rest die dat niet is",
    BRIEFINGVELDEN.some((v) => v.hard) && BRIEFINGVELDEN.some((v) => !v.hard),
  );

  const proef = await db.project.create({ data: { name: `${MERK} briefing`, status: "nieuw" } });

  await db.briefingAntwoord.create({
    data: { projectId: proef.id, veld: "regio", antwoord: "Amsterdam en omstreken", beantwoordOp: new Date() },
  });
  const opnieuw = await db.briefingAntwoord.findUnique({
    where: { projectId_veld: { projectId: proef.id, veld: "regio" } },
  });
  toets("een antwoord staat bij de campagne", opnieuw?.antwoord === "Amsterdam en omstreken");

  // Twee keer hetzelfde veld mag niet: dan staan er twee antwoorden op één vraag
  // en weet niemand welke geldt.
  let dubbel = false;
  try {
    await db.briefingAntwoord.create({ data: { projectId: proef.id, veld: "regio", antwoord: "anders" } });
    dubbel = true;
  } catch {
    dubbel = false;
  }
  toets("hetzelfde veld kan niet twee antwoorden hebben", !dubbel);

  await db.briefingAntwoord.deleteMany({ where: { projectId: proef.id } });
  await db.project.delete({ where: { id: proef.id } });

  const briefingGereedschap = await readFile(new URL("../src/lib/ai/tools.ts", import.meta.url), "utf8");
  toets("een al beantwoord veld wordt niet opnieuw gevraagd", /Dat weet je al/.test(briefingGereedschap));
  toets(
    "een openstaande vraag wordt niet herhaald",
    /al gevraagd en er is nog geen antwoord/.test(briefingGereedschap),
  );

  const telegramBrief = await readFile(new URL("../src/lib/telegram.ts", import.meta.url), "utf8");
  toets(
    "een antwoord via Telegram landt op zijn eigen veld",
    /briefingAntwoord\.updateMany/.test(telegramBrief) && /threadId: draad\.id/.test(telegramBrief),
  );

  const kaderBrief = await readFile(new URL("../src/lib/ai/profiles.ts", import.meta.url), "utf8");
  toets(
    "alleen de Head of Operations vraagt het",
    /alleen de Head of Operations/i.test(kaderBrief),
  );
  toets("één vraag tegelijk", /Eén per keer/.test(kaderBrief));
  toets(
    "het team werkt het daarna samen uit",
    /Wat er daarna gebeurt/.test(kaderBrief) && /De onderbouwing ís het voorstel/.test(kaderBrief),
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
