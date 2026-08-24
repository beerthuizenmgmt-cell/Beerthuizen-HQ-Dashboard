"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";

// Een uitgeschreven gesprek opslaan en er meteen iets mee doen.
//
// Opslaan gaat direct; het uitpluizen erna. Zo sta je niet te wachten terwijl
// een agent nadenkt, en is je gesprek al veilig als het uitpluizen misgaat.
//
// De ruwe tekst blijft altijd bewaard, ook nadat het team er een verslag van
// maakte. Een samenvatting waarvan je het origineel niet meer hebt is niet na
// te kijken, en juist bij een klantgesprek wil je terug kunnen naar wat er
// letterlijk gezegd is.

export async function bewaarGesprek(tekst: string, minuten: number | null) {
  await requireUser();

  const schoon = tekst.trim();
  if (!schoon) throw new Error("Er is niets uitgeschreven.");

  const gesprek = await db.klantgesprek.create({
    data: {
      // De naam van de klant halen we niet uit een formulier maar uit het
      // gesprek zelf: jij zat aan tafel, jij hoeft niets in te vullen. Tot het
      // team het heeft uitgeplozen staat hier wat er nog niet bekend is.
      bedrijf: "nog te bepalen",
      ruweTekst: schoon,
      aanwezig: minuten ? `gesprek van ongeveer ${minuten} minuten` : null,
    },
  });

  revalidatePath("/gesprekken");

  after(async () => {
    try {
      const { verwerkGesprek } = await import("@/lib/gesprek-verwerken");
      await verwerkGesprek(gesprek.id);
    } catch (error) {
      await db.activityEvent.create({
        data: {
          kind: "gesprek_niet_verwerkt",
          level: "warn",
          message: `Een gesprek is opgeslagen maar kon niet worden uitgeplozen: ${
            error instanceof Error ? error.message : "onbekende fout"
          }`,
          occurredAt: new Date(),
        },
      });
    }
  });

  return gesprek.id;
}
