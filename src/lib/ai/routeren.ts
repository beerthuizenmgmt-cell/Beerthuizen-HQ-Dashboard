import "server-only";

import { db } from "@/lib/db";
import { EIGENDOM } from "./werkafspraken";
import { chat } from "./provider";

// Wie pakt dit op?
//
// In een teamkanaal kon je alleen iemand bereiken door hem te taggen. Zei je
// gewoon iets — "de facturen van Noorderlicht staan nog open" — dan kwam dat bij
// niemand terecht en bleef het onbeantwoord staan. In een echt kantoor werkt dat
// ook niet zo: je zegt iets in de groep en degene die erover gaat, reageert.
//
// De eigendomslijst uit werkafspraken.ts zegt precies waar iedereen van is.
// Daarmee laten we het model één korte keuze maken: wie hoort hier op te
// reageren. Geen gereedschap, een piepkleine prompt — dat kost een seconde en
// een fractie van een cent.

/// Waar iedereen van is, als lijstje voor de keuze.
function eigendomsregels(namen: Record<string, string>): string {
  return EIGENDOM.map((e) => `${e.agentKey} (${namen[e.agentKey] ?? e.agentKey}): ${e.eigenaarVan}`).join("\n");
}

/// Kiest de agent die over dit bericht gaat. Bij twijfel de Head of Operations:
/// die coördineert en kan het alsnog bij de juiste collega neerleggen.
export async function kiesAgentVoor(bericht: string): Promise<string | null> {
  const agents = await db.agent.findMany({
    where: { paused: false, adapterType: { not: "reader_ingest" } },
    select: { id: true, key: true, name: true, isChief: true },
  });
  if (agents.length === 0) return null;

  const chief = agents.find((a) => a.isChief) ?? agents[0];
  const perKey = new Map(agents.map((a) => [a.key, a]));
  const namen = Object.fromEntries(agents.map((a) => [a.key, a.name]));

  try {
    const antwoord = await chat({
      messages: [
        {
          role: "system",
          content: [
            `Je verdeelt binnenkomende berichten over een team. Wie gaat hierover?`,
            ``,
            eigendomsregels(namen),
            ``,
            `Antwoord met precies één sleutel uit de lijst hierboven en niets anders.`,
            `Gaat het over meerdere dingen, of weet je het niet zeker, antwoord dan "${chief.key}" —`,
            `die coördineert en legt het zo nodig bij de juiste collega neer.`,
          ].join("\n"),
        },
        { role: "user", content: bericht.slice(0, 1500) },
      ],
      temperature: 0,
      maxTokens: 12,
      timeoutMs: 15_000,
    });

    const gekozen = (antwoord.text ?? "").trim().toLowerCase().replace(/[^a-z]/g, "");
    const agent = perKey.get(gekozen);
    return (agent ?? chief).id;
  } catch {
    // Kiezen mag nooit betekenen dat er niemand antwoordt. Lukt het niet, dan
    // gaat het naar de Head of Operations — precies wat er in een kantoor ook
    // gebeurt als niet meteen duidelijk is van wie iets is.
    return chief.id;
  }
}
