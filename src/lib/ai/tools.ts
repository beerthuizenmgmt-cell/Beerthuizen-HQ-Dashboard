import "server-only";

import { db } from "@/lib/db";
import { notify } from "@/lib/notifications";
import { logActivity } from "@/lib/agents";
import { meetingDate } from "@/lib/standup";
import { fromDayKey } from "@/lib/format";
import type { ToolDefinition } from "./provider";
import type { TaskPriority } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { remember, isMemoryKind } from "./memory";

// Het gereedschap van de agents. Alles hier werkt binnen het dashboard: geen
// enkel stuk gereedschap doet iets naar buiten. Externe acties lopen via
// vraag_goedkeuring, zodat Enriqueo altijd de laatste stap zet.

export type ToolContext = {
  agentId: string;
  agentName: string;
  isChief: boolean;
};

export const AGENT_TOOLS: ToolDefinition[] = [
  {
    name: "maak_taak",
    description:
      "Maak een taak aan op het takenbord. Gebruik dit voor werk dat gedaan moet worden — door jezelf, door een collega-agent, of door Enriqueo.",
    parameters: {
      type: "object",
      properties: {
        titel: { type: "string", description: "Korte omschrijving van wat er moet gebeuren" },
        toelichting: { type: "string", description: "Context: waarom, wat is het gewenste resultaat" },
        agent: {
          type: "string",
          description:
            "Sleutel van de agent die het uitvoert: chief, influencer, analytics, research, creative, social, operations, bizdev. Laat leeg als het voor Enriqueo is.",
        },
        prioriteit: { type: "string", enum: ["low", "normal", "high", "urgent"] },
        deadline: { type: "string", description: "Datum als JJJJ-MM-DD, optioneel" },
      },
      required: ["titel"],
    },
  },
  {
    name: "werk_taak_bij",
    description: "Werk een bestaande taak bij: voortgang melden, resultaat vastleggen of de status wijzigen.",
    parameters: {
      type: "object",
      properties: {
        taak_id: { type: "string" },
        bericht: { type: "string", description: "Wat je gedaan hebt of waar je staat" },
        status: { type: "string", enum: ["in_progress", "blocked", "review", "done"] },
      },
      required: ["taak_id", "bericht"],
    },
  },
  {
    name: "rapporteer_in_kanaal",
    description:
      "Plaats een bericht in een teamkanaal zodat het team en Enriqueo meelezen. Kanalen: algemeen, campagnes, resultaten.",
    parameters: {
      type: "object",
      properties: {
        kanaal: { type: "string", enum: ["algemeen", "campagnes", "resultaten"] },
        bericht: { type: "string" },
      },
      required: ["kanaal", "bericht"],
    },
  },
  {
    name: "vraag_aan_enriqueo",
    description:
      "Zet een vraag klaar voor de ochtendcall. Gebruik dit voor keuzes, prioriteiten of akkoord waar je zijn oordeel voor nodig hebt maar wat niet vandaag hoeft.",
    parameters: {
      type: "object",
      properties: { vraag: { type: "string" } },
      required: ["vraag"],
    },
  },
  {
    name: "vraag_goedkeuring",
    description:
      "Bied een volledig voorbereide externe, financiële of reputatiegevoelige actie ter goedkeuring aan. Verplicht voor: klanten of influencers berichten, geld uitgeven, budgetten wijzigen, publiceren, toezeggingen doen. Bereid het zo compleet voor dat Enriqueo alleen ja of nee hoeft te zeggen.",
    parameters: {
      type: "object",
      properties: {
        soort: {
          type: "string",
          enum: ["email_send", "external_message", "budget", "publish", "system_change", "other"],
        },
        titel: { type: "string", description: "Waar gaat het om, in één regel" },
        onderbouwing: { type: "string", description: "Waarom dit nodig is en wat het oplevert" },
        actie: {
          type: "object",
          description:
            "De volledig uitgewerkte actie. Bijvoorbeeld ontvanger, onderwerp en de complete tekst, of het exacte bedrag en waar het heen gaat.",
        },
      },
      required: ["soort", "titel", "onderbouwing", "actie"],
    },
  },
  {
    name: "noteer_bevinding",
    description:
      "Leg een bevinding vast in de activiteitenfeed: iets wat opvalt, een risico, een kans. Gebruik dit om zichtbaar te maken wat je hebt gezien zonder er meteen een taak van te maken.",
    parameters: {
      type: "object",
      properties: {
        bevinding: { type: "string" },
        urgentie: { type: "string", enum: ["info", "warn", "error", "success"] },
      },
      required: ["bevinding"],
    },
  },
  {
    name: "zoek_onderzoek",
    description:
      "Zoek in het onderzoeksarchief van het bureau: wat hebben we al uitgezocht over een merk, creator, markt of concurrent? Doe dit vóórdat je iemand vraagt iets uit te zoeken — dan hoeft hetzelfde niet twee keer.",
    parameters: {
      type: "object",
      properties: {
        zoekterm: { type: "string", description: "Merk, creator, markt of onderwerp" },
        onderwerp: {
          type: "string",
          enum: ["markt", "merk", "creator", "concurrent", "trend", "doelgroep", "prospect", "overig"],
          description: "Optioneel: beperk tot dit soort onderzoek",
        },
      },
      required: ["zoekterm"],
    },
  },
  {
    name: "onthoud",
    description:
      "Leg iets vast dat je later opnieuw nodig hebt: een besluit van Enriqueo en de reden erachter, een voorkeur, een vaste afspraak of een leerpunt. Dit gaat mee in al je volgende denkbeurten. Gebruik het niet voor gegevens die al in het dashboard staan — taken, cijfers en activiteiten kun je gewoon opzoeken.",
    parameters: {
      type: "object",
      properties: {
        soort: {
          type: "string",
          enum: ["besluit", "voorkeur", "afspraak", "leerpunt", "context"],
        },
        titel: { type: "string", description: "Waar het over gaat, in een paar woorden" },
        inhoud: { type: "string", description: "Wat je precies onthoudt, inclusief het waarom" },
        vastzetten: {
          type: "boolean",
          description: "Waar voor iets dat altijd mee moet, ook als je geheugen langer wordt",
        },
      },
      required: ["soort", "titel", "inhoud"],
    },
  },
];

