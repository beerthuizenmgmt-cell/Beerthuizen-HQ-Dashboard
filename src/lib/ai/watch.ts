import "server-only";

import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { runAgent } from "./run";
import type { Relevance } from "@/generated/prisma/enums";

// Event-driven activering.
//
// Het uitgangspunt: een agent hoeft niet elke ochtend hetzelfde opnieuw te
// bekijken. Elk bewaakt onderwerp krijgt een vingerafdruk van zijn data. Is die
// gelijk aan de vingerafdruk waarop de laatste analyse draaide, dan gebeurt er
// niets — geen aanroep, geen kosten, geen "ik heb niets nieuws gevonden".
//
//   nieuwe data → detectie → agent activeren → analyse → inzicht bewaren
//
// in plaats van
//
//   elke ochtend → iedereen laten denken

export type Fingerprint = {
  /// Verandert deze waarde, dan is er iets gebeurd.
  hash: string;
  /// Wat er nu staat, in gewone taal. Gaat mee in de opdracht aan de agent.
  summary: string;
  /// Hoeveel er is; nul betekent meestal dat er nog geen bron gekoppeld is.
  size: number;
};

function fingerprint(parts: unknown[], summary: string, size: number): Fingerprint {
  return {
    hash: createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 32),
    summary,
    size,
  };
}

type Probe = (agentId: string) => Promise<Fingerprint>;

