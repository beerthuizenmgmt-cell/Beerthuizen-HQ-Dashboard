import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { FORMULIEREN, isBeschikbaar, beoordeelBriefing } from "@/lib/portaal";
import { PortaalFormulier } from "@/components/portaal-formulier";
import { Logo } from "@/components/logo";

export const dynamic = "force-dynamic";

// Wat de klant ziet.
//
// Bewust buiten de app-groep: geen navigatie, geen inlog, geen enkel spoor van
// HQ. Een klant vult iets in en is klaar. Hij hoeft niet te weten dat er agents
// achter zitten, en hij hoort niets te zien wat niet voor hem bedoeld is.

export default async function PortaalPagina({ params }: PageProps<"/portaal/[token]">) {
  const { token } = await params;

  const aanvraag = await db.portalRequest.findUnique({ where: { token } });
  if (!aanvraag) notFound();

  const formulier = FORMULIEREN[aanvraag.type];
  const verlopen = aanvraag.expiresAt < new Date();
  const alGedaan = aanvraag.status === "ingevuld" || aanvraag.status === "verwerkt";

  // Bij een aanvulling tonen we alleen wat nog openstaat. Iemand die al een
  // uur aan een briefing heeft besteed opnieuw het hele formulier laten
  // doorlopen is de snelste manier om hem te laten afhaken.
  let secties = formulier.secties;
  let aanvullend = false;

  if (aanvraag.supplementsId) {
    const project = await db.project.findUnique({
      where: { id: aanvraag.supplementsId },
      include: { request: { select: { submission: true } } },
    });

    const bestaand = (project?.request?.submission as Record<string, string> | null) ?? {};
    const openstaand = new Set(beoordeelBriefing(bestaand).map((gat) => gat.veld));

    if (openstaand.size > 0) {
      aanvullend = true;
      secties = formulier.secties
        .map((sectie) => ({
          ...sectie,
          // Verplicht loslaten: de klant vult aan wat hij kan, en wat hij nog
          // steeds niet weet blijft gewoon als openstaand punt staan.
          velden: sectie.velden
            .filter((veld) => openstaand.has(veld.naam))
            .map((veld) => ({ ...veld, verplicht: false, toonAls: undefined })),
        }))
        .filter((sectie) => sectie.velden.length > 0);
    }
  }

  // Vastleggen dat de klant hem geopend heeft, zodat je in HQ ziet waar hij
  // staat. Alleen de eerste keer, en alleen als er nog iets te doen is.
  if (!verlopen && !alGedaan && (aanvraag.status === "aangemaakt" || aanvraag.status === "verstuurd")) {
    await db.portalRequest.update({
      where: { id: aanvraag.id },
      data: { status: "geopend", openedAt: aanvraag.openedAt ?? new Date() },
    });
  }

  return (
    <div className="klantpagina min-h-screen px-5 py-10 sm:py-16">
      <div className="mx-auto max-w-2xl">
        <header className="mb-10">
          <Logo />
        </header>

        {verlopen ? (
          <Bericht
            kop="Deze link is verlopen"
            tekst="Neem even contact met ons op, dan sturen we je een nieuwe."
          />
        ) : alGedaan ? (
          // Leest goed voor wie net verzonden heeft én voor wie de link later
          // nog eens opent. "Al ontvangen" klinkt als een verwijt.
          <Bericht
            kop="Bedankt, we hebben je gegevens ontvangen"
            tekst="Je hoeft verder niets meer te doen. We nemen contact op als er nog iets ontbreekt."
          />
        ) : !isBeschikbaar(aanvraag.type) ? (
          <Bericht
            kop="Dit formulier staat nog niet klaar"
            tekst="Neem even contact met ons op, dan regelen we het persoonlijk."
          />
        ) : (
          <>
            <h1 className="text-3xl">{aanvullend ? "Nog een paar vragen" : formulier.titel}</h1>
            <p className="muted mt-3 max-w-xl text-sm leading-relaxed">
              {aanvullend
                ? "Bedankt voor je briefing. Om een goed voorstel te kunnen maken missen we nog een paar dingen. Wat je eerder invulde hoef je niet opnieuw te doen."
                : formulier.inleiding}
            </p>

            <div className="mt-8">
              <PortaalFormulier token={token} secties={secties} />
            </div>
          </>
        )}

        <footer className="mt-16 border-t border-border pt-6 text-xs text-text-faint">
          Beerthuizen Management · Blaricum
          <span className="mt-1 block">
            Je gegevens worden uitsluitend gebruikt voor onze administratie en niet met derden gedeeld.
          </span>
        </footer>
      </div>
    </div>
  );
}

function Bericht({ kop, tekst }: { kop: string; tekst: string }) {
  return (
    <div className="card p-8">
      <h1 className="text-2xl">{kop}</h1>
      <p className="muted mt-3 text-sm">{tekst}</p>
    </div>
  );
}
