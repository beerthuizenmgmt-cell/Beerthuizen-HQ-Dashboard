import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { buildDossier } from "@/lib/ai/dossier";
import { AgentAvatar } from "@/components/agent-avatar";
import { StatusBadge } from "@/components/status-dot";
import { AgentMemoryPanel } from "@/components/agent-memory";
import { AgentPlaybook } from "@/components/agent-playbook";
import { timeAgo, formatEuro, formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

// Het personeelsdossier van één agent.
//
// Bewust geen instellingenscherm: dit is de plek waar je ziet wie iemand is en
// hoe hij ervoor staat, zoals je bij een medewerker zou doen. Wat je moet
// instellen staat een klik verderop.

const STATUS_LABELS: Record<string, string> = {
  inbox: "in de wachtrij",
  assigned: "toegewezen",
  in_progress: "bezig",
  blocked: "geblokkeerd",
  review: "ter beoordeling",
  done: "klaar",
  cancelled: "geannuleerd",
};

const KIND_LABELS: Record<string, string> = {
  besluit: "Besluit",
  voorkeur: "Voorkeur",
  afspraak: "Afspraak",
  leerpunt: "Leerpunt",
  context: "Context",
};

const STAND_STIJL: Record<string, string> = {
  goed: "text-success",
  aandacht: "text-warn",
  slecht: "text-danger",
  onbekend: "text-text-faint",
};

export default async function AgentDossierPage({ params }: PageProps<"/agents/[id]">) {
  const user = await requireUser();
  const { id } = await params;

  const agent = await db.agent.findUnique({ where: { id } });
  if (!agent) notFound();

  const dossier = await buildDossier(agent.id);
  const { charter } = dossier;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <Link href="/agents" className="text-xs text-text-muted hover:text-text">
          ← Het team
        </Link>

        <div className="mt-3 flex flex-wrap items-start gap-4">
          <AgentAvatar agent={agent} size="lg" />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold">{agent.name}</h1>
              {agent.isChief && <span className="chip border-accent/40 text-accent">Chief</span>}
              <StatusBadge status={agent.paused ? "paused" : agent.status} />
            </div>
            <p className="mt-1 text-sm text-text-muted">{agent.role}</p>
            {charter && <p className="mt-2 text-sm">{charter.missie}</p>}
          </div>

          <Link href={`/agents/${agent.id}/instellingen`} className="btn btn-ghost text-xs">
            Instellingen
          </Link>
        </div>
      </header>

      {!charter && (
        <section className="card border-warn/40 bg-warn/5 p-5">
          <h2 className="text-sm font-semibold text-warn">Nog niet ingericht als medewerker</h2>
          <p className="mt-2 text-sm text-text-muted">
            {agent.name} heeft nog geen functieprofiel: geen vastgelegde taken, KPI&apos;s, permissies of
            autonomieniveau. Hij kan wel al werken, maar je kunt hem nog niet beoordelen. Zie het{" "}
            <Link href="/opbouw" className="underline">
              opbouwoverzicht
            </Link>
            .
          </p>
        </section>
      )}

      {charter?.status === "voorstel" && (
        <section className="card border-warn/40 bg-warn/5 p-5">
          <h2 className="text-sm font-semibold text-warn">Voorstel — wacht op jouw akkoord</h2>
          <p className="mt-2 text-sm text-text-muted">
            Alles hieronder is uitgewerkt maar nog niet van kracht. {agent.name} krijgt dit profiel niet
            mee in zijn denkwerk en gedraagt zich dus nog precies zoals eerst. Lees het door, geef aan wat
            je anders wilt, en bij akkoord zet ik het aan.
          </p>
        </section>
      )}

      {/* Wat heeft hij vandaag gedaan */}
      <section className="card p-5">
        <h2 className="text-sm font-semibold">Vandaag</h2>
        <p className="mt-1 text-xs text-text-muted">
          {dossier.vandaag.runs === 0
            ? "Nog geen denkbeurt vandaag."
            : `${dossier.vandaag.runs} denkbeurt${dossier.vandaag.runs === 1 ? "" : "en"} · ${formatEuro(dossier.kosten.vandaagEur)}`}
          {agent.lastActiveAt && ` · laatst actief ${timeAgo(agent.lastActiveAt)}`}
        </p>

        {dossier.vandaag.activiteit.length > 0 && (
          <ul className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
            {dossier.vandaag.activiteit.map((event, index) => (
              <li key={index} className="flex gap-3">
                <span className="shrink-0 text-xs text-text-faint">
                  {event.occurredAt.toISOString().slice(11, 16)}
                </span>
                <span className={event.level === "error" ? "text-danger" : ""}>{event.message}</span>
              </li>
            ))}
          </ul>
        )}

        {dossier.vandaag.taken.length > 0 && (
          <div className="mt-4 border-t border-border pt-4">
            <p className="eyebrow mb-2">Taken die bewogen</p>
            <ul className="space-y-1 text-sm">
              {dossier.vandaag.taken.map((task, index) => (
                <li key={index}>
                  {task.titel}{" "}
                  <span className="text-xs text-text-faint">— {STATUS_LABELS[task.status] ?? task.status}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Waar wacht hij op */}
      <section className="card p-5">
        <h2 className="text-sm font-semibold">Waar hij op wacht</h2>
        {dossier.wachtOp.length === 0 ? (
          <p className="mt-2 text-sm text-text-muted">Nergens op — hij kan door.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {dossier.wachtOp.map((item, index) => (
              <li key={index} className="flex flex-wrap items-baseline justify-between gap-2">
                <span>{item.omschrijving}</span>
                <span className="text-xs text-text-faint">{timeAgo(item.sinds)}</span>
              </li>
            ))}
          </ul>
        )}

        {dossier.openGoedkeuringen.length > 0 && (
          <Link href="/goedkeuringen" className="btn btn-primary mt-4 text-xs">
            {dossier.openGoedkeuringen.length} beslissing
            {dossier.openGoedkeuringen.length === 1 ? "" : "en"} van jou nodig
          </Link>
        )}
      </section>

      {/* Kosten */}
      <section className="card p-5">
        <h2 className="text-sm font-semibold">Wat hij kost</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xl font-semibold">{formatEuro(dossier.kosten.vandaagEur)}</p>
            <p className="text-xs text-text-muted">vandaag</p>
          </div>
          <div>
            <p className="text-xl font-semibold">{formatEuro(dossier.kosten.maandEur)}</p>
            <p className="text-xs text-text-muted">deze maand</p>
          </div>
          <div>
            <p className="text-xl font-semibold">{formatEuro(dossier.kosten.totaalEur)}</p>
            <p className="text-xs text-text-muted">sinds het begin</p>
          </div>
        </div>
        {dossier.kosten.onbekendeRuns > 0 && (
          <p className="mt-3 border-t border-border pt-3 text-xs text-text-muted">
            {dossier.kosten.onbekendeRuns} denkbeurt{dossier.kosten.onbekendeRuns === 1 ? "" : "en"} zonder
            bekend tarief. Die tellen bewust niet mee — liever een gat dan een gok.
          </p>
        )}
      </section>

      {charter && (
        <>
          {/* Taken en verantwoordelijkheden */}
          <section className="card p-5">
            <h2 className="text-sm font-semibold">Waar hij voor staat</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {charter.verantwoordelijkheden.map((item, index) => (
                <li key={index} className="flex gap-2">
                  <span className="text-accent">·</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* Ritme */}
          <section className="card p-5">
            <h2 className="text-sm font-semibold">Zijn ritme</h2>

            <div className="mt-4 space-y-4">
              <div>
                <p className="eyebrow mb-2">Elke werkdag</p>
                <ul className="space-y-1 text-sm">
                  {charter.ritme.dagelijks.map((item, index) => (
                    <li key={index}>
                      <span className="text-text-faint">{item.wanneer}</span> — {item.wat}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <p className="eyebrow mb-2">Wekelijks</p>
                <ul className="space-y-1 text-sm">
                  {charter.ritme.wekelijks.map((item, index) => (
                    <li key={index}>
                      <span className="text-text-faint">{item.wanneer}</span> — {item.wat}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <p className="eyebrow mb-2">Als er iets gebeurt</p>
                <p className="mb-2 text-xs text-text-muted">
                  Alleen bij een echte wijziging. Verandert er niets, dan draait er niets en kost het niets.
                </p>
                <ul className="space-y-1 text-sm">
                  {charter.ritme.eventDriven.map((item, index) => (
                    <li key={index}>
                      {item.signaal} → {item.wat}{" "}
                      <span className="text-xs text-text-faint">
                        (hoogstens elke {item.minIntervalMinuten} min)
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          {/* KPI's */}
          <section className="card p-5">
            <h2 className="text-sm font-semibold">Hoe hij het doet</h2>
            <p className="mt-1 text-xs text-text-muted">
              Berekend uit wat er echt is gebeurd. Staat er &ldquo;nog geen data&rdquo;, dan is er niets te
              meten — er wordt niets geschat.
            </p>

            <div className="mt-4 divide-y divide-border">
              {dossier.kpis.map((kpi) => (
                <div key={kpi.key} className="flex flex-wrap items-baseline justify-between gap-2 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{kpi.label}</p>
                    <p className="text-xs text-text-muted">{kpi.uitleg}</p>
                    <p className="mt-1 text-xs text-text-faint">{kpi.onderbouwing}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-semibold ${STAND_STIJL[kpi.stand]}`}>
                      {kpi.waarde ?? "nog geen data"}
                    </p>
                    <p className="text-xs text-text-faint">norm: {kpi.norm}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Autonomie en permissies */}
          <section className="card p-5">
            <h2 className="text-sm font-semibold">Wat hij mag</h2>

            {dossier.autonomie && (
              <div className="mt-3 rounded-lg border border-border bg-bg-elevated p-4">
                <p className="text-sm font-medium">
                  Autonomieniveau {dossier.autonomie.niveau} — {dossier.autonomie.label}
                </p>
                <p className="mt-1 text-xs text-text-muted">{dossier.autonomie.uitleg}</p>
              </div>
            )}

            <div className="mt-4 grid gap-5 sm:grid-cols-2">
              <div>
                <p className="eyebrow mb-2 text-success">Zelfstandig</p>
                <ul className="space-y-1 text-sm">
                  {charter.permissies.mag.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="eyebrow mb-2 text-danger">Nooit</p>
                <ul className="space-y-1 text-sm">
                  {charter.permissies.magNiet.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="mt-5 border-t border-border pt-4">
              <p className="eyebrow mb-2 text-warn">Voorbereiden, dan jouw akkoord</p>
              <ul className="space-y-1 text-sm">
                {charter.permissies.altijdAkkoord.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </div>
          </section>

          {/* Communicatielijnen */}
          <section className="card p-5">
            <h2 className="text-sm font-semibold">Met wie hij schakelt</h2>
            <ul className="mt-3 divide-y divide-border text-sm">
              {dossier.lijnen.map((lijn, index) => (
                <li key={index} className="py-2">
                  <span className="font-medium">{lijn.naam}</span>
                  {!lijn.bestaat && (
                    <span className="ml-2 text-xs text-danger">bestaat niet meer</span>
                  )}
                  <span className="ml-2 text-text-muted">{lijn.waarover}</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      {/* Werkinstructies */}
      <section className="card p-5">
        <h2 className="text-sm font-semibold">Werkinstructies</h2>
        <p className="mt-1 mb-4 text-xs text-text-muted">
          Hoe {agent.name} zijn werk doet — de handleiding bij de functie. Het functieprofiel hierboven
          zegt waar hij over gaat; dit zegt hoe. Gaat integraal mee in elke denkbeurt.
        </p>
        <AgentPlaybook
          agentId={agent.id}
          agentName={agent.name}
          playbook={agent.playbook}
          canEdit={user.role === "owner"}
        />
      </section>

      {/* Gereedschap */}
      <section className="card p-5">
        <h2 className="text-sm font-semibold">Welke systemen hij gebruikt</h2>
        <ul className="mt-3 divide-y divide-border text-sm">
          {dossier.gereedschap.map((tool) => (
            <li key={tool.toolKey} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                {tool.naam}
                {tool.permissie && (
                  <span className="ml-2 chip text-xs">mag {tool.permissie}</span>
                )}
                {tool.laatstGebruikt && (
                  <span className="ml-2 text-xs text-text-faint">
                    laatst gebruikt {timeAgo(tool.laatstGebruikt)}
                  </span>
                )}
              </span>
              <span className="text-xs">
                {tool.ingebouwd ? (
                  <span className="text-success">ingebouwd</span>
                ) : !tool.werkend ? (
                  <span className="text-text-faint">nog niet gebouwd</span>
                ) : !tool.gekoppeld ? (
                  <span className="text-warn">nog niet gekoppeld</span>
                ) : tool.fout ? (
                  <span className="text-danger">fout: {tool.fout}</span>
                ) : tool.ingeschakeld ? (
                  <span className="text-success">gekoppeld</span>
                ) : (
                  <span className="text-text-faint">uitgeschakeld</span>
                )}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 border-t border-border pt-3 text-xs text-text-muted">
          Een koppeling hier geldt alleen voor {agent.name}. De rest van het team krijgt hem niet
          automatisch.{" "}
          {user.role === "owner" && (
            <Link href="/tools" className="underline">
              Koppelen en rechten instellen
            </Link>
          )}
        </p>
      </section>

      {/* Geheugen */}
      <section className="card p-5">
        <h2 className="text-sm font-semibold">Wat hij onthoudt</h2>
        <p className="mt-1 text-xs text-text-muted">
          Gaat mee in elke denkbeurt. Hij legt zelf dingen vast, en jij kunt hem iets meegeven.
        </p>

        {charter && (
          <details className="mt-3 text-xs text-text-muted">
            <summary className="cursor-pointer">Wat hoort hier wel en niet in?</summary>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <div>
                <p className="eyebrow mb-1">Wel</p>
                <ul className="space-y-1">
                  {charter.geheugen.watOnthouden.map((item, index) => (
                    <li key={index}>· {item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="eyebrow mb-1">Niet</p>
                <ul className="space-y-1">
                  {charter.geheugen.watNiet.map((item, index) => (
                    <li key={index}>· {item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </details>
        )}

        <div className="mt-4">
          <AgentMemoryPanel
            agentId={agent.id}
            agentName={agent.name}
            canEdit={user.role === "owner"}
            memories={dossier.geheugen.map((memory) => ({
              id: memory.id,
              kind: KIND_LABELS[memory.kind] ?? memory.kind,
              title: memory.title,
              body: memory.body,
              source: memory.source,
              pinned: memory.pinned,
              createdAt: formatDateTime(memory.createdAt),
              lastUsed: memory.lastUsedAt ? timeAgo(memory.lastUsedAt) : null,
            }))}
          />
        </div>
      </section>
    </div>
  );
}
