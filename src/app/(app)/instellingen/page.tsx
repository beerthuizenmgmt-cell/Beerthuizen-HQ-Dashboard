import { db } from "@/lib/db";
import { requireOwner } from "@/lib/access";
import { InstanceManager } from "@/components/instance-manager";
import { AiSettings, FinanceSettings, ContextSettings } from "@/components/ai-settings";
import { SystemStatus, type StatusItem } from "@/components/system-status";
import { getAiStatus } from "@/lib/ai/provider";
import { getFinanceSettings } from "@/lib/ai/cost";
import { getCompanyContext } from "@/lib/ai/run";
import { TelegramSettings } from "@/components/telegram-settings";
import { getTelegramStatus } from "@/lib/telegram";
import { isRecent } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireOwner();

  const [instances, standup, alerts] = await Promise.all([
    db.instance.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { agents: true } } },
    }),
    db.setting.findUnique({ where: { key: "standup" } }),
    db.setting.findUnique({ where: { key: "alerts" } }),
  ]);

  const [aiConfig, finance, companyContext, builtinAgents, activeAgents, runCount, telegram] = await Promise.all([
    getAiStatus(),
    getFinanceSettings(),
    getCompanyContext(),
    db.agent.count({ where: { adapterType: "builtin" } }),
    db.agent.count({ where: { adapterType: "builtin", paused: false } }),
    db.agentRun.count(),
    getTelegramStatus(),
  ]);


  const statusItems: StatusItem[] = [
    {
      name: "Dashboard, taken, agenda en kanalen",
      level: "live",
      detail: "Volledig werkend en getest. Geen externe afhankelijkheden, geen kosten.",
    },
    {
      name: "Reader-koppeling met OpenClaw",
      level: instances.length > 0 ? "live" : "wacht",
      detail:
        instances.length > 0
          ? `${instances.length} koppeling(en) aangemaakt; snapshots en activiteit komen binnen.`
          : "Werkend en getest, maar er is nog geen koppeling aangemaakt.",
    },
    {
      name: "Ingebouwde AI-agents",
      level: aiConfig.connected ? (runCount > 0 ? "live" : "deels") : "wacht",
      detail: aiConfig.connected
        ? runCount > 0
          ? `${activeAgents} van ${builtinAgents} agents actief, ${runCount} aanroepen gedaan.`
          : "Sleutel staat er, maar er heeft nog geen agent gedraaid. Doe eerst een proefopdracht."
        : "Profielen en machinerie staan klaar. Er is nog geen API-sleutel, dus er draait niets en is €0 uitgegeven.",
    },
    {
      name: "Kostenregistratie en budget",
      level: aiConfig.connected ? "live" : "wacht",
      detail:
        "Per aanroep worden model, aanbieder, tokens, kosten en duur vastgelegd. Bedragen die de aanbieder niet meldt blijven leeg in plaats van geschat.",
    },
    {
      name: "Ochtendoverleg en ochtendcall",
      level: aiConfig.connected ? "deels" : "wacht",
      detail:
        "De schermen, de uitvraag en de vragenwachtrij werken en zijn getest met gesimuleerde antwoorden. Echte inhoud komt er zodra de agents draaien.",
    },
    {
      name: "Goedkeuringen voor externe acties",
      level: "live",
      detail:
        "Agents bieden externe acties ter goedkeuring aan en jij beslist op /goedkeuringen. Akkoord wordt een taak; afwijzen stuurt je uitleg naar de agent.",
    },
    {
      name: "Head of Operations met Telegram-rapport",
      level: telegram.ready ? "live" : telegram.hasToken ? "wacht" : "niet",
      detail: telegram.ready
        ? `Verbonden met @. Meldingen gaan door; de dagelijkse cyclus en het ochtendrapport bouw ik hierna.`
        : telegram.hasToken
          ? "De bot is gekoppeld maar kent je chat nog niet — stuur hem één bericht en klik op Zoek mijn chat."
          : "Nog geen bot gekoppeld.",
    },
    {
      name: "Meta Ads, web search en e-mail",
      level: "niet",
      detail: "Nog niet gebouwd. Agents kunnen dus nog niet zoeken, mailen of advertentiecijfers ophalen.",
    },
  ];

  const standupValue = (standup?.value ?? {}) as {
    time?: string;
    callPrepTime?: string;
    callTime?: string;
    timezone?: string;
    enabled?: boolean;
  };
  const alertsValue = (alerts?.value ?? {}) as { inApp?: boolean; telegram?: boolean; email?: boolean };
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Instellingen</h1>
        <p className="mt-1 text-sm text-text-muted">Koppelingen, overleg en meldingen.</p>
      </header>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Reader-koppelingen</h2>
          <p className="mt-1 text-sm text-text-muted">
            Een reader draait naast een OpenClaw-installatie en pusht status, activiteit en heartbeats
            hierheen. Al het verkeer is uitgaand, dus je hoeft geen poorten open te zetten.
          </p>
        </div>
        <InstanceManager
          instances={instances.map((instance) => ({
            id: instance.id,
            name: instance.name,
            publicId: instance.publicId,
            readerVersion: instance.readerVersion,
            alive: isRecent(instance.lastHeartbeatAt, 3 * 60_000),
            agentCount: instance._count.agents,
          }))}
          appUrl={appUrl}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Ochtendoverleg</h2>
        <div className="card p-4 text-sm">
          <div className="flex items-start justify-between gap-4">
            <dl className="space-y-2">
              <div>
                <dt className="text-xs text-text-faint">Briefing</dt>
                <dd>
                  <strong>{standupValue.time ?? "08:00"}</strong> — het team wordt uitgevraagd, jij kunt
                  het lezen zodra je wakker bent
                </dd>
              </div>
              <div>
                <dt className="text-xs text-text-faint">Voorbereiding call</dt>
                <dd>
                  <strong>{standupValue.callPrepTime ?? "09:45"}</strong> — wie nog niet reageerde krijgt
                  een herinnering
                </dd>
              </div>
              <div>
                <dt className="text-xs text-text-faint">Ochtendcall</dt>
                <dd>
                  <strong>{standupValue.callTime ?? "10:00"}</strong> — alles ligt klaar, jij loopt de
                  vragen af en spreekt je antwoorden in
                </dd>
              </div>
            </dl>
            <span className="chip">{standupValue.enabled === false ? "Uit" : "Aan"}</span>
          </div>
          <p className="mt-3 border-t border-border pt-3 text-xs text-text-faint">
            Tijdzone {standupValue.timezone ?? "Europe/Amsterdam"}. De cron vuurt op meerdere momenten en
            controleert zelf of het hier écht tijd is, zodat de zomertijd niets verschuift.
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Meldingen</h2>
        <div className="card divide-y divide-border text-sm">
          {[
            { label: "In het dashboard", value: alertsValue.inApp !== false },
            { label: "Via Telegram", value: alertsValue.telegram !== false },
            { label: "Via e-mail", value: alertsValue.email === true },
          ].map((row) => (
            <div key={row.label} className="flex items-center justify-between px-4 py-3">
              <span>{row.label}</span>
              <span className="chip">{row.value ? "Aan" : "Uit"}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Taalmodel</h2>
        <p className="text-sm text-text-muted">
          Waar de agents op denken. De sleutel wordt versleuteld opgeslagen en komt nooit terug naar
          dit scherm.
        </p>
        <AiSettings
          provider={aiConfig.provider}
          defaultModel={aiConfig.defaultModel}
          fastModel={aiConfig.fastModel}
          hasKey={Boolean(aiConfig.connected)}
        />
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Telegram — de lijn met je Head of Operations</h2>
          <p className="mt-1 text-sm text-text-muted">
            Hier komt het ochtendrapport, urgente problemen en verzoeken om akkoord. Het volledige
            overzicht blijft in het dashboard.
          </p>
        </div>
        <TelegramSettings
          hasToken={telegram.hasToken}
          botUsername={telegram.botUsername}
          chatId={telegram.chatId}
          ready={telegram.ready}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Budget en tarieven</h2>
        <FinanceSettings
          monthlyBudgetEur={finance.monthlyBudgetEur}
          usdToEur={finance.usdToEur}
          hourlyRateEur={finance.hourlyRateEur}
        />
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Bedrijfscontext</h2>
          <p className="mt-1 text-sm text-text-muted">
            Elke agent leest dit bij elke opdracht. Dit is de grootste knop aan de kwaliteit van wat ze
            teruggeven — en meteen de grootste knop aan je kosten.
          </p>
        </div>
        <ContextSettings context={companyContext} />
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Systeemstatus</h2>
          <p className="mt-1 text-sm text-text-muted">
            Wat er echt draait en wat er nog niet is. Geen demo-data verstopt in een mooi scherm.
          </p>
        </div>
        <SystemStatus items={statusItems} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Account</h2>
        <div className="card p-4 text-sm">
          <p>{user.name}</p>
          <p className="text-text-muted">{user.email}</p>
          <p className="mt-2 text-xs text-text-faint">Rol: {user.role === "owner" ? "eigenaar" : "teamlid"}</p>
        </div>
      </section>
    </div>
  );
}
