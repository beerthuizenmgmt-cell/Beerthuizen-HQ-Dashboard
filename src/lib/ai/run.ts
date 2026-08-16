import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { chat, getAiConfig, AiNotConfiguredError, type ChatMessage, type ToolDefinition } from "./provider";
import { resolveCost, checkBudget, assertWithinBudget } from "./cost";
import { AGENT_TOOLS, CHIEF_TOOLS, FINANCE_TOOLS, RESEARCH_TOOLS, runTool } from "./tools";
import { toolsForAgent, runAgentTool } from "./toolkit";
import { DEFAULT_COMPANY_CONTEXT, SHARED_FRAMEWORK } from "./profiles";
import { activeCharterFor, charterAsPrompt } from "./charters";
import { memoryAsPrompt } from "./memory";
import { formatDayLong } from "@/lib/format";

const CONTEXT_KEY = "company_context";

export async function getCompanyContext(): Promise<string> {
  const setting = await db.setting.findUnique({ where: { key: CONTEXT_KEY } });
  const stored = (setting?.value as { text?: string } | undefined)?.text;
  return stored?.trim() || DEFAULT_COMPANY_CONTEXT;
}

export async function setCompanyContext(text: string): Promise<void> {
  await db.setting.upsert({
    where: { key: CONTEXT_KEY },
    update: { value: { text } },
    create: { key: CONTEXT_KEY, value: { text } },
  });
}

/// Wat er op dit moment speelt. Zonder dit weet een agent wel wie hij is, maar
/// niet waar het bureau vandaag staat — en dan krijg je algemeenheden.
async function situationalContext(agentId: string): Promise<string> {
  const [agent, openTasks, recent, roster] = await Promise.all([
    db.agent.findUnique({ where: { id: agentId }, select: { name: true } }),
    db.task.findMany({
      where: { agentId, status: { notIn: ["done", "cancelled"] } },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      take: 10,
      select: { id: true, title: true, status: true, priority: true, dueAt: true },
    }),
    db.activityEvent.findMany({
      where: { agentId },
      orderBy: { occurredAt: "desc" },
      take: 5,
      select: { message: true, occurredAt: true },
    }),
    db.agent.findMany({
      where: { paused: false },
      orderBy: [{ isChief: "desc" }, { sortOrder: "asc" }],
      select: { key: true, name: true, role: true },
    }),
  ]);

  const lines: string[] = [
    `## Vandaag`,
    formatDayLong(new Date()),
    ``,
    `## Het team`,
    ...roster.map((member) => `- ${member.key}: ${member.name} — ${member.role}`),
  ];

  if (openTasks.length) {
    lines.push(``, `## Jouw open taken`);
    for (const task of openTasks) {
      const due = task.dueAt ? `, deadline ${task.dueAt.toISOString().slice(0, 10)}` : "";
      lines.push(`- [${task.id}] ${task.title} (${task.status}, ${task.priority}${due})`);
    }
  } else {
    lines.push(``, `## Jouw open taken`, `Geen.`);
  }

  if (recent.length) {
    lines.push(``, `## Wat jij recent deed`);
    for (const event of recent) {
      lines.push(`- ${event.occurredAt.toISOString().slice(0, 16).replace("T", " ")} — ${event.message}`);
    }
  }

  void agent;
  return lines.join("\n");
}

export type RunResult = {
  ok: boolean;
  text: string;
  error?: string;
  runId?: string;
};

