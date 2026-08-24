import { db } from "@/lib/db";
import { haalSignalen } from "@/lib/signalen";

// Wat er opvalt zonder dat iemand ernaar vraagt.
//
// Elke werkdag om tien uur kijkt de Head of Operations of er iets scheefloopt:
// een campagne die afloopt terwijl de briefing nog niet rond is, werk dat
// vastligt, een vraag waar geen antwoord op komt, een factuur die over tijd is.
//
// Eén keer per dag en niet twee: het Vercel-plan staat maar één cronmoment per
// dag toe. Tien uur is een bewuste keuze binnen die grens — dan is er sinds het
// overleg van zes uur iets kunnen misgaan, en is er nog een dag over om het op
// te lossen.
//
// De signalen worden in gewone code uitgerekend en niet aan het model gevraagd.
// Een deadline over drie dagen is een som, geen inschatting. Het model krijgt de
// lijst en bepaalt wat eraan te doen valt: vinden doet de code, oordelen doet de
// agent.
//
// Zijn er geen signalen, dan gebeurt er niets. Een bericht "er is niets aan de
// hand" elke ochtend is precies het soort ruis waardoor je de keer dat er wél
// iets is over het hoofd ziet.

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function toegestaan(request: Request): boolean {
  const geheim = process.env.CRON_SECRET;
  if (!geheim) return process.env.NODE_ENV !== "production"; // lokaal mag het zonder
  return (request.headers.get("authorization") ?? "") === `Bearer ${geheim}`;
}

export async function GET(request: Request) {
  if (!toegestaan(request)) return new Response("Not found", { status: 404 });

  const signalen = await haalSignalen();
  if (signalen.length === 0) {
    return Response.json({ ok: true, signalen: 0, gedaan: "niets — er valt niets op" });
  }

  const chief = await db.agent.findFirst({ where: { isChief: true, paused: false } });
  if (!chief) {
    return Response.json({ ok: false, signalen: signalen.length, error: "Geen actieve Head of Operations." });
  }

  const { runAgent } = await import("@/lib/ai/run");

  const uitkomst = await runAgent({
    agentId: chief.id,
    trigger: "signaal",
    reason: `${signalen.length} signaal/signalen`,
    input: [
      `Je hebt zelf gekeken hoe het ervoor staat. Dit valt op:`,
      ``,
      ...signalen.map((s) => `- [${s.urgentie}] ${s.wat}`),
      ``,
      `Pak op wat je zelf kunt oplossen: zet werk uit, vraag een ontbrekend`,
      `briefingveld, help iemand die vastligt verder, of leg iets bij een collega neer.`,
      ``,
      `Enriqueo hoef je hier niet over te berichten tenzij er iets bij zit waar`,
      `alleen hij over gaat en waar vandaag een beslissing over moet vallen. Een`,
      `opsomming van wat je gezien hebt is geen bericht waard — hij ziet dit`,
      `zelf op zijn dashboard.`,
      ``,
      `Vat aan het eind in één zin samen wat je hebt gedaan.`,
    ].join("\n"),
  });

  return Response.json({
    ok: uitkomst.ok,
    signalen: signalen.length,
    hoog: signalen.filter((s) => s.urgentie === "hoog").length,
    gedaan: uitkomst.ok ? uitkomst.text.slice(0, 500) : uitkomst.error,
  });
}
