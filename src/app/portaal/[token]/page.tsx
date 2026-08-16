import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { FORMULIEREN, isBeschikbaar } from "@/lib/portaal";
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

  // Vastleggen dat de klant hem geopend heeft, zodat je in HQ ziet waar hij
  // staat. Alleen de eerste keer, en alleen als er nog iets te doen is.
  if (!verlopen && !alGedaan && (aanvraag.status === "aangemaakt" || aanvraag.status === "verstuurd")) {
    await db.portalRequest.update({
      where: { id: aanvraag.id },
      data: { status: "geopend", openedAt: aanvraag.openedAt ?? new Date() },
    });
  }

  return (
    <div className="min-h-screen bg-bg px-5 py-10 sm:py-16">
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
          <Bericht
            kop="We hebben je gegevens al ontvangen"
            tekst="Bedankt. Je hoeft verder niets meer te doen."
          />
        ) : !isBeschikbaar(aanvraag.type) ? (
          <Bericht
            kop="Dit formulier staat nog niet klaar"
            tekst="Neem even contact met ons op, dan regelen we het persoonlijk."
          />
        ) : (
          <>
            <h1 className="text-3xl">{formulier.titel}</h1>
            <p className="muted mt-3 max-w-xl text-sm leading-relaxed">{formulier.inleiding}</p>

            <div className="mt-8">
              <PortaalFormulier token={token} secties={formulier.secties} />
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
