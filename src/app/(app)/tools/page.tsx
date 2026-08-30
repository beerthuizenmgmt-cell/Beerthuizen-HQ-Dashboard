import Link from "next/link";
import { requireOwner } from "@/lib/access";
import { db } from "@/lib/db";
import { alleIntegraties, maandtotaal, PERMISSION_LABELS } from "@/lib/ai/integrations";
import { CATEGORIE_LABELS, type ToolCategory } from "@/lib/ai/toolkit";
import { ToolRow } from "@/components/tool-row";
import { formatEuro, timeAgo } from "@/lib/format";
import { TOOL_CATALOG } from "@/lib/ai/toolkit";

export const dynamic = "force-dynamic";

// De toolstack: welke platformen er zijn, wie erbij mag en wat ze kosten.
//
// Bewust één pagina met alles erop in plaats van een lijst met doorklikken.
// De vraag die je hier stelt is meestal "wie mag wat" — en dat wil je in één
// oogopslag zien, niet na acht klikken.

const VOLGORDE: ToolCategory[] = [
  "creatief",
  "content",
  "onderzoek",
  "monitoring",
  "data",
  "sales",
  "financieel",
  "automatisering",
  "communicatie",
  "overig",
];

/// Welke instelvelden een koppeling heeft. Uit de catalogus, want dat is waar
/// ze gedefinieerd staan — de waarden zelf komen nooit naar de browser.
const TOOL_VELDEN: Record<string, { name: string; label: string; type: string; required?: boolean; secret?: boolean; placeholder?: string }[]> =
  Object.fromEntries(TOOL_CATALOG.map((t) => [t.key, t.fields ?? []]));

export default async function ToolsPage() {
  await requireOwner();

  const [rijen, agents] = await Promise.all([
    alleIntegraties(),
    db.agent.findMany({
      where: { adapterType: "builtin" },
      orderBy: [{ isChief: "desc" }, { sortOrder: "asc" }],
      select: { id: true, name: true, emoji: true },
    }),
  ]);

  const kosten = maandtotaal(rijen);
  const gebouwd = rijen.filter((rij) => rij.gebouwd).length;
  const inGebruik = rijen.filter((rij) => rij.agents.length > 0).length;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Tools &amp; koppelingen</h1>
        <p className="mt-2 max-w-3xl text-sm text-text-muted">
          Elke agent heeft zijn eigen gereedschapskist. Een tool die aan Jesse hangt, is daarmee niet
          beschikbaar voor de rest — en per koppeling bepaal je of hij mag lezen, iets mag voorstellen of
          zelfstandig mag wijzigen.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-4">
        <div className="card p-4">
          <p className="text-2xl font-semibold">{rijen.length}</p>
          <p className="text-xs text-text-muted">tools in de catalogus</p>
        </div>
        <div className="card p-4">
          <p className="text-2xl font-semibold text-success">{gebouwd}</p>
          <p className="text-xs text-text-muted">werkend aangesloten</p>
        </div>
        <div className="card p-4">
          <p className="text-2xl font-semibold">{inGebruik}</p>
          <p className="text-xs text-text-muted">toegewezen aan een agent</p>
        </div>
        <div className="card p-4">
          <p className="text-2xl font-semibold">{formatEuro(kosten.bekend)}</p>
          <p className="text-xs text-text-muted">
            per maand bekend
            {kosten.onbekendAantal > 0 && ` · ${kosten.onbekendAantal} zonder bedrag`}
          </p>
        </div>
      </div>

      <section className="card border-warn/40 bg-warn/5 p-5">
        <h2 className="text-sm font-semibold text-warn">Wat &ldquo;nog niet gebouwd&rdquo; betekent</h2>
        <p className="mt-2 text-sm text-text-muted">
          Van deze lijst zijn er {gebouwd} echt aangesloten. De rest staat vastgelegd — met categorie,
          rechten en kosten — maar heeft nog geen werkende verbinding. Je kunt ze toewijzen en instellen;
          de agent krijgt ze pas in handen zodra de koppeling gebouwd is. Zo zie je wat er nog moet in
          plaats van een knop die niets doet.
        </p>
      </section>

      {VOLGORDE.map((categorie) => {
        const groep = rijen.filter((rij) => rij.categorie === categorie);
        if (groep.length === 0) return null;

        return (
          <section key={categorie}>
            <h2 className="eyebrow mb-3">{CATEGORIE_LABELS[categorie]}</h2>
            <div className="card lijst">
              {groep.map((rij) => (
                <ToolRow
                  key={rij.toolKey}
                  tool={{
                    toolKey: rij.toolKey,
                    naam: rij.naam,
                    omschrijving: rij.omschrijving,
                    gebouwd: rij.gebouwd,
                    actief: rij.actief,
                    verbinding: rij.verbinding,
                    apiStatus: rij.apiStatus,
                    maandkosten: rij.maandkostenEur === null ? null : formatEuro(rij.maandkostenEur),
                    maandkostenRuw: rij.maandkostenEur,
                    notities: rij.notities,
                    laatstGebruikt: rij.laatstGebruikt ? timeAgo(rij.laatstGebruikt) : null,
                    laatsteTest: rij.laatsteTest
                      ? { wanneer: timeAgo(rij.laatsteTest.at), ok: rij.laatsteTest.ok }
                      : null,
                    ontbreekt: rij.gevraagdMaarNietGekoppeld,
                    agents: rij.agents.map((a) => ({
                      agentId: a.agentId,
                      naam: a.naam,
                      permission: a.permission,
                      ingeschakeld: a.ingeschakeld,
                      fout: a.fout,
                      laatstGebruikt: a.laatstGebruikt ? timeAgo(a.laatstGebruikt) : null,
                      gebruikAantal: a.gebruikAantal,
                      ingevuld: a.ingevuld,
                      ontbreekt: a.ontbreekt,
                    })),
                    velden: TOOL_VELDEN[rij.toolKey] ?? [],
                    bureauIngevuld: rij.bureauIngevuld,
                    bureauOntbreekt: rij.bureauOntbreekt,
                  }}
                  alleAgents={agents.map((a) => ({
                    id: a.id,
                    naam: `${a.emoji ?? ""} ${a.name}`.trim(),
                  }))}
                  permissieLabels={PERMISSION_LABELS}
                />
              ))}
            </div>
          </section>
        );
      })}

      <section className="card p-5">
        <h2 className="text-sm font-semibold">Per agent kijken</h2>
        <p className="mt-2 text-sm text-text-muted">
          Wil je het andersom zien — welke tools heeft één agent — open dan zijn dossier. Daar staat zijn
          gereedschapskist naast zijn taken, rechten en kosten.
        </p>
        <Link href="/agents" className="btn btn-ghost mt-3 text-xs">
          Naar het team
        </Link>
      </section>
    </div>
  );
}
