import { NextResponse } from "next/server";
import { verwerkBetaling } from "@/lib/betalingen";

// Het ingangspunt voor betalingen uit een bank- of boekhoudkoppeling.
//
// Hier komt straks Moneybird, e-Boekhouden, Exact of een banktransactiedienst
// op uit. De koppeling stuurt wat hij ziet; dit endpoint bepaalt of het zeker
// genoeg is om te boeken. Bij twijfel wordt er niets gekoppeld en krijgt
// Enriqueo de vraag.
//
// Bewust nu al gebouwd: zo hoeft er straks alleen een koppeling naartoe te
// wijzen, en verandert er niets meer aan de logica of aan Maud.
//
//   POST /api/betalingen
//   Authorization: Bearer <CRON_SECRET>
//   { "betalingen": [
//       { "bedrag": 2500, "ontvangenOp": "2026-09-14",
//         "omschrijving": "Factuur 2026-041", "tegenpartij": "Klant A",
//         "bron": "moneybird", "externId": "tx_8891" }
//   ]}

export const dynamic = "force-dynamic";

type Binnenkomend = {
  bedrag?: number;
  ontvangenOp?: string;
  omschrijving?: string;
  tegenpartij?: string;
  bron?: string;
  externId?: string;
};

function toegestaan(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  // Zonder secret alleen lokaal; online zou dat betekenen dat iedereen
  // betalingen kan melden.
  if (!secret) return process.env.NODE_ENV !== "production";
  return (request.headers.get("authorization") ?? "") === `Bearer ${secret}`;
}

export async function POST(request: Request) {
  if (!toegestaan(request)) {
    return NextResponse.json({ error: "Niet toegestaan." }, { status: 401 });
  }

  let payload: { betalingen?: Binnenkomend[] };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Geen geldige JSON." }, { status: 400 });
  }

  const binnen = Array.isArray(payload.betalingen) ? payload.betalingen : [];
  if (binnen.length === 0) {
    return NextResponse.json({ error: "Geen betalingen meegestuurd." }, { status: 400 });
  }

  const uitkomsten: { bedrag: number; gekoppeld: boolean; bericht: string }[] = [];

  for (const item of binnen) {
    const bedrag = typeof item.bedrag === "number" ? item.bedrag : Number(item.bedrag);
    const datum = item.ontvangenOp ? new Date(item.ontvangenOp) : new Date();

    if (!Number.isFinite(bedrag) || bedrag <= 0 || Number.isNaN(datum.getTime())) {
      uitkomsten.push({ bedrag: bedrag || 0, gekoppeld: false, bericht: "bedrag of datum klopt niet" });
      continue;
    }

    try {
      const uitkomst = await verwerkBetaling({
        amountEur: bedrag,
        receivedOn: datum,
        reference: item.omschrijving ?? null,
        counterparty: item.tegenpartij ?? null,
        source: item.bron ?? "koppeling",
        externalId: item.externId ?? null,
      });
      uitkomsten.push({ bedrag, ...uitkomst });
    } catch (error) {
      // Een dubbel aangeleverde transactie is geen fout: de koppeling mag
      // rustig opnieuw sturen zonder dat er twee keer geboekt wordt.
      const melding = error instanceof Error ? error.message : "onbekende fout";
      uitkomsten.push({
        bedrag,
        gekoppeld: false,
        bericht: melding.includes("Unique") ? "deze transactie was al verwerkt" : melding,
      });
    }
  }

  return NextResponse.json({
    verwerkt: uitkomsten.length,
    gekoppeld: uitkomsten.filter((u) => u.gekoppeld).length,
    uitkomsten,
  });
}
