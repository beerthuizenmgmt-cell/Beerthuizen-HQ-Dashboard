import "server-only";

import { db } from "./db";

// Wat het team uit een gesprek haalt.
//
// Dit is waar het om gaat: jij praat met een klant, en daarna weet iedereen wat
// er speelt zonder dat jij het negen keer uitlegt.
//
// De Head of Operations pluist het uit, want hij verdeelt daarna ook het werk.
// Hij krijgt de opdracht om vier dingen te scheiden: wat de klant verwacht, wat
// er is afgesproken, wat er moet gebeuren, en — het belangrijkste — wat er níét
// besproken is maar wel had gemoeten. Dat laatste is wat je bij het volgende
// gesprek nodig hebt.

export async function verwerkGesprek(gesprekId: string): Promise<void> {
  const gesprek = await db.klantgesprek.findUnique({ where: { id: gesprekId } });
  if (!gesprek || gesprek.status === "verwerkt") return;

  const chief = await db.agent.findFirst({ where: { isChief: true } });
  if (!chief) throw new Error("Geen Head of Operations om dit uit te pluizen.");

  const { runAgent } = await import("./ai/run");
  const { BRIEFINGVELDEN } = await import("./ai/briefing");

  const uitkomst = await runAgent({
    agentId: chief.id,
    trigger: "gesprek",
    reason: "klantgesprek uitpluizen",
    input: [
      `Enriqueo heeft een klantgesprek gevoerd. Dit is de uitgeschreven versie.`,
      `Hij zat erbij, jij niet — dus alles wat je hieronder leest is wat er gezegd is,`,
      `en wat er niet staat is niet besproken.`,
      ``,
      `--- begin gesprek ---`,
      gesprek.ruweTekst.slice(0, 40_000),
      `--- eind gesprek ---`,
      ``,
      `Doe het volgende, in deze volgorde:`,
      ``,
      `1. Bepaal om welk bedrijf het gaat en leg dat vast met leg_gespreksverslag_vast.`,
      `   Staat de naam er niet in, gebruik dan wat je wél hebt — "het restaurant uit`,
      `   Utrecht" is bruikbaarder dan "onbekend".`,
      ``,
      `2. Scheid in dat verslag vier dingen:`,
      `   - wat de klant verwacht, in zijn eigen woorden waar dat kan`,
      `   - wat er is afgesproken, per punt`,
      `   - wat er moet gebeuren en door wie`,
      `   - wat er niet besproken is maar wel had gemoeten`,
      ``,
      `   Dat laatste toets je aan wat een campagne nodig heeft:`,
      BRIEFINGVELDEN.map((v) => `   ${v.sleutel}: ${v.vraag}`).join("\n"),
      ``,
      `3. Zet het werk uit. Elk vervolgpunt dat een collega kan oppakken maak je een`,
      `   taak met een deadline als die genoemd is. Noem in de taak waar het vandaan`,
      `   komt, zodat degene die hem oppakt het gesprek kan teruglezen.`,
      ``,
      `4. Is er een afspraak of datum genoemd — een vervolggesprek, een oplevering, een`,
      `   deadline — zet die dan als taak met die datum, zodat hij in de agenda staat.`,
      ``,
      `Verzin niets. Wat er niet gezegd is, hoort bij wat ontbreekt en niet bij de`,
      `afspraken. Een verslag waarin iets staat dat niet gezegd is, is erger dan geen`,
      `verslag: daar wordt naar gehandeld.`,
    ].join("\n"),
  });

  if (!uitkomst.ok) throw new Error(uitkomst.error ?? "Uitpluizen mislukt.");
}