/// Alleen de Head of Operations kan collega's aan het werk zetten; zo blijft de
/// aansturing op één plek en wordt het geen wirwar van agents die elkaar
/// opdrachten geven.
export const CHIEF_TOOLS: ToolDefinition[] = [
  {
    name: "bericht_enriqueo",
    description:
      "Stuur Enriqueo nú een bericht via Telegram. Gebruik dit alleen wanneer je hem écht nodig hebt: essentiële informatie ontbreekt, een deadline of project loopt risico, een agent zit vast, of je hebt iets klaar dat zijn akkoord nodig heeft. Kun je het zelf oplossen, doe dat dan — hij wil rust en overzicht, geen meldingen over dingen die jij kunt afhandelen. Kan het wachten tot morgenochtend, gebruik dan het ochtendrapport.",
    parameters: {
      type: "object",
      properties: {
        urgentie: {
          type: "string",
          enum: ["info", "vraag", "akkoord", "waarschuwing"],
          description:
            "info = hij moet dit weten, geen actie. vraag = je hebt informatie van hem nodig. akkoord = je hebt iets klaar dat hij moet goedkeuren. waarschuwing = risico, deadline of probleem dat nu aandacht vraagt.",
        },
        bericht: {
          type: "string",
          description:
            "Kort en concreet, zoals je het op zijn telefoon zou lezen. Bij een vraag: zeg wat je nodig hebt en waarom. Bij een waarschuwing: wat er speelt, wat de impact is, en wat jij zou doen.",
        },
        over_taak: { type: "string", description: "Taak-ID waar dit over gaat, als die er is" },
        over_project: { type: "string", description: "Project-ID waar dit over gaat, als die er is" },
        over_klant: { type: "string", description: "Naam van de klant waar dit over gaat, als die er is" },
      },
      required: ["urgentie", "bericht"],
    },
  },
  {
    name: "vraag_agent",
    description:
      "Stel een vraag aan een van je agents of geef hem een opdracht. Hij denkt na en antwoordt je meteen.",
    parameters: {
      type: "object",
      properties: {
        agent: {
          type: "string",
          description: "Sleutel: influencer, analytics, research, creative, social, operations, bizdev",
        },
        vraag: { type: "string" },
      },
      required: ["agent", "vraag"],
    },
  },
];

/// Alleen voor de Finance & Debiteuren Manager. De administratie bevat
/// klantnamen en bedragen; die hoeft de Creative Director niet in te zien.
export const FINANCE_TOOLS: ToolDefinition[] = [
  {
    name: "lees_facturen",
    description:
      "Lees de facturenadministratie: wat er openstaat, wie te laat is, welke stap er volgens de workflow aan de beurt is. Gebruik dit voordat je iets zegt over bedragen of termijnen — verzin nooit een bedrag dat je hier niet ziet.",
    parameters: {
      type: "object",
      properties: {
        alleen_te_laat: {
          type: "boolean",
          description: "Waar om alleen facturen te zien waarvan de vervaldatum verstreken is",
        },
      },
    },
  }
];


/// Werken aan een voorstel. Iedere agent vult zijn eigen onderdeel; alleen de
/// coördinator maakt er één geheel van en zet het klaar voor Enriqueo.
export const VOORSTEL_TOOLS: ToolDefinition[] = [
  {
    name: "vul_voorstel_sectie",
    description:
      "Vul jouw onderdeel van een voorstel in. Schrijf alleen wat je weet of kunt onderbouwen. " +
      "Ontbreekt informatie die je nodig hebt, vul die dan niet zelf in maar meld het met " +
      "meld_ontbrekend_in_voorstel — een voorstel met een verzonnen bedrag is erger dan een voorstel " +
      "met een lege regel, want de lege regel zie je.",
    parameters: {
      type: "object",
      properties: {
        voorstel_id: { type: "string" },
        sectie: {
          type: "string",
          enum: [
            "aanleiding", "doelstelling", "doelgroep", "strategie", "concept", "creators",
            "deliverables", "planning", "investering", "advertentiebudget", "voorwaarden",
            "vervolgstappen",
          ],
        },
        inhoud: { type: "string", description: "De tekst zoals hij in het voorstel komt te staan" },
        bron: {
          type: "string",
          description:
            "Waar dit op gebaseerd is: de briefing, een onderzoek, een tarief uit het dossier, of je eigen inschatting",
        },
      },
      required: ["voorstel_id", "sectie", "inhoud"],
    },
  },
  {
    name: "meld_ontbrekend_in_voorstel",
    description:
      "Meld dat je iets nodig hebt dat er niet is. Gebruik dit in plaats van iets aannemen. " +
      "Het komt op de gatenlijst van het voorstel en Enriqueo ziet het voordat hij tekent.",
    parameters: {
      type: "object",
      properties: {
        voorstel_id: { type: "string" },
        wat: { type: "string", description: "Wat je mist en waarvoor je het nodig hebt" },
        vanWie: { type: "string", description: "Bij wie het vandaan moet komen: de klant, Enriqueo, of een collega" },
      },
      required: ["voorstel_id", "wat"],
    },
  },
];

