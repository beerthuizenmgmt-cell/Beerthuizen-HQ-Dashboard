import "server-only";

import { db } from "./db";
import { decryptSecret, encryptSecret } from "./crypto";
import { logActivity } from "./agents";

// Uitgaande mail via Resend.
//
// Eén sleutel voor het hele kantoor, net als de Telegram-lijn: dit is
// bedrijfsinfrastructuur, geen gereedschap van één agent. De sleutel staat
// versleuteld in de instellingen en komt nooit in de browser.
//
// Er is bewust maar één manier om een mail te versturen: een goedkeuring die jij
// hebt verleend. Een agent kan dus geen tekst opstellen en die zelf de deur uit
// doen, en hij kan de tekst ook niet meer aanpassen nadat jij akkoord gaf — wat
// verstuurd wordt is letterlijk wat er in het goedgekeurde verzoek staat.

type MailConfig = {
  apiKey: string | null;
  afzender: string | null;
  antwoordNaar: string | null;
};

export async function getMailConfig(): Promise<MailConfig> {
  const setting = await db.setting.findUnique({ where: { key: "mail" } });
  const stored = (setting?.value ?? {}) as {
    apiKey?: string;
    afzender?: string;
    antwoordNaar?: string;
  };

  return {
    apiKey: stored.apiKey ? decryptSecret(stored.apiKey) : (process.env.RESEND_API_KEY ?? null),
    afzender: stored.afzender ?? process.env.MAIL_AFZENDER ?? null,
    antwoordNaar: stored.antwoordNaar ?? null,
  };
}

/// Status voor de schermen: nooit de sleutel zelf.
export async function getMailStatus(): Promise<{
  hasKey: boolean;
  afzender: string | null;
  antwoordNaar: string | null;
  ready: boolean;
}> {
  const setting = await db.setting.findUnique({ where: { key: "mail" } });
  const stored = (setting?.value ?? {}) as {
    apiKey?: string;
    afzender?: string;
    antwoordNaar?: string;
  };
  const hasKey = Boolean(stored.apiKey || process.env.RESEND_API_KEY);
  const afzender = stored.afzender ?? process.env.MAIL_AFZENDER ?? null;

  return { hasKey, afzender, antwoordNaar: stored.antwoordNaar ?? null, ready: hasKey && Boolean(afzender) };
}

export async function saveMailConfig(input: {
  apiKey?: string;
  afzender?: string;
  antwoordNaar?: string;
}): Promise<void> {
  const setting = await db.setting.findUnique({ where: { key: "mail" } });
  const stored = (setting?.value ?? {}) as Record<string, string>;

  const value: Record<string, string> = { ...stored };
  // Een leeg sleutelveld betekent "laat staan wat er stond", niet "gooi weg":
  // het scherm toont de sleutel nooit terug, dus leeg is de normale toestand.
  if (input.apiKey?.trim()) value.apiKey = encryptSecret(input.apiKey.trim());
  if (input.afzender !== undefined) value.afzender = input.afzender.trim();
  if (input.antwoordNaar !== undefined) value.antwoordNaar = input.antwoordNaar.trim();

  await db.setting.upsert({
    where: { key: "mail" },
    create: { key: "mail", value },
    update: { value },
  });
}

type Verstuurd = { ok: boolean; error?: string; messageId?: string };

/// Ruwe verzending. Niet geëxporteerd: alles loopt via een goedkeuring.
async function stuur(
  config: MailConfig,
  aan: string,
  onderwerp: string,
  tekst: string,
): Promise<Verstuurd> {
  if (!config.apiKey) return { ok: false, error: "Er is nog geen Resend-sleutel ingesteld." };
  if (!config.afzender) return { ok: false, error: "Er is nog geen afzenderadres ingesteld." };

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: config.afzender,
        to: [aan],
        subject: onderwerp,
        text: tekst,
        ...(config.antwoordNaar ? { reply_to: config.antwoordNaar } : {}),
      }),
      signal: AbortSignal.timeout(20_000),
    });

    const body = (await response.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
      name?: string;
    };

    if (!response.ok) {
      // Resend zet de reden in `message`; die is leesbaar genoeg om te tonen.
      return { ok: false, error: body.message ?? `Resend gaf ${response.status} terug.` };
    }

    return { ok: true, messageId: body.id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Versturen mislukt." };
  }
}