/// De bronnen die het systeem echt kan zien. Komt er later een koppeling bij
/// (Meta Ads, web monitoring), dan komt hier een probe bij en werkt de rest
/// ongewijzigd mee.
const PROBES: Record<string, Probe> = {
  async tasks(agentId) {
    const tasks = await db.task.findMany({
      where: { agentId, status: { notIn: ["cancelled"] } },
      orderBy: { updatedAt: "desc" },
      select: { id: true, status: true, updatedAt: true, title: true },
    });
    return fingerprint(
      tasks.map((task) => [task.id, task.status, task.updatedAt.getTime()]),
      tasks.length
        ? `${tasks.length} taken, laatst gewijzigd: ${tasks[0].title} (${tasks[0].status})`
        : "geen taken",
      tasks.length,
    );
  },

  /// Voor de Head: het werk van het hele team, niet alleen dat van hemzelf.
  async team_tasks() {
    const tasks = await db.task.findMany({
      where: { status: { not: "cancelled" } },
      orderBy: { updatedAt: "desc" },
      select: { id: true, status: true, updatedAt: true, title: true },
    });
    const open = tasks.filter((task) => task.status !== "done").length;
    return fingerprint(
      tasks.map((task) => [task.id, task.status, task.updatedAt.getTime()]),
      tasks.length
        ? `${tasks.length} taken (${open} open), laatst gewijzigd: "${tasks[0].title}" → ${tasks[0].status}`
        : "geen taken",
      tasks.length,
    );
  },

  async ad_metrics() {
    const [count, latest, totals] = await Promise.all([
      db.adMetric.count(),
      db.adMetric.findFirst({ orderBy: { date: "desc" }, select: { date: true } }),
      db.adMetric.aggregate({ _sum: { spend: true, conversions: true } }),
    ]);
    return fingerprint(
      [count, latest?.date?.getTime() ?? 0, totals._sum.spend ?? 0, totals._sum.conversions ?? 0],
      count
        ? `${count} dagregels, tot ${latest?.date?.toISOString().slice(0, 10)}, totaal €${(totals._sum.spend ?? 0).toFixed(2)} besteed`
        : "nog geen campagnecijfers binnengekomen",
      count,
    );
  },

  async ad_campaigns() {
    const campaigns = await db.adCampaign.findMany({
      select: { id: true, name: true, status: true, dailyBudget: true },
    });
    return fingerprint(
      campaigns.map((campaign) => [campaign.id, campaign.status, campaign.dailyBudget]),
      campaigns.length ? `${campaigns.length} campagnes` : "nog geen campagnes bekend",
      campaigns.length,
    );
  },

  async activity(agentId) {
    const events = await db.activityEvent.findMany({
      where: { agentId },
      orderBy: { occurredAt: "desc" },
      take: 25,
      select: { id: true, message: true },
    });
    return fingerprint(
      events.map((event) => event.id),
      events.length ? `${events.length} recente gebeurtenissen, nieuwste: ${events[0].message}` : "geen activiteit",
      events.length,
    );
  },

  /// Signalen die van buiten komen: iets wat jij meldt, of straks een
  /// monitor die een bron in de gaten houdt. Zolang die monitor er niet is, is
  /// dit de enige manier waarop Research wakker wordt — en dat is eerlijker dan
  /// hem elke dag ongericht laten zoeken.
  async manual_signal(agentId) {
    const signals = await db.activityEvent.findMany({
      where: { agentId, kind: "signaal" },
      orderBy: { occurredAt: "desc" },
      take: 20,
      select: { id: true, message: true, occurredAt: true },
    });
    return fingerprint(
      signals.map((signal) => signal.id),
      signals.length
        ? `${signals.length} gemelde ontwikkelingen, nieuwste: ${signals[0].message}`
        : "geen nieuwe ontwikkelingen gemeld",
      signals.length,
    );
  },

  /// Facturen: verandert er iets aan wat openstaat, wat te laat is of welke
  /// stap er aan de beurt is, dan wordt Maud wakker. Blijft alles gelijk, dan
  /// draait er niets — ook niet als er honderd facturen in staan.
  async invoices() {
    const facturen = await db.invoice.findMany({
      where: { status: { notIn: ["betaald", "oninbaar", "vervallen_verklaard"] } },
      orderBy: { dueOn: "asc" },
      select: { id: true, status: true, followUp: true, dueOn: true, paidAmountEur: true },
    });

    const nu = Date.now();
    const teLaat = facturen.filter((f) => f.dueOn.getTime() < nu);

    // De vingerafdruk bevat ook of een factuur inmiddels over de vervaldatum is.
    // Zo wordt zij wakker op de dag dat een termijn verstrijkt, zonder dat er
    // iemand iets hoeft in te voeren.
    return fingerprint(
      facturen.map(
        (f) => `${f.id}:${f.status}:${f.followUp}:${f.dueOn.getTime() < nu ? "over" : "open"}:${f.paidAmountEur ?? ""}`,
      ),
      facturen.length
        ? `${facturen.length} openstaande facturen, waarvan ${teLaat.length} over de vervaldatum`
        : "geen openstaande facturen",
      facturen.length,
    );
  },

  async approvals(agentId) {
    const approvals = await db.approval.findMany({
      where: { agentId, status: "pending" },
      select: { id: true },
    });
    return fingerprint(
      approvals.map((approval) => approval.id),
      approvals.length ? `${approvals.length} openstaande goedkeuringen` : "geen openstaande goedkeuringen",
      approvals.length,
    );
  },
};

export type DetectionOutcome = {
  watch: string;
  label: string;
  agent: string;
  changed: boolean;
  activated: boolean;
  /// Alleen bij een proefdraai: zou deze bewaking nú echt een agent wakker maken?
  ///
  /// Niet af te leiden uit `changed`: die staat ook aan bij een bewaking die
  /// wel veranderde data ziet maar toch niet afgaat, omdat de agent op pauze
  /// staat of het minimuminterval nog loopt. Wie op `changed` telde, kreeg
  /// vijftien terwijl er acht zouden aanslaan.
  zouActiveren?: boolean;
  reason: string;
};