/// Alleen voor de coördinator: een voorstel starten en het afronden.
export const VOORSTEL_CHIEF_TOOLS: ToolDefinition[] = [
  {
    name: "start_voorstel",
    description:
      "Start een voorstel. Kies het soort; daaruit volgt welke onderdelen erin horen en welke collega's " +
      "eraan werken. Wat al in de briefing van de klant staat wordt automatisch overgenomen — laat dat " +
      "niet opnieuw invullen.",
    parameters: {
      type: "object",
      properties: {
        naam: { type: "string", description: "Bijvoorbeeld: Nike — najaarscampagne" },
        soort: { type: "string", enum: ["influencer", "event", "advertising", "studio", "overig"] },
        project_id: { type: "string", description: "Het project waar dit uit voortkomt, als dat er is" },
      },
      required: ["naam", "soort"],
    },
  },
  {
    name: "controleer_voorstel",
    description:
      "Loop het voorstel na voordat het naar Enriqueo gaat. Dit controleert wat een machine kan zien: " +
      "lege onderdelen, open plekken, ontbrekende bedragen, een planning die over de deadline loopt, " +
      "een klantnaam die nergens voorkomt. Spelling, toon en commerciële logica beoordeel je zelf. " +
      "Is alles in orde, dan komt het voorstel bij Enriqueo te liggen met jouw samenvatting.",
    parameters: {
      type: "object",
      properties: {
        voorstel_id: { type: "string" },
        wat: { type: "string", description: "Wat we voorstellen, in één regel" },
        investering: { type: "string", description: "Wat het de klant kost" },
        impact: { type: "string", description: "Wat het oplevert, en wat het ons oplevert" },
        aandachtspunt: { type: "string", description: "Het belangrijkste waar hij op moet letten" },
        beslissing: { type: "string", description: "Wat Enriqueo precies moet beslissen" },
      },
      required: ["voorstel_id", "wat", "investering", "beslissing"],
    },
  },
];

/// Alleen voor de Research Manager. Vastleggen is zijn vak; de rest leest mee.
/// Contractanalyse. Bij de Research Manager omdat het uitpluizen van een tekst
/// zijn vak is — en omdat het uitdrukkelijk geen juridisch advies is.
export const CONTRACT_TOOLS: ToolDefinition[] = [
  {
    name: "leg_contractanalyse_vast",
    description:
      "Leg de analyse van een contract vast. Vul alleen in wat er daadwerkelijk in het contract staat. " +
      "Alles wat je niet met zekerheid uit de tekst kunt halen zet je in 'onduidelijk' — dat veld leeg " +
      "laten terwijl je iets niet zeker weet is de ernstigste fout die je hier kunt maken. Je geeft geen " +
      "juridische zekerheid; je leest een tekst en zegt wat eruit blijkt.",
    parameters: {
      type: "object",
      properties: {
        contract_id: { type: "string", description: "Het ID van het contract dat je analyseert" },
        samenvatting: { type: "string", description: "Waar dit contract over gaat, in een paar zinnen" },

        vergoeding_eur: { type: "number", description: "Alleen als er een concreet bedrag staat" },
        betaaltermijn: { type: "string" },
        deliverables: { type: "array", items: { type: "string" } },
        usage_rights: { type: "string", description: "Wat mag het merk met de content, en hoe lang" },
        exclusiviteit: { type: "string" },
        looptijd: { type: "string" },
        annulering: { type: "string" },
        boetes: { type: "string" },
        whitelisting: { type: "string" },
        paid_usage: { type: "string" },
        contentrechten: { type: "string" },
        revisies: { type: "string" },
        concurrentiebeperking: { type: "string" },

        voordelen: { type: "array", items: { type: "string" } },
        nadelen: { type: "array", items: { type: "string" } },
        risicos: { type: "array", items: { type: "string" } },
        aandachtspunten: { type: "array", items: { type: "string" } },
        advies: {
          type: "string",
          description:
            "Wat jij zou doen, en waarom. Is de vergoeding logisch bij deze deliverables en deze rechten?",
        },
        onduidelijk: {
          type: "array",
          items: { type: "string" },
          description:
            "Wat er niet met zekerheid uit het contract volgt. Verplicht wanneer iets ontbreekt of " +
            "voor meer dan één uitleg vatbaar is.",
        },
      },
      required: ["contract_id", "samenvatting", "advies"],
    },
  },
];

export const RESEARCH_TOOLS: ToolDefinition[] = [
  {
    name: "leg_onderzoek_vast",
    description:
      "Leg een afgerond onderzoek vast in het archief, met de vraag, de bevindingen, je conclusie en je bronnen. Doe dit bij elk onderzoek dat later opnieuw van pas kan komen — zo hoeft niemand het over te doen.",
    parameters: {
      type: "object",
      properties: {
        vraag: { type: "string", description: "De onderzoeksvraag zoals hij gesteld was" },
        onderwerp: {
          type: "string",
          enum: ["markt", "merk", "creator", "concurrent", "trend", "doelgroep", "prospect", "overig"],
        },
        waarover: { type: "string", description: "Het merk, de creator of de markt waar dit over gaat" },
        bevindingen: { type: "string", description: "De belangrijkste punten, 3 tot 7" },
        inzicht: { type: "string", description: "Wat het betekent — jouw interpretatie, los van de feiten" },
        conclusie: { type: "string" },
        risicos: { type: "string" },
        kansen: { type: "string" },
        advies: { type: "string", description: "Wat jij zou doen" },
        bronnen: {
          type: "array",
          description: "Waar het vandaan komt. Leeg laten mag niet: zeg dan expliciet dat je geen bron had.",
          items: {
            type: "object",
            properties: {
              titel: { type: "string" },
              url: { type: "string" },
              geraadpleegdOp: { type: "string", description: "JJJJ-MM-DD" },
            },
          },
        },
        verouderd_na: {
          type: "string",
          description: "JJJJ-MM-DD. Alleen invullen bij actuele informatie die later opnieuw gecheckt moet worden.",
        },
      },
      required: ["vraag", "onderwerp", "bevindingen"],
    },
  },
];