/// Een proefmail naar jezelf, zodat je ziet dat domein en sleutel kloppen
/// voordat er ooit iets naar een klant gaat.
export async function stuurProefmail(naar: string): Promise<Verstuurd> {
  const config = await getMailConfig();
  return stuur(
    config,
    naar,
    "Proefmail uit Beerthuizen HQ",
    [
      "Dit is een proefmail uit je dashboard.",
      "",
      "Komt deze aan en staat hij niet in spam, dan zijn de sleutel en het",
      "afzenderdomein goed ingesteld en kunnen goedgekeurde mails de deur uit.",
      "",
      "Er is niets anders verstuurd.",
    ].join("\n"),
  );
}

/// Wat er in een goedgekeurd mailverzoek hoort te staan.
type MailPayload = { ontvanger?: unknown; onderwerp?: unknown; tekst?: unknown };

/// Verstuurt exact wat er in het goedgekeurde verzoek staat.
///
/// Alle grendels zitten hier, niet in de knop erboven: het verzoek moet bestaan,
/// van het juiste soort zijn, goedgekeurd zijn, en nog niet verstuurd. Zo kan
/// geen enkele andere weg — een agent, een script, een tweede tabblad — er een
/// mail doorheen duwen die jij niet hebt gezien.
export async function verstuurGoedgekeurdeMail(
  approvalId: string,
): Promise<{ ok: boolean; message: string }> {
  const goedkeuring = await db.approval.findUnique({
    where: { id: approvalId },
    include: { agent: { select: { id: true, name: true } } },
  });

  if (!goedkeuring) return { ok: false, message: "Dit verzoek bestaat niet meer." };
  if (goedkeuring.kind !== "email_send") {
    return { ok: false, message: "Dit verzoek gaat niet over een e-mail." };
  }
  if (goedkeuring.status !== "approved") {
    return { ok: false, message: "Hier is nog geen akkoord voor gegeven." };
  }
  if (goedkeuring.executedAt) {
    return { ok: false, message: "Deze mail is al verstuurd." };
  }

  const payload = (goedkeuring.payload ?? {}) as MailPayload;
  const ontvanger = typeof payload.ontvanger === "string" ? payload.ontvanger.trim() : "";
  const onderwerp = typeof payload.onderwerp === "string" ? payload.onderwerp.trim() : "";
  const tekst = typeof payload.tekst === "string" ? payload.tekst.trim() : "";

  // Zonder ontvanger valt er niets te versturen, en een half adres is precies
  // het soort fout dat je pas merkt als de mail bij de verkeerde ligt.
  if (!ontvanger || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(ontvanger)) {
    return { ok: false, message: `Geen bruikbaar e-mailadres in het verzoek: "${ontvanger || "leeg"}".` };
  }
  if (!onderwerp) return { ok: false, message: "Het verzoek heeft geen onderwerp." };
  if (!tekst) return { ok: false, message: "Het verzoek heeft geen tekst." };

  const config = await getMailConfig();
  const uitkomst = await stuur(config, ontvanger, onderwerp, tekst);

  if (!uitkomst.ok) {
    await db.approval.update({ where: { id: approvalId }, data: { error: uitkomst.error ?? null } });
    await logActivity({
      agentId: goedkeuring.agent.id,
      kind: "mail_mislukt",
      level: "warn",
      message: `Mail naar ${ontvanger} kon niet verstuurd worden: ${uitkomst.error}`,
    });
    return { ok: false, message: uitkomst.error ?? "Versturen mislukt." };
  }

  await db.approval.update({
    where: { id: approvalId },
    data: { executedAt: new Date(), error: null },
  });

  await logActivity({
    agentId: goedkeuring.agent.id,
    kind: "mail_verstuurd",
    level: "success",
    message: `Mail verstuurd naar ${ontvanger}: ${onderwerp}`,
  });

  return { ok: true, message: `Verstuurd naar ${ontvanger}.` };
}