/// Loopt alle bewaakte onderwerpen langs, werkt de vingerafdrukken bij en
/// activeert alleen wat echt veranderd is.
export async function detectAndActivate(options: { dryRun?: boolean } = {}): Promise<DetectionOutcome[]> {
  const watches = await db.agentWatch.findMany({
    where: { active: true },
    include: { agent: { select: { id: true, name: true, paused: true } } },
  });

  const outcomes: DetectionOutcome[] = [];
  const now = new Date();

  for (const watch of watches) {
    const probe = PROBES[watch.probe];
    if (!probe) {
      outcomes.push({
        watch: watch.key,
        label: watch.label,
        agent: watch.agent.name,
        changed: false,
        activated: false,
        reason: `onbekende probe "${watch.probe}"`,
      });
      continue;
    }

    const current = await probe(watch.agentId);
    const dataChanged = current.hash !== watch.dataHash;

    if (dataChanged && !options.dryRun) {
      await db.agentWatch.update({
        where: { id: watch.id },
        data: {
          dataHash: current.hash,
          dataVersion: { increment: 1 },
          lastDataChangeAt: now,
        },
      });
    }

    const alreadyAnalysed = current.hash === watch.analyzedHash;
    const tooSoon = watch.nextEligibleAt ? now < watch.nextEligibleAt : false;

    // Dit is de kern: niets nieuws betekent niet nadenken.
    if (alreadyAnalysed) {
      if (!options.dryRun) {
        await db.agentWatch.update({
          where: { id: watch.id },
          data: { lastReason: "geen wijziging sinds de laatste analyse" },
        });
      }
      outcomes.push({
        watch: watch.key,
        label: watch.label,
        agent: watch.agent.name,
        changed: dataChanged,
        activated: false,
        reason: "geen wijziging sinds de laatste analyse",
      });
      continue;
    }

    if (current.size === 0) {
      outcomes.push({
        watch: watch.key,
        label: watch.label,
        agent: watch.agent.name,
        changed: dataChanged,
        activated: false,
        reason: "geen data om te analyseren",
      });
      continue;
    }

    if (tooSoon) {
      outcomes.push({
        watch: watch.key,
        label: watch.label,
        agent: watch.agent.name,
        changed: dataChanged,
        activated: false,
        reason: `wacht tot ${watch.nextEligibleAt?.toISOString().slice(11, 16)} (minimuminterval)`,
      });
      continue;
    }

    if (watch.agent.paused) {
      outcomes.push({
        watch: watch.key,
        label: watch.label,
        agent: watch.agent.name,
        changed: dataChanged,
        activated: false,
        reason: "agent staat op pauze",
      });
      continue;
    }

    const reason = `nieuwe of gewijzigde data bij "${watch.label}": ${current.summary}`;

    if (options.dryRun) {
      outcomes.push({
        watch: watch.key,
        label: watch.label,
        agent: watch.agent.name,
        changed: dataChanged,
        activated: false,
        zouActiveren: true,
        reason: `zou activeren — ${reason}`,
      });
      continue;
    }

    await analyseWatch(watch.id, watch.agentId, watch.label, current, reason);

    outcomes.push({
      watch: watch.key,
      label: watch.label,
      agent: watch.agent.name,
      changed: dataChanged,
      activated: true,
      reason,
    });
  }

  return outcomes;
}

const RELEVANCE: Record<string, Relevance> = {
  hoog: "high",
  gemiddeld: "medium",
  laag: "low",
};