const PRIORITIES: TaskPriority[] = ["low", "normal", "high", "urgent"];

export type ToolResult = { ok: boolean; message: string };

export async function runTool(
  name: string,
  args: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolResult> {
  try {
    switch (name) {
      case "maak_taak":
        return await makeTask(args, context);
      case "werk_taak_bij":
        return await updateTask(args, context);
      case "rapporteer_in_kanaal":
        return await reportInChannel(args, context);
      case "vraag_aan_enriqueo":
        return await askFounder(args, context);
      case "vraag_goedkeuring":
        return await requestApproval(args, context);
      case "noteer_bevinding":
        return await noteFinding(args, context);
      case "onthoud":
        return await rememberThis(args, context);
      case "zoek_onderzoek":
        return await searchResearch(args);
      case "vul_voorstel_sectie":
        return await fillProposalSection(args, context);
      case "meld_ontbrekend_in_voorstel":
        return await reportProposalGap(args);
      case "start_voorstel":
        return await startProposal(args, context);
      case "controleer_voorstel":
        return await checkProposal(args, context);
      case "leg_contractanalyse_vast":
        return await recordContractAnalysis(args);
      case "leg_onderzoek_vast":
        return await recordResearch(args, context);
      case "lees_facturen":
        return await readInvoices(args);
      case "bericht_enriqueo":
        return await messageFounder(args, context);
      default:
        return { ok: false, message: `Onbekend gereedschap: ${name}` };
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "onbekende fout" };
  }
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function makeTask(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
  const title = text(args.titel);
  if (!title) return { ok: false, message: "titel is verplicht" };

  const agentKey = text(args.agent);
  const assignee = agentKey ? await db.agent.findUnique({ where: { key: agentKey } }) : null;
  if (agentKey && !assignee) return { ok: false, message: `Onbekende agent: ${agentKey}` };

  const priority = text(args.prioriteit);
  const deadline = text(args.deadline);

  const task = await db.task.create({
    data: {
      title: title.slice(0, 200),
      description: text(args.toelichting) || null,
      agentId: assignee?.id ?? null,
      priority: (PRIORITIES as string[]).includes(priority) ? (priority as TaskPriority) : "normal",
      dueAt: /^\d{4}-\d{2}-\d{2}$/.test(deadline) ? fromDayKey(deadline) : null,
      status: assignee ? "assigned" : "inbox",
      source: "agent",
      createdByAgentId: context.agentId,
    },
  });

  await db.taskUpdate.create({
    data: {
      taskId: task.id,
      authorType: "agent",
      authorAgentId: context.agentId,
      kind: "status",
      body: `Aangemaakt door ${context.agentName}.`,
    },
  });

  return {
    ok: true,
    message: `Taak aangemaakt (id ${task.id})${assignee ? ` voor ${assignee.name}` : " in de inbox"}.`,
  };
}

async function updateTask(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
  const taskId = text(args.taak_id);
  const body = text(args.bericht);
  if (!taskId || !body) return { ok: false, message: "taak_id en bericht zijn verplicht" };

  const task = await db.task.findUnique({ where: { id: taskId } });
  if (!task) return { ok: false, message: "Die taak bestaat niet." };

  const status = text(args.status);
  const allowed = ["in_progress", "blocked", "review", "done"];

  await db.taskUpdate.create({
    data: {
      taskId,
      authorType: "agent",
      authorAgentId: context.agentId,
      kind: status === "done" ? "result" : "comment",
      body,
    },
  });

  if (allowed.includes(status)) {
    await db.task.update({
      where: { id: taskId },
      data: {
        status: status as "in_progress" | "blocked" | "review" | "done",
        result: status === "done" ? body : task.result,
        completedAt: status === "done" ? new Date() : null,
      },
    });

    if (status === "blocked" || status === "done") {
      await notify({
        level: status === "blocked" ? "warn" : "success",
        title:
          status === "done"
            ? `${context.agentName} rondde "${task.title}" af`
            : `${context.agentName} loopt vast op "${task.title}"`,
        body: body.slice(0, 200),
        link: `/taken/${taskId}`,
        agentId: context.agentId,
        push: status === "blocked",
      });
    }
  }

  return { ok: true, message: "Taak bijgewerkt." };
}

async function reportInChannel(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
  const channelKey = text(args.kanaal) || "algemeen";
  const body = text(args.bericht);
  if (!body) return { ok: false, message: "bericht is verplicht" };

  const channel = await db.channel.findUnique({ where: { key: channelKey } });
  if (!channel) return { ok: false, message: `Onbekend kanaal: ${channelKey}` };

  await db.message.create({
    data: {
      channelId: channel.id,
      fromType: "agent",
      fromAgentId: context.agentId,
      body,
      delivery: "delivered",
    },
  });

  return { ok: true, message: `Geplaatst in #${channel.key}.` };
}

async function askFounder(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
  const question = text(args.vraag);
  if (!question) return { ok: false, message: "vraag is verplicht" };

  const date = meetingDate();
  const meeting = await db.meeting.upsert({
    where: { date },
    update: {},
    create: { date, status: "collecting" },
  });

  const offset = await db.meetingQuestion.count({ where: { meetingId: meeting.id } });
  await db.meetingQuestion.create({
    data: { meetingId: meeting.id, agentId: context.agentId, body: question, sortOrder: offset },
  });

  return { ok: true, message: "Staat klaar voor de ochtendcall." };
}

async function requestApproval(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
  const title = text(args.titel);
  const summary = text(args.onderbouwing);
  if (!title || !summary) return { ok: false, message: "titel en onderbouwing zijn verplicht" };

  const kinds = ["email_send", "external_message", "budget", "publish", "system_change", "other"];
  const kind = text(args.soort);

  const approval = await db.approval.create({
    data: {
      agentId: context.agentId,
      kind: kinds.includes(kind) ? kind : "other",
      title: title.slice(0, 200),
      summary,
      payload: (args.actie ?? {}) as object,
    },
  });

  await notify({
    level: "warn",
    title: `${context.agentName} vraagt akkoord: ${title}`,
    body: summary.slice(0, 200),
    link: `/goedkeuringen`,
    agentId: context.agentId,
    push: true,
  });

  await logActivity({
    agentId: context.agentId,
    kind: "goedkeuring_gevraagd",
    level: "warn",
    message: `${context.agentName} vraagt akkoord: ${title}`,
  });

  return {
    ok: true,
    message: `Ter goedkeuring aangeboden (id ${approval.id}). Voer de actie niet uit; wacht op akkoord van Enriqueo.`,
  };
}

async function noteFinding(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
  const finding = text(args.bevinding);
  if (!finding) return { ok: false, message: "bevinding is verplicht" };

  const levels = ["info", "warn", "error", "success"];
  const level = text(args.urgentie);

  await logActivity({
    agentId: context.agentId,
    kind: "bevinding",
    level: (levels.includes(level) ? level : "info") as "info" | "warn" | "error" | "success",
    message: finding.slice(0, 500),
  });

  return { ok: true, message: "Vastgelegd in de activiteitenfeed." };
}

async function rememberThis(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
  const title = text(args.titel);
  const body = text(args.inhoud);
  if (!title || !body) return { ok: false, message: "titel en inhoud zijn verplicht" };

  const kind = text(args.soort);
  if (!isMemoryKind(kind)) {
    return { ok: false, message: "soort moet besluit, voorkeur, afspraak, leerpunt of context zijn" };
  }

  const { created } = await remember({
    agentId: context.agentId,
    kind,
    title,
    body,
    source: "agent",
    pinned: args.vastzetten === true,
  });

  return {
    ok: true,
    message: created
      ? "Onthouden. Dit gaat mee in je volgende denkbeurten."
      : "Je wist dit al; ik heb het bijgewerkt met de nieuwe inhoud.",
  };
}

async function readInvoices(args: Record<string, unknown>): Promise<ToolResult> {
  const { alleFacturen, debiteurenstand } = await import("@/lib/facturen");
  const facturen = await alleFacturen();

  if (facturen.length === 0) {
    return {
      ok: true,
      message:
        "De administratie is leeg. Er staan geen facturen in, dus er valt niets te analyseren. Zeg dat, en geef aan welke gegevens je nodig hebt.",
    };
  }

  const stand = await debiteurenstand();
  const selectie = args.alleen_te_laat === true ? facturen.filter((f) => f.teLaat) : facturen;

  const regels = selectie
    .slice(0, 50)
    .map(
      (f) =>
        // De richting hoort er expliciet bij: een inkomende factuur is geld dat
        // wéggaat en hoort niet in een debiteurenoverzicht. Zonder dit veld moet
        // de agent het uit de klantnaam raden.
        `${f.richting.toUpperCase()} | ${f.nummer} | ${f.klant} | €${f.bedragEur.toFixed(2)} | open €${f.openstaandEur.toFixed(2)} | ` +
        `vervalt ${f.vervaldatum.toISOString().slice(0, 10)} | ${f.teLaat ? `${f.dagenOpenstaand} dagen te laat` : "op tijd"} | ` +
        `${f.statusLabel} | ${f.opvolgingLabel} | volgende stap: ${f.volgendeStap}` +
        // Testdata moet als testdata herkenbaar zijn, ook als de opdracht dat
        // niet zegt. Anders rapporteert ze verzonnen bedragen als werkelijkheid.
        (f.bron === "testdata" ? ` | TESTDATA` : ""),
    );

  return {
    ok: true,
    message: [
      `Te ontvangen €${stand.teOntvangenEur.toFixed(2)}, te betalen €${stand.teBetalenEur.toFixed(2)}, ` +
        `betaald deze maand €${stand.betaaldDezeMaandEur.toFixed(2)}.`,
      `Te laat: €${stand.teLaatEur.toFixed(2)} over ${stand.aantalTeLaat} facturen. ` +
        `${stand.herinneringNodig} vragen om een eerste herinnering.`,
      stand.gemiddeldeBetaaltermijn !== null
        ? `Gemiddelde betaaltermijn: ${stand.gemiddeldeBetaaltermijn} dagen.`
        : `Gemiddelde betaaltermijn: nog niet te bepalen.`,
      ``,
      ...regels,
      selectie.length > 50 ? `(${selectie.length - 50} regels weggelaten)` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

async function searchResearch(args: Record<string, unknown>): Promise<ToolResult> {
  const term = text(args.zoekterm);
  if (!term) return { ok: false, message: "zoekterm is verplicht" };

  const onderwerp = text(args.onderwerp);
  const treffers = await db.researchEntry.findMany({
    where: {
      ...(onderwerp ? { subject: onderwerp as never } : {}),
      OR: [
        { question: { contains: term, mode: "insensitive" } },
        { about: { contains: term, mode: "insensitive" } },
        { findings: { contains: term, mode: "insensitive" } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 8,
    include: { agent: { select: { name: true } } },
  });

  if (treffers.length === 0) {
    return {
      ok: true,
      message: `Niets in het archief over "${term}". Dit is dus nog niet uitgezocht.`,
    };
  }

  const nu = Date.now();
  const regels = treffers.map((entry) => {
    const oud = entry.staleAfter && entry.staleAfter.getTime() < nu;
    return [
      `## ${entry.question}`,
      `${entry.agent.name} · ${entry.createdAt.toISOString().slice(0, 10)}${oud ? " · LET OP: deze informatie is verlopen en moet opnieuw gecontroleerd" : ""}`,
      entry.about ? `Over: ${entry.about}` : "",
      ``,
      entry.findings,
      entry.insight ? `\nInzicht: ${entry.insight}` : "",
      entry.conclusion ? `Conclusie: ${entry.conclusion}` : "",
      entry.advice ? `Advies: ${entry.advice}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  });

  return {
    ok: true,
    message: `${treffers.length} eerder${treffers.length === 1 ? " onderzoek" : "e onderzoeken"} over "${term}":\n\n${regels.join("\n\n---\n\n")}`,
  };
}

async function recordResearch(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
  const vraag = text(args.vraag);
  const bevindingen = text(args.bevindingen);
  if (!vraag || !bevindingen) return { ok: false, message: "vraag en bevindingen zijn verplicht" };

  const onderwerp = text(args.onderwerp) || "overig";
  const verouderd = text(args.verouderd_na);
  const bronnen = Array.isArray(args.bronnen) ? args.bronnen : [];

  const entry = await db.researchEntry.create({
    data: {
      agentId: context.agentId,
      question: vraag.slice(0, 500),
      subject: onderwerp as never,
      about: text(args.waarover).slice(0, 200) || null,
      findings: bevindingen.slice(0, 6000),
      insight: text(args.inzicht).slice(0, 3000) || null,
      conclusion: text(args.conclusie).slice(0, 2000) || null,
      risks: text(args.risicos).slice(0, 2000) || null,
      opportunities: text(args.kansen).slice(0, 2000) || null,
      advice: text(args.advies).slice(0, 2000) || null,
      sources: bronnen.length ? (bronnen as Prisma.InputJsonValue) : undefined,
      staleAfter: /^\d{4}-\d{2}-\d{2}$/.test(verouderd) ? new Date(`${verouderd}T12:00:00.000Z`) : null,
    },
  });

  await logActivity({
    agentId: context.agentId,
    kind: "onderzoek",
    level: "info",
    message: `Onderzoek vastgelegd: ${vraag.slice(0, 160)}`,
  });

  return {
    ok: true,
    message:
      bronnen.length === 0
        ? `Vastgelegd in het archief (${entry.id}). Let op: je hebt geen bronnen meegegeven — vermeld dan in je antwoord dat deze bevindingen niet herleidbaar zijn.`
        : `Vastgelegd in het archief (${entry.id}) met ${bronnen.length} bron${bronnen.length === 1 ? "" : "nen"}.`,
  };
}

/// Daan bereikt Enriqueo overdag.
///
/// Met een rem erop: vier berichten per uur is ruim voor een drukke dag en
/// weinig genoeg om te merken dat er iets misgaat. Zonder die grens wordt een
/// rechterhand een meldingenmachine, en dan zet je hem uit.
async function messageFounder(
  args: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolResult> {
  const bericht = text(args.bericht);
  if (!bericht) return { ok: false, message: "bericht is verplicht" };

  const urgentie = text(args.urgentie) || "info";
  const geldig = ["info", "vraag", "akkoord", "waarschuwing"];
  if (!geldig.includes(urgentie)) return { ok: false, message: `urgentie moet een van ${geldig.join(", ")} zijn` };

  const eenUurGeleden = new Date(Date.now() - 60 * 60_000);
  const recent = await db.telegramThread.count({
    where: { agentId: context.agentId, askedAt: { gte: eenUurGeleden } },
  });
  if (recent >= 4 && urgentie !== "waarschuwing") {
    return {
      ok: false,
      message:
        "Je hebt hem dit uur al vier keer benaderd. Bewaar dit voor het ochtendrapport, of los het zelf op. " +
        "Alleen een echte waarschuwing mag hier doorheen.",
    };
  }

  // Context opzoeken. Een klantnaam is makkelijker voor een agent dan een ID.
  //
  // Alles wordt eerst gecontroleerd: verwijst hij naar een project dat niet
  // bestaat, dan laten we die koppeling vallen in plaats van het hele bericht
  // te laten mislukken. Een waarschuwing die niet aankomt omdat er een ID naast
  // zat is erger dan een waarschuwing zonder projectkoppeling.
  const ruweTaak = text(args.over_taak);
  const ruwProject = text(args.over_project);
  const klantnaam = text(args.over_klant);

  const [taak, project, klant] = await Promise.all([
    ruweTaak ? db.task.findUnique({ where: { id: ruweTaak }, select: { id: true } }) : null,
    ruwProject ? db.project.findUnique({ where: { id: ruwProject }, select: { id: true } }) : null,
    klantnaam
      ? db.client.findFirst({ where: { name: { contains: klantnaam, mode: "insensitive" } } })
      : null,
  ]);

  const taskId = taak?.id ?? null;
  const projectId = project?.id ?? null;

  const icoon = { info: "🟢", vraag: "🟡", akkoord: "🔴", waarschuwing: "🚨" }[urgentie] ?? "🟢";
  const kop = { info: "Ter info", vraag: "Ik heb iets van je nodig", akkoord: "Jouw akkoord nodig", waarschuwing: "Let op" }[urgentie];

  const { sendTelegram } = await import("@/lib/telegram");
  const verstuurd = await sendTelegram(`${icoon} *${kop}*\n${bericht}`);

  if (!verstuurd.ok) {
    return { ok: false, message: `Kon Enriqueo niet bereiken: ${verstuurd.error}` };
  }

  // Alleen vastleggen als er een antwoord op hoort te komen; anders vervuil je
  // de lijst met openstaande vragen met dingen die geen vraag zijn.
  if (urgentie !== "info") {
    await db.telegramThread.create({
      data: {
        agentId: context.agentId,
        level: urgentie,
        question: bericht.slice(0, 500),
        taskId,
        projectId,
        clientId: klant?.id ?? null,
        telegramMessageId: verstuurd.messageId ?? null,
      },
    });
  }

  await logActivity({
    agentId: context.agentId,
    kind: "telegram",
    level: urgentie === "waarschuwing" ? "warn" : "info",
    message: `Naar Enriqueo (${urgentie}): ${bericht.slice(0, 160)}`,
  });

  return {
    ok: true,
    message:
      urgentie === "info"
        ? "Verstuurd."
        : "Verstuurd. Zijn antwoord komt bij deze vraag terecht, dus je weet straks waar het over gaat.",
  };
}

/// Legt een contractanalyse vast, veld voor veld.
///
/// De harde regel zit hier: staat er niets in `onduidelijk` terwijl er velden
/// leeg blijven, dan vult dit die lijst zelf aan. Een analyse die doet alsof
/// alles helder is, is gevaarlijker dan geen analyse — dan tekent iemand een
/// contract in de veronderstelling dat het nagekeken is.
async function recordContractAnalysis(args: Record<string, unknown>): Promise<ToolResult> {
  const contractId = text(args.contract_id);
  if (!contractId) return { ok: false, message: "contract_id is verplicht" };

  const contract = await db.contract.findUnique({ where: { id: contractId } });
  if (!contract) return { ok: false, message: "Dat contract bestaat niet." };

  const lijst = (waarde: unknown): string[] =>
    Array.isArray(waarde) ? waarde.map((x) => String(x)).filter(Boolean) : [];

  const velden: Record<string, string | null> = {
    betaaltermijn: text(args.betaaltermijn) || null,
    usageRights: text(args.usage_rights) || null,
    exclusiviteit: text(args.exclusiviteit) || null,
    looptijd: text(args.looptijd) || null,
    annulering: text(args.annulering) || null,
    boetes: text(args.boetes) || null,
    whitelisting: text(args.whitelisting) || null,
    paidUsage: text(args.paid_usage) || null,
    contentrechten: text(args.contentrechten) || null,
    revisies: text(args.revisies) || null,
    concurrentiebeperking: text(args.concurrentiebeperking) || null,
  };

  const onduidelijk = lijst(args.onduidelijk);
  const leegGebleven = Object.entries(velden)
    .filter(([, waarde]) => waarde === null)
    .map(([naam]) => naam);

  // Wat niet is ingevuld en ook niet als onduidelijk is gemeld, alsnog melden.
  for (const naam of leegGebleven) {
    if (!onduidelijk.some((punt) => punt.toLowerCase().includes(naam.toLowerCase()))) {
      onduidelijk.push(`${naam}: staat niet in het contract, of is er niet uit op te maken`);
    }
  }

  const vergoeding = typeof args.vergoeding_eur === "number" ? args.vergoeding_eur : null;
  if (vergoeding === null) onduidelijk.push("vergoeding: geen concreet bedrag gevonden");

  await db.contract.update({
    where: { id: contractId },
    data: {
      ...velden,
      vergoedingEur: vergoeding,
      deliverables: lijst(args.deliverables),
      samenvatting: text(args.samenvatting),
      voordelen: lijst(args.voordelen),
      nadelen: lijst(args.nadelen),
      risicos: lijst(args.risicos),
      aandachtspunten: lijst(args.aandachtspunten),
      advies: text(args.advies),
      onduidelijk,
      status: "geanalyseerd",
      geanalyseerdOp: new Date(),
    },
  });

  return {
    ok: true,
    message:
      `Analyse vastgelegd bij ${contract.naam}. ${onduidelijk.length} punt(en) staan als onduidelijk ` +
      `genoteerd. Zeg in je antwoord expliciet wat er níét uit het contract blijkt — Enriqueo moet weten ` +
      `waar hij zelf naar moet kijken.`,
  };
}

// ============================================================
// Voorstellen
// ============================================================

async function startProposal(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
  const naam = text(args.naam);
  const soort = text(args.soort);
  if (!naam) return { ok: false, message: "naam is verplicht" };

  const soorten = ["influencer", "event", "advertising", "studio", "overig"];
  if (!soorten.includes(soort)) {
    return { ok: false, message: `soort moet een van ${soorten.join(", ")} zijn` };
  }

  const projectId = text(args.project_id) || null;
  if (projectId) {
    const bestaat = await db.project.findUnique({ where: { id: projectId }, select: { id: true } });
    if (!bestaat) return { ok: false, message: "Dat project bestaat niet." };
  }

  const { maakVoorstel, agentsVoor } = await import("./../voorstellen");
  const uitkomst = await maakVoorstel({
    naam,
    soort: soort as "influencer" | "event" | "advertising" | "studio" | "overig",
    projectId,
  });

  const collegas = agentsVoor(soort as "influencer" | "event" | "advertising" | "studio" | "overig");

  await logActivity({
    agentId: context.agentId,
    kind: "voorstel_gestart",
    level: "info",
    message: `${context.agentName} startte het voorstel "${naam}" (${soort}).`,
  });

  return {
    ok: true,
    message: [
      `Voorstel aangemaakt (id ${uitkomst.voorstelId}).`,
      uitkomst.overgenomen.length
        ? `Overgenomen uit de briefing, niet opnieuw invullen: ${uitkomst.overgenomen.join(", ")}.`
        : `Er was geen briefing om uit te putten.`,
      uitkomst.ontbreekt.length ? `Ontbreekt nog: ${uitkomst.ontbreekt.join(" · ")}.` : ``,
      `Zet nu deze collega's aan het werk: ${collegas.join(", ")}. Geef ze het voorstel-ID mee.`,
    ]
      .filter(Boolean)
      .join(" "),
  };
}

async function fillProposalSection(
  args: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolResult> {
  const voorstelId = text(args.voorstel_id);
  const sectie = text(args.sectie);
  const inhoud = text(args.inhoud);
  if (!voorstelId || !sectie || !inhoud) {
    return { ok: false, message: "voorstel_id, sectie en inhoud zijn verplicht" };
  }

  const bestaand = await db.voorstelSectie.findUnique({
    where: { voorstelId_sleutel: { voorstelId, sleutel: sectie } },
  });
  if (!bestaand) {
    const alle = await db.voorstelSectie.findMany({
      where: { voorstelId },
      select: { sleutel: true },
      orderBy: { sortOrder: "asc" },
    });
    if (alle.length === 0) return { ok: false, message: "Dat voorstel bestaat niet." };
    return {
      ok: false,
      message: `Dit voorstel heeft geen onderdeel "${sectie}". Wel: ${alle.map((s) => s.sleutel).join(", ")}.`,
    };
  }

  await db.voorstelSectie.update({
    where: { id: bestaand.id },
    data: {
      inhoud,
      bron: text(args.bron) || `geschreven door ${context.agentName}`,
      status: "ingevuld",
      // De sectie krijgt de agent die hem daadwerkelijk invulde, ook als hij
      // oorspronkelijk aan iemand anders was toegewezen.
      agentId: context.agentId,
      opmerking: null,
    },
  });

  const open = await db.voorstelSectie.count({ where: { voorstelId, status: { not: "ingevuld" } } });

  return {
    ok: true,
    message:
      `${sectie} vastgelegd bij het voorstel.` +
      (open > 0 ? ` Nog ${open} onderde(e)l(en) open.` : ` Alle onderdelen zijn nu ingevuld.`),
  };
}

async function reportProposalGap(args: Record<string, unknown>): Promise<ToolResult> {
  const voorstelId = text(args.voorstel_id);
  const wat = text(args.wat);
  if (!voorstelId || !wat) return { ok: false, message: "voorstel_id en wat zijn verplicht" };

  const voorstel = await db.voorstel.findUnique({ where: { id: voorstelId } });
  if (!voorstel) return { ok: false, message: "Dat voorstel bestaat niet." };

  const vanWie = text(args.vanWie);
  const regel = vanWie ? `${wat} (${vanWie})` : wat;

  if (voorstel.ontbreekt.includes(regel)) {
    return { ok: true, message: "Stond er al op; niet nog een keer toegevoegd." };
  }

  await db.voorstel.update({
    where: { id: voorstelId },
    data: { ontbreekt: [...voorstel.ontbreekt, regel] },
  });

  return {
    ok: true,
    message: `Genoteerd als ontbrekend. Enriqueo ziet dit voordat hij tekent. Vul het niet zelf in.`,
  };
}

async function checkProposal(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
  const voorstelId = text(args.voorstel_id);
  if (!voorstelId) return { ok: false, message: "voorstel_id is verplicht" };

  const voorstel = await db.voorstel.findUnique({ where: { id: voorstelId } });
  if (!voorstel) return { ok: false, message: "Dat voorstel bestaat niet." };

  await db.voorstel.update({
    where: { id: voorstelId },
    data: {
      samenvattingWat: text(args.wat),
      samenvattingInvestering: text(args.investering),
      samenvattingImpact: text(args.impact) || null,
      samenvattingAandacht: text(args.aandachtspunt) || null,
      samenvattingBeslissing: text(args.beslissing),
    },
  });

  const { zetKlaarVoorAkkoord } = await import("./../voorstellen");
  const uitkomst = await zetKlaarVoorAkkoord(voorstelId);

  if (!uitkomst.ok) {
    return {
      ok: false,
      message:
        `Nog niet klaar. ${uitkomst.punten.length} punt(en): ` +
        uitkomst.punten.map((p) => `${p.sectie} — ${p.wat}`).join("; ") +
        `. Los dit op of stuur het onderdeel terug naar de collega die het schreef, en controleer daarna opnieuw.`,
    };
  }

  await notify({
    level: "warn",
    title: `Voorstel klaar voor akkoord: ${voorstel.naam}`,
    body: [
      text(args.wat),
      `Investering: ${text(args.investering)}`,
      text(args.aandachtspunt) ? `Let op: ${text(args.aandachtspunt)}` : "",
      `Beslissen: ${text(args.beslissing)}`,
    ]
      .filter(Boolean)
      .join(" · "),
    link: `/voorstellen/${voorstelId}`,
    agentId: context.agentId,
    push: true,
  });

  await logActivity({
    agentId: context.agentId,
    kind: "voorstel_klaar",
    level: "success",
    message: `${context.agentName} zette "${voorstel.naam}" klaar voor akkoord.`,
  });

  return {
    ok: true,
    message: `Gecontroleerd en klaargezet. Enriqueo heeft een melding met jouw samenvatting.`,
  };
}
