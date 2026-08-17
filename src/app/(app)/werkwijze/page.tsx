import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { AgentAvatar } from "@/components/agent-avatar";
import {
  EIGENDOM,
  ROUTES,
  PRIORITEITEN,
  SAMENWERKINGSREGELS,
  type StapRol,
} from "@/lib/ai/werkafspraken";

export const dynamic = "force-dynamic";

// Hoe het werk loopt.
//
// Dit scherm bestaat zodat je kunt controleren wat de agents daadwerkelijk
// meekrijgen. Alles wat hier staat zit ook in hun systeemprompt — er is geen
// verschil tussen wat er op papier staat en waar ze op sturen.

const ROL_STIJL: Record<StapRol, string> = {
  eigenaar: "border-accent/50 text-accent",
  ondersteunt: "text-text-muted",
  controleert: "border-warn/40 text-warn",
  beslist: "border-danger/40 text-danger",
};

const ROL_LABEL: Record<StapRol, string> = {
  eigenaar: "eigenaar",
  ondersteunt: "ondersteunt",
  controleert: "controleert",
  beslist: "beslist",
};

export default async function WerkwijzePagina() {
  await requireUser();

  const agents = await db.agent.findMany({
    where: { adapterType: { not: "reader_ingest" } },
    select: { id: true, key: true, name: true, emoji: true, color: true, avatarUrl: true, role: true },
  });

  const zoek = (key: string) => agents.find((a) => a.key === key);
  const naam = (key: string) => (key === "enriqueo" ? "Enriqueo" : (zoek(key)?.name ?? key));

  return (
    <div className="mx-auto max-w-4xl space-y-10">
      <header>
        <h1 className="text-2xl font-semibold">Hoe het werk loopt</h1>
        <p className="mt-2 max-w-2xl text-sm text-text-muted">
          Iedere opdracht heeft één eigenaar, eventueel ondersteunende collega&apos;s, één overdracht
          naar de volgende stap, en één moment waarop jij nodig bent. Wat hier staat krijgen de agents
          ook echt mee bij elke denkbeurt — er is geen verschil tussen dit scherm en waar ze op sturen.
        </p>
      </header>

      {/* ── Wie is waar eigenaar van ─────────────────────────────────── */}
      <section>
        <h2 className="eyebrow-rule start mb-3">Wie is waar eigenaar van</h2>
        <div className="card divide-y divide-border">
          {EIGENDOM.map((eigendom) => {
            const agent = zoek(eigendom.agentKey);
            return (
              <div key={eigendom.agentKey} className="p-4">
                <div className="flex items-center gap-3">
                  {agent && <AgentAvatar agent={agent} size="sm" />}
                  <div className="min-w-0">
                    {agent ? (
                      <Link href={`/agents/${agent.id}`} className="font-medium hover:underline">
                        {agent.name}
                      </Link>
                    ) : (
                      <span className="font-medium">{eigendom.agentKey}</span>
                    )}
                    <p className="text-sm text-text-muted">{eigendom.eigenaarVan}</p>
                  </div>
                </div>

                <dl className="mt-3 grid gap-x-8 gap-y-3 pl-11 text-xs sm:grid-cols-2">
                  {eigendom.krijgtVan.length > 0 && (
                    <div>
                      <dt className="eyebrow mb-1">Krijgt van</dt>
                      <dd className="space-y-0.5 text-text-muted">
                        {eigendom.krijgtVan.map((bron) => (
                          <p key={bron.agentKey}>
                            <span className="text-text">{naam(bron.agentKey)}</span> — {bron.wat}
                          </p>
                        ))}
                      </dd>
                    </div>
                  )}
                  {eigendom.levertAan.length > 0 && (
                    <div>
                      <dt className="eyebrow mb-1">Levert aan</dt>
                      <dd className="space-y-0.5 text-text-muted">
                        {eigendom.levertAan.map((doel) => (
                          <p key={doel.agentKey}>
                            <span className="text-text">{naam(doel.agentKey)}</span> — {doel.wat}
                          </p>
                        ))}
                      </dd>
                    </div>
                  )}
                  {eigendom.ondersteuntBij.length > 0 && (
                    <div className="sm:col-span-2">
                      <dt className="eyebrow mb-1">Ondersteunt, zonder over te nemen</dt>
                      <dd className="text-text-muted">
                        {eigendom.ondersteuntBij
                          .map((hulp) => `${naam(hulp.agentKey)} (${hulp.waarmee})`)
                          .join(" · ")}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── De routes ────────────────────────────────────────────────── */}
      <section>
        <h2 className="eyebrow-rule start mb-3">De routes</h2>
        <p className="mb-4 text-sm text-text-muted">
          Niet elke route loopt langs iedereen. {naam("chief")} bepaalt per opdracht wie er
          daadwerkelijk nodig is; stappen met &ldquo;alleen als het nodig is&rdquo; slaat hij over
          wanneer ze niets toevoegen.
        </p>

        <div className="space-y-4">
          {ROUTES.map((route) => (
            <article key={route.key} className="card p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-medium">{route.naam}</h3>
                <span className="chip text-xs border-accent/50 text-accent">
                  eigenaar: {naam(route.eigenaar)}
                </span>
              </div>
              <p className="mt-1 text-xs text-text-muted">{route.wanneer}</p>

              <ol className="mt-4 space-y-1.5">
                {route.stappen.map((stap, index) => (
                  <li key={index} className="flex flex-wrap items-baseline gap-2 text-sm">
                    <span className="w-5 shrink-0 text-xs text-text-faint">{index + 1}</span>
                    <span className="w-20 shrink-0 font-medium">{naam(stap.wie)}</span>
                    <span className={`chip shrink-0 text-xs ${ROL_STIJL[stap.rol]}`}>
                      {ROL_LABEL[stap.rol]}
                    </span>
                    <span className="min-w-0 flex-1 text-text-muted">
                      {stap.wat}
                      {stap.optioneel && (
                        <span className="text-text-faint"> — alleen als het nodig is</span>
                      )}
                    </span>
                  </li>
                ))}
              </ol>

              <div className="mt-4 grid gap-3 border-t border-border pt-3 text-xs sm:grid-cols-2">
                <div>
                  <p className="eyebrow mb-1">Jij bent nodig bij</p>
                  <p className="text-text-muted">{route.enriqueoMoment}</p>
                </div>
                <div>
                  <p className="eyebrow mb-1">Wat er aan het eind ligt</p>
                  <p className="text-text-muted">{route.levert}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* ── Prioriteiten en regels ───────────────────────────────────── */}
      <section className="grid gap-4 sm:grid-cols-2">
        <div className="card p-5">
          <h2 className="eyebrow-rule start mb-3">Prioriteiten</h2>
          <ul className="space-y-2 text-sm">
            {PRIORITEITEN.map((p) => (
              <li key={p.code} className="flex gap-2">
                <span className="shrink-0">{p.kleur}</span>
                <span>
                  <span className="font-medium">{p.code}</span>{" "}
                  <span className="text-text-muted">{p.wat}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="card p-5">
          <h2 className="eyebrow-rule start mb-3">Vaste regels</h2>
          <ul className="space-y-1.5 text-sm text-text-muted">
            {SAMENWERKINGSREGELS.map((regel) => (
              <li key={regel}>· {regel}</li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
