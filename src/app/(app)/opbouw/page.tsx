import Link from "next/link";
import { db } from "@/lib/db";
import { requireOwner } from "@/lib/access";
import { CHARTERS, AUTONOMY_LABELS } from "@/lib/ai/charters";
import { GEEN_MEDEWERKER } from "@/lib/ai/charters-voorstellen";
import { getToolEntry } from "@/lib/ai/toolkit";
import { AgentAvatar } from "@/components/agent-avatar";

export const dynamic = "force-dynamic";

// Het opbouwoverzicht: hoe ver elke agent is op weg naar volwaardig medewerker.
//
// Eén tabel waarin je per agent ziet wat er staat en wat er nog moet. Bedoeld
// om agent voor agent af te vinken, niet om alles tegelijk aan te zetten.

const STATUS_STIJL: Record<string, string> = {
  actief: "text-success",
  voorstel: "text-warn",
  geen: "text-text-faint",
};

export default async function OpbouwPage() {
  await requireOwner();

  const agents = await db.agent.findMany({
    orderBy: [{ isChief: "desc" }, { sortOrder: "asc" }],
  });

  const gekoppeldeTools = await db.agentTool.findMany({
    where: { enabled: true },
    select: { agentId: true, toolKey: true },
  });

  const rijen = agents.map((agent) => {
    const charter = CHARTERS.find((item) => item.agentKey === agent.key) ?? null;
    const isKoppeling = GEEN_MEDEWERKER.includes(agent.key);
    const gekoppeld = gekoppeldeTools.filter((tool) => tool.agentId === agent.id).map((t) => t.toolKey);
    const gevraagd = charter?.gereedschap ?? [];

    return {
      agent,
      charter,
      isKoppeling,
      gekoppeld,
      gevraagd,
      ontbrekend: gevraagd.filter((key) => !gekoppeld.includes(key)),
      nietGebouwd: gevraagd.filter((key) => !getToolEntry(key)?.implemented),
    };
  });

  const actief = rijen.filter((rij) => rij.charter?.status === "actief").length;
  const voorstel = rijen.filter((rij) => rij.charter?.status === "voorstel").length;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Opbouw van het team</h1>
        <p className="mt-2 max-w-2xl text-sm text-text-muted">
          Elke agent wordt één voor één ingericht als digitale medewerker: functie, taken, tools,
          permissies, KPI&apos;s en geheugen. Een profiel telt pas als actief wanneer jij akkoord hebt
          gegeven — tot die tijd staat het als voorstel klaar en verandert er niets aan zijn gedrag.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-2xl font-semibold text-success">{actief}</p>
          <p className="text-xs text-text-muted">volledig ingericht</p>
        </div>
        <div className="card p-4">
          <p className="text-2xl font-semibold text-warn">{voorstel}</p>
          <p className="text-xs text-text-muted">voorstel klaar, wacht op jou</p>
        </div>
        <div className="card p-4">
          <p className="text-2xl font-semibold">{agents.length}</p>
          <p className="text-xs text-text-muted">agents in totaal</p>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[52rem] text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="px-4 py-3 font-medium">Agent</th>
              <th className="px-4 py-3 font-medium">Configuratie</th>
              <th className="px-4 py-3 font-medium">Tools</th>
              <th className="px-4 py-3 font-medium">Permissies</th>
              <th className="px-4 py-3 font-medium">Tests</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="lijst-tabel">
            {rijen.map((rij) => (
              <tr key={rij.agent.id}>
                <td className="px-4 py-3">
                  <Link href={`/agents/${rij.agent.id}`} className="flex items-center gap-3 hover:underline">
                    <AgentAvatar agent={rij.agent} size="sm" />
                    <span>
                      <span className="block font-medium">{rij.agent.name}</span>
                      <span className="block text-xs text-text-faint">{rij.agent.role}</span>
                    </span>
                  </Link>
                </td>

                <td className="px-4 py-3 text-xs">
                  {rij.isKoppeling ? (
                    <span className="text-text-faint">koppeling, geen medewerker</span>
                  ) : rij.charter ? (
                    <span>
                      {rij.charter.verantwoordelijkheden.length} verantwoordelijkheden ·{" "}
                      {rij.charter.kpis.length} KPI&apos;s ·{" "}
                      {rij.charter.ritme.eventDriven.length} signalen
                    </span>
                  ) : (
                    <span className="text-text-faint">nog niets</span>
                  )}
                </td>

                <td className="px-4 py-3 text-xs">
                  {rij.isKoppeling ? (
                    <span className="text-text-faint">—</span>
                  ) : rij.gevraagd.length === 0 ? (
                    <span className="text-success">alleen ingebouwd</span>
                  ) : (
                    <span>
                      {rij.gekoppeld.length}/{rij.gevraagd.length} gekoppeld
                      {rij.nietGebouwd.length > 0 && (
                        <span className="block text-text-faint">
                          {rij.nietGebouwd.length} nog te bouwen
                        </span>
                      )}
                    </span>
                  )}
                </td>

                <td className="px-4 py-3 text-xs">
                  {rij.charter ? (
                    <span>
                      niveau {rij.charter.autonomie} —{" "}
                      {AUTONOMY_LABELS[rij.charter.autonomie].label.toLowerCase()}
                      <span className="block text-text-faint">
                        {rij.charter.permissies.altijdAkkoord.length} acties met jouw akkoord
                      </span>
                    </span>
                  ) : (
                    <span className="text-text-faint">—</span>
                  )}
                </td>

                <td className="px-4 py-3 text-xs">
                  {rij.charter?.status === "actief" ? (
                    <Link href="/proefdraaien" className="underline">
                      proefdraaien
                    </Link>
                  ) : (
                    <span className="text-text-faint">na akkoord</span>
                  )}
                </td>

                <td className="px-4 py-3 text-xs">
                  <span
                    className={
                      STATUS_STIJL[rij.isKoppeling ? "geen" : (rij.charter?.status ?? "geen")]
                    }
                  >
                    {rij.isKoppeling
                      ? "n.v.t."
                      : rij.charter?.status === "actief"
                        ? "🟢 ingericht"
                        : rij.charter
                          ? "🟡 wacht op jou"
                          : "⚪ nog niets"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="card p-5">
        <h2 className="text-sm font-semibold">Hoe je een voorstel goedkeurt</h2>
        <p className="mt-2 text-sm text-text-muted">
          Open het dossier van de agent, lees het profiel door, en laat me weten wat je wilt wijzigen. Bij
          akkoord zet ik zijn profiel op actief — dan pas gaat het mee in zijn denkwerk. Daarna volgt de
          proefrun: één realistische opdracht, alleen denken, zonder dat er iets naar buiten gaat.
        </p>
      </section>
    </div>
  );
}