async function analyseWatch(
  watchId: string,
  agentId: string,
  label: string,
  current: Fingerprint,
  reason: string,
): Promise<void> {
  const previous = await db.agentInsight.findFirst({
    where: { watchId },
    orderBy: { createdAt: "desc" },
    select: { title: true, body: true, createdAt: true },
  });

  const instruction = [
    `Er is iets veranderd in "${label}". Dit is wat er nu staat:`,
    ``,
    current.summary,
    ``,
    previous
      ? `Je vorige conclusie hierover (${previous.createdAt.toISOString().slice(0, 10)}) was:\n"${previous.title}" — ${previous.body.slice(0, 600)}\n\nKijk of die nog klopt en wat er is veranderd.`
      : `Je hebt hier nog niet eerder naar gekeken.`,
    ``,
    `Analyseer alleen deze wijziging — niet je hele vakgebied opnieuw. Is dit niet`,
    `de moeite waard om te melden, antwoord dan uitsluitend met: NIETS TE MELDEN`,
    ``,
    `Anders antwoord je in dit formaat:`,
    `TITEL: <één regel>`,
    `RELEVANTIE: hoog | gemiddeld | laag`,
    `<je analyse en wat jij zou doen>`,
  ].join("\n");

  const result = await runAgent({
    agentId,
    input: instruction,
    trigger: "watch",
    reason,
    gereedschap: "geen",
  });

  const now = new Date();
  const watch = await db.agentWatch.findUnique({ where: { id: watchId } });

  await db.agentWatch.update({
    where: { id: watchId },
    data: {
      analyzedHash: current.hash,
      lastAnalyzedAt: now,
      lastReason: reason,
      nextEligibleAt: new Date(now.getTime() + (watch?.minIntervalMinutes ?? 60) * 60_000),
    },
  });

  if (!result.ok) return;

  const text = result.text.trim();
  if (!text || /^NIETS TE MELDEN/i.test(text)) return;

  const title = /TITEL:\s*(.+)/i.exec(text)?.[1]?.trim() ?? `Wijziging in ${label}`;
  const relevanceWord = /RELEVANTIE:\s*(hoog|gemiddeld|laag)/i.exec(text)?.[1]?.toLowerCase();
  const body = text
    .replace(/TITEL:\s*.+\n?/i, "")
    .replace(/RELEVANTIE:\s*(hoog|gemiddeld|laag)\n?/i, "")
    .trim();

  await db.agentInsight.create({
    data: {
      agentId,
      watchId,
      title: title.slice(0, 200),
      body: body || text,
      relevance: RELEVANCE[relevanceWord ?? ""] ?? "medium",
      dataVersion: (watch?.dataVersion ?? 0) + 1,
    },
  });
}

/// Standaard bewaakte onderwerpen. Bewust beperkt tot bronnen die het systeem
/// nu echt kan zien; wat er niet is, staat er ook niet in.
export const DEFAULT_WATCHES: {
  agentKey: string;
  key: string;
  label: string;
  probe: string;
  minIntervalMinutes: number;
}[] = [
  {
    agentKey: "chief",
    key: "chief-teamwerk",
    label: "Werk van het team",
    probe: "team_tasks",
    minIntervalMinutes: 60,
  },
  {
    // Een goedkeuring die blijft liggen kost geld of tijd; hij herinnert eraan
    // in plaats van te wachten tot Enriqueo er zelf aan denkt.
    agentKey: "chief",
    key: "chief-goedkeuringen",
    label: "Openstaande goedkeuringen",
    probe: "approvals",
    minIntervalMinutes: 240,
  },
  {
    // Foutmeldingen en stilgevallen agents. Hij hoort het eerder te zien dan jij.
    agentKey: "chief",
    key: "chief-storingen",
    label: "Fouten en stilgevallen agents",
    probe: "activity",
    minIntervalMinutes: 120,
  },
  {
    agentKey: "analytics",
    key: "analytics-campagnecijfers",
    label: "Campagnecijfers",
    probe: "ad_metrics",
    minIntervalMinutes: 180,
  },
  {
    agentKey: "influencer",
    key: "influencer-campagnes",
    label: "Lopende campagnes",
    probe: "ad_campaigns",
    minIntervalMinutes: 180,
  },
  {
    agentKey: "research",
    key: "research-ontwikkelingen",
    label: "Gemelde marktontwikkelingen",
    probe: "manual_signal",
    minIntervalMinutes: 30,
  },
  {
    agentKey: "bizdev",
    key: "bizdev-signalen",
    label: "Commerciële signalen",
    probe: "manual_signal",
    minIntervalMinutes: 30,
  },
  {
    agentKey: "finance",
    key: "finance-facturen",
    label: "Openstaande facturen en vervaldatums",
    probe: "invoices",
    minIntervalMinutes: 120,
  },
  {
    agentKey: "operations",
    key: "operations-werkstroom",
    label: "Taken en werkstroom",
    probe: "tasks",
    minIntervalMinutes: 240,
  },
];