/// Laat een agent nadenken over één opdracht. Hij mag onderweg gereedschap
/// gebruiken; alles wat hij doet is achteraf terug te zien in zijn run.
export async function runAgent(options: {
  agentId: string;
  input: string;
  trigger: string;
  /// Waarom deze agent wakker werd. Bij event-driven activering staat hier wat
  /// er veranderd was — zodat je achteraf ziet waar een aanroep vandaan kwam.
  reason?: string;
  taskId?: string;
  /// Voorkomt dat agents elkaar eindeloos blijven bevragen.
  depth?: number;
  /// "geen" laat de agent uitsluitend denken en antwoorden — geen taken
  /// aanmaken, niets vastleggen, niets naar buiten. Gebruikt voor de proefrun.
  gereedschap?: "standaard" | "geen";
}): Promise<RunResult> {
  const started = Date.now();
  const depth = options.depth ?? 0;

  const agent = await db.agent.findUnique({ where: { id: options.agentId } });
  if (!agent) return { ok: false, text: "", error: "Agent bestaat niet." };
  if (agent.paused) return { ok: false, text: "", error: `${agent.name} staat op pauze.` };

  let config;
  try {
    // Eerst de rem: boven budget draaien automatische analyses niet meer.
    await assertWithinBudget(options.trigger);
    config = await getAiConfig();
    if (!config.apiKey) throw new AiNotConfiguredError();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Taalmodel niet ingesteld.";
    return { ok: false, text: "", error: message };
  }

  const model = agent.modelId || config.defaultModel;
  const [companyContext, situation, memory] = await Promise.all([
    getCompanyContext(),
    situationalContext(agent.id),
    memoryAsPrompt(agent.id),
  ]);

  // Het functieprofiel dat jij in het dossier ziet, is letterlijk het profiel
  // dat hij meekrijgt. Zo kan er geen verschil ontstaan tussen wat er op papier
  // staat en wat hij denkt te mogen.
  const charter = activeCharterFor(agent.key);

  // Namen van collega's komen uit de database: hernoem je iemand in het
  // dashboard, dan heet hij ook in het denkwerk van zijn collega's anders.
  const roster = charter
    ? await db.agent.findMany({ select: { key: true, name: true } })
    : [];
  const namen = Object.fromEntries(roster.map((member) => [member.key, member.name]));

  const systemPrompt = [
    agent.systemPrompt?.trim() || `Jij bent ${agent.name}, ${agent.role}, bij Beerthuizen Management.`,
    ``,
    SHARED_FRAMEWORK,
    ...(charter ? [``, charterAsPrompt(charter, namen)] : []),
    // De werkinstructies staan ná het functieprofiel: het profiel zegt waar hij
    // over gaat, het playbook hoe hij het doet. Bij tegenspraak wint het
    // playbook, want dat is het meest specifiek opgeschreven.
    ...(agent.playbook?.trim() ? [``, `# Je werkinstructies`, ``, agent.playbook.trim()] : []),
    ``,
    `# Bedrijfscontext`,
    companyContext,
    ...(memory ? [``, memory] : []),
    ``,
    `# Stand van zaken`,
    situation,
  ].join("\n");

  // Op één niveau diep mag de Head collega's bevragen; dieper wordt het een
  // kettingreactie die niemand meer kan volgen.
  //
  // Daarbovenop krijgt elke agent zijn eigen gekoppelde tools. Die zijn per
  // agent: Canva bij de Creative Director maakt Canva niet beschikbaar voor
  // Analytics.
  const ownTools = options.gereedschap === "geen" ? [] : await toolsForAgent(agent.id);

  const tools: ToolDefinition[] =
    options.gereedschap === "geen"
      ? []
      : [
          ...(agent.isChief && depth === 0 ? [...AGENT_TOOLS, ...CHIEF_TOOLS] : AGENT_TOOLS),
          // De administratie is niet voor iedereen: daar staan klantnamen en
          // bedragen in.
          ...(agent.key === "finance" ? FINANCE_TOOLS : []),
          // Vastleggen is het vak van de Research Manager; opzoeken mag iedereen.
          ...(agent.key === "research" ? RESEARCH_TOOLS : []),
          ...ownTools.map((tool) => tool.definition),
        ];

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: options.input },
  ];

  let promptTokens = 0;
  let completionTokens = 0;
  let costEur = 0;
  let costKnown = true;
  const performed: { name: string; arguments: Record<string, unknown>; result: string }[] = [];
  let finalText = "";
  let failure: string | undefined;

  try {
    const rounds = tools.length === 0 ? 1 : Math.max(1, agent.maxToolCalls);

    for (let round = 0; round < rounds; round += 1) {
      const result = await chat({
        messages,
        model,
        tools: tools.length ? tools : undefined,
        temperature: 0.4,
      });

      promptTokens += result.usage.promptTokens;
      completionTokens += result.usage.completionTokens;
      const cost = await resolveCost(result, config.provider);
      costEur += cost.costEur;
      if (!cost.costKnown) costKnown = false;

      if (result.toolCalls.length === 0) {
        finalText = result.text;
        break;
      }

      messages.push({ role: "assistant", content: result.text, toolCalls: result.toolCalls });

      for (const call of result.toolCalls) {
        const outcome =
          call.name === "vraag_agent"
            ? await askColleague(call.arguments, agent.name, depth)
            : // Eerst zijn eigen koppelingen, dan het standaardgereedschap.
              ((await runAgentTool(agent.id, call.name, call.arguments)) ??
              (await runTool(call.name, call.arguments, {
                agentId: agent.id,
                agentName: agent.name,
                isChief: agent.isChief,
              })));

        performed.push({ name: call.name, arguments: call.arguments, result: outcome.message });
        messages.push({
          role: "tool",
          toolCallId: call.id,
          name: call.name,
          content: outcome.ok ? outcome.message : `FOUT: ${outcome.message}`,
        });
      }

      // Laatste ronde en nog steeds gereedschap? Dan vragen we om een afronding.
      if (round === rounds - 1) {
        messages.push({
          role: "user",
          content: "Rond af: vat in het kort samen wat je hebt gedaan en wat je conclusie is.",
        });
        const closing = await chat({ messages, model, temperature: 0.3 });
        promptTokens += closing.usage.promptTokens;
        completionTokens += closing.usage.completionTokens;
        const closingCost = await resolveCost(closing, config.provider);
        costEur += closingCost.costEur;
        if (!closingCost.costKnown) costKnown = false;
        finalText = closing.text;
      }
    }
  } catch (error) {
    failure = error instanceof Error ? error.message : "onbekende fout";
  }

  const run = await db.agentRun.create({
    data: {
      agentId: agent.id,
      trigger: options.trigger,
      reason: options.reason ?? null,
      model,
      provider: config.provider,
      taskId: options.taskId ?? null,
      input: options.input.slice(0, 4000),
      output: finalText.slice(0, 8000) || null,
      toolCalls: performed.length ? (performed as unknown as Prisma.InputJsonValue) : undefined,
      promptTokens,
      completionTokens,
      costEur,
      costKnown: costKnown && costEur > 0,
      durationMs: Date.now() - started,
      ok: !failure,
      error: failure ?? null,
    },
  });

  if (!failure) {
    await db.agent.update({
      where: { id: agent.id },
      data: { lastActiveAt: new Date(), status: "idle", lastError: null },
    });
    await checkBudget();
  } else {
    await db.agent.update({
      where: { id: agent.id },
      data: { status: "error", lastError: failure },
    });
  }

  return { ok: !failure, text: finalText, error: failure, runId: run.id };
}

/// De Head bevraagt een collega. Die denkt na en antwoordt meteen terug.
async function askColleague(
  args: Record<string, unknown>,
  askerName: string,
  depth: number,
): Promise<{ ok: boolean; message: string }> {
  const key = typeof args.agent === "string" ? args.agent.trim() : "";
  const question = typeof args.vraag === "string" ? args.vraag.trim() : "";
  if (!key || !question) return { ok: false, message: "agent en vraag zijn verplicht" };

  const colleague = await db.agent.findUnique({ where: { key } });
  if (!colleague) return { ok: false, message: `Onbekende agent: ${key}` };
  if (colleague.paused) return { ok: false, message: `${colleague.name} staat op pauze.` };

  const answer = await runAgent({
    agentId: colleague.id,
    input: `${askerName} vraagt je het volgende:\n\n${question}`,
    trigger: "message",
    depth: depth + 1,
  });

  return answer.ok
    ? { ok: true, message: `${colleague.name} antwoordt:\n${answer.text}` }
    : { ok: false, message: `${colleague.name} kon niet antwoorden: ${answer.error}` };
}
