import { requireOwner } from "@/lib/access";
import { alleFacturen, debiteurenstand, WORKFLOW } from "@/lib/facturen";
import { openstaandeBetalingen } from "@/lib/betalingen";
import { FactuurTabel } from "@/components/factuur-tabel";
import { BetalingPaneel } from "@/components/betaling-paneel";
import { formatEuro, formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

// De facturenadministratie.
//
// Bewust één scherm: invoeren, overzicht en opvolging bij elkaar. Debiteuren
// bijhouden is werk dat je tussendoor doet, niet iets waar je een wizard voor
// wilt doorlopen.

export default async function FacturenPage() {
  await requireOwner();

  const [facturen, stand, betalingen] = await Promise.all([
    alleFacturen(),
    debiteurenstand(),
    openstaandeBetalingen(),
  ]);

  // Alleen facturen waar nog iets op open staat zijn een zinnige koppeling.
  const koppelbaar = facturen
    .filter((f) => f.richting === "uitgaand" && f.openstaandEur > 0)
    .map((f) => ({
      id: f.id,
      label: `${f.nummer} · ${f.klant} · ${formatEuro(f.openstaandEur)} open`,
    }));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Facturen &amp; debiteuren</h1>
        <p className="mt-2 max-w-3xl text-sm text-text-muted">
          Wat er uitstaat, wie te laat is en wat er als volgende moet gebeuren. Maud leest hier mee en
          bereidt opvolging voor — versturen doe jij, altijd.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div className="card p-4">
          <p className="text-xl font-semibold text-success">{formatEuro(stand.teOntvangenEur)}</p>
          <p className="text-xs text-text-muted">te ontvangen</p>
        </div>
        <div className="card p-4">
          <p className="text-xl font-semibold">{formatEuro(stand.teBetalenEur)}</p>
          <p className="text-xs text-text-muted">te betalen</p>
        </div>
        <div className="card p-4">
          <p className="text-xl font-semibold">{formatEuro(stand.betaaldDezeMaandEur)}</p>
          <p className="text-xs text-text-muted">betaald deze maand</p>
        </div>
        <div className="card p-4">
          <p className={`text-xl font-semibold ${stand.teLaatEur > 0 ? "text-danger" : ""}`}>
            {formatEuro(stand.teLaatEur)}
          </p>
          <p className="text-xs text-text-muted">te laat · {stand.aantalTeLaat}</p>
        </div>
        <div className="card p-4">
          <p className={`text-xl font-semibold ${stand.herinneringNodig > 0 ? "text-warn" : ""}`}>
            {stand.herinneringNodig}
          </p>
          <p className="text-xs text-text-muted">herinnering nodig</p>
        </div>
        <div className="card p-4">
          <p className={`text-xl font-semibold ${stand.wachtOpAkkoord > 0 ? "text-warn" : ""}`}>
            {stand.wachtOpAkkoord}
          </p>
          <p className="text-xs text-text-muted">actie van jou</p>
        </div>
      </div>

      <section className="card p-5">
        <h2 className="text-sm font-semibold">De route die elke factuur aflegt</h2>
        <ol className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          {WORKFLOW.map((stap, index) => (
            <li key={stap} className="flex items-center gap-2">
              <span className="chip">{stap}</span>
              {index < WORKFLOW.length - 1 && <span className="text-text-faint">→</span>}
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs text-text-muted">
          Maud loopt deze route en slaat geen stap over. Alles tot en met &ldquo;voorbereiden&rdquo; doet
          zij zelf; herinneringen, aanmaningen en regelingen gaan pas de deur uit met jouw akkoord.
        </p>
      </section>

      <BetalingPaneel
        betalingen={betalingen.map((b) => ({
          id: b.id,
          bedragLabel: formatEuro(b.amountEur),
          ontvangenLabel: formatDate(b.receivedOn),
          omschrijving: b.reference,
          tegenpartij: b.counterparty,
          reden: b.matchReason ?? "geen match gevonden",
          bron: b.source,
          vermoeden: b.invoice
            ? { id: b.invoiceId!, label: `${b.invoice.number} · ${b.invoice.clientName}` }
            : null,
        }))}
        facturen={koppelbaar}
      />

      <FactuurTabel
        facturen={facturen.map((f) => ({
          id: f.id,
          nummer: f.nummer,
          richting: f.richting,
          klant: f.klant,
          email: f.klantEmail,
          factuurdatum: f.factuurdatum.toISOString().slice(0, 10),
          factuurdatumLabel: formatDate(f.factuurdatum),
          vervaldatum: f.vervaldatum.toISOString().slice(0, 10),
          vervaldatumLabel: formatDate(f.vervaldatum),
          bedrag: f.bedragEur,
          bedragLabel: formatEuro(f.bedragEur),
          openstaandLabel: formatEuro(f.openstaandEur),
          status: f.status,
          statusLabel: f.statusLabel,
          opvolgingLabel: f.opvolgingLabel,
          verzonden: f.verzondenOp ? f.verzondenOp.toISOString().slice(0, 10) : "",
          verzondenLabel: f.verzondenOp ? formatDate(f.verzondenOp) : null,
          betaaldatum: f.betaaldOp ? f.betaaldOp.toISOString().slice(0, 10) : "",
          betaaldatumLabel: f.betaaldOp ? formatDate(f.betaaldOp) : null,
          herinnering1: f.herinnering1Op ? formatDate(f.herinnering1Op) : null,
          herinnering2: f.herinnering2Op ? formatDate(f.herinnering2Op) : null,
          dagen: f.dagenOpenstaand,
          teLaat: f.teLaat,
          notities: f.notities,
          volgendeStap: f.volgendeStap,
          bron: f.bron,
        }))}
      />

      <section className="card p-5">
        <h2 className="text-sm font-semibold">Later koppelen aan je boekhouding</h2>
        <p className="mt-2 text-sm text-text-muted">
          Elke factuur draagt een herkomst en een extern kenmerk. Koppel je straks Moneybird,
          e-Boekhouden of Exact, dan komen die facturen ernaast te staan en weet het systeem welke regel
          bij welke factuur hoort. Maud hoeft daar niets voor te leren — voor haar verandert er niets
          behalve dat er meer in staat.
        </p>
      </section>
    </div>
  );
}
