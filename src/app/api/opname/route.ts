import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { decryptToolConfig } from "@/lib/ai/toolkit";

// Eén stukje opname uitschrijven.
//
// De browser knipt het gesprek in stukken van twee minuten en stuurt ze hier
// één voor één heen. Dat moet ook wel: Vercel accepteert 4,5 MB per verzoek en
// een uur audio is dertig tot zestig. Bijkomend voordeel is dat de tekst al
// binnendruppelt terwijl het gesprek nog loopt, en dat je bij een storing alleen
// het laatste stuk kwijt bent.
//
// De sleutel blijft hier. Zou de browser rechtstreeks naar OpenAI sturen, dan
// stond hij in de pagina en kon iedereen hem meelezen.

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  await requireUser();

  // De sleutel hangt aan een agent, zoals alle koppelingen. Welke agent maakt
  // hier niet uit: het uitschrijven gebeurt niet namens iemand, het is een
  // dienst die het bureau afneemt.
  const koppeling = await db.agentTool.findFirst({
    where: { toolKey: "transcriptie", enabled: true },
  });
  if (!koppeling) {
    return Response.json(
      { ok: false, error: "Er is nog geen transcriptiesleutel ingesteld. Zet hem bij Beheer → Tools." },
      { status: 400 },
    );
  }

  const config = decryptToolConfig(koppeling.config);
  if (!config.apiKey) {
    return Response.json({ ok: false, error: "De transcriptiesleutel is leeg." }, { status: 400 });
  }

  const binnen = await request.formData();
  const stuk = binnen.get("audio");
  if (!(stuk instanceof File)) {
    return Response.json({ ok: false, error: "Geen audio meegestuurd." }, { status: 400 });
  }

  // Stilte kost geld en levert niets op. Onder de paar kilobyte zit er geen
  // spraak in; dat is een stuk waarin niemand iets zei.
  if (stuk.size < 4_000) {
    return Response.json({ ok: true, tekst: "" });
  }

  const naarOpenAi = new FormData();
  naarOpenAi.append("file", stuk, "opname.webm");
  naarOpenAi.append("model", "gpt-4o-transcribe");
  // Nederlands meegeven scheelt fouten bij namen en bedragen; zonder dit gokt
  // het model de taal per stuk en dat wisselt halverwege een gesprek.
  naarOpenAi.append("language", "nl");

  try {
    const antwoord = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { authorization: `Bearer ${config.apiKey}` },
      body: naarOpenAi,
      signal: AbortSignal.timeout(110_000),
    });

    if (antwoord.status === 401) {
      return Response.json(
        { ok: false, error: "De sleutel werd geweigerd. Controleer hem bij Beheer → Tools." },
        { status: 400 },
      );
    }
    if (!antwoord.ok) {
      const tekst = await antwoord.text();
      return Response.json(
        { ok: false, error: `Uitschrijven mislukte (${antwoord.status}): ${tekst.slice(0, 200)}` },
        { status: 502 },
      );
    }

    const body = (await antwoord.json()) as { text?: string };
    return Response.json({ ok: true, tekst: (body.text ?? "").trim() });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Uitschrijven mislukt." },
      { status: 502 },
    );
  }
}
