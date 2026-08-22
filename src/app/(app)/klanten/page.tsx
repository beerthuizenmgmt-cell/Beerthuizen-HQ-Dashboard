import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { KlantPaneel } from "@/components/klant-paneel";
import { formatDate, timeAgo, isVerlopen } from "@/lib/format";

export const dynamic = "force-dynamic";

// Klanten en de gegevens die je bij ze opvraagt.
//
// Het idee: jij stuurt een link, de klant vult in, alles komt hier terecht.
// Geen kopiëren en plakken uit mails.

const STATUS_LABELS: Record<string, string> = {
  aangemaakt: "Link aangemaakt",
  verstuurd: "Verstuurd",
  geopend: "Klant heeft hem geopend",
  ingevuld: "Ingevuld — controleren",
  gecontroleerd: "Gecontroleerd",
  verwerkt: "Verwerkt",
  verlopen: "Verlopen",
};

const STATUS_STIJL: Record<string, string> = {
  aangemaakt: "text-text-faint",
  verstuurd: "text-text-muted",
  geopend: "text-warn",
  ingevuld: "text-success",
  gecontroleerd: "text-success",
  verwerkt: "text-text-faint",
  verlopen: "text-danger",
};

export default async function KlantenPagina() {
  const user = await requireUser();

  const [klanten, aanvragen] = await Promise.all([
    db.client.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { invoices: true } } },
    }),
    db.portalRequest.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { client: { select: { name: true } } },
    }),
  ]);

  const basis = (process.env.APP_URL ?? "https://beerthuizen-hq.vercel.app").replace(/\/$/, "");
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Klanten</h1>
        <p className="mt-2 max-w-2xl text-sm text-text-muted">
          Vraag gegevens op met een beveiligde link. De klant vult ze zelf in, jij hoeft niets over te
          typen, en Maud kan er daarna direct mee factureren.
        </p>
      </header>

      <KlantPaneel
        magIntrekken={user.role === "owner"}
        klanten={klanten.map((klant) => ({ id: klant.id, naam: klant.name }))}
        aanvragen={aanvragen.map((aanvraag) => ({
          id: aanvraag.id,
          naam: aanvraag.client?.name ?? aanvraag.label ?? "onbekend",
          type: aanvraag.type,
          status: aanvraag.status,
          statusLabel:
            isVerlopen(aanvraag.expiresAt) && aanvraag.status !== "verwerkt"
              ? STATUS_LABELS.verlopen
              : STATUS_LABELS[aanvraag.status],
          statusStijl:
            isVerlopen(aanvraag.expiresAt) && aanvraag.status !== "verwerkt"
              ? STATUS_STIJL.verlopen
              : STATUS_STIJL[aanvraag.status],
          link: `${basis}/portaal/${aanvraag.token}`,
          aangemaakt: timeAgo(aanvraag.createdAt),
          geopend: aanvraag.openedAt ? timeAgo(aanvraag.openedAt) : null,
          ingevuld: aanvraag.submittedAt ? timeAgo(aanvraag.submittedAt) : null,
          verloopt: formatDate(aanvraag.expiresAt),
          ingestuurd: (aanvraag.submission as Record<string, string> | null) ?? null,
        }))}
      />

      <section>
        <h2 className="eyebrow mb-3">In de administratie</h2>
        {klanten.length === 0 ? (
          <div className="card p-8 text-center">
            <p className="text-sm text-text-muted">
              Nog geen klanten. Maak hierboven een link aan en stuur hem naar je eerste klant.
            </p>
          </div>
        ) : (
          <div className="card lijst">
            {klanten.map((klant) => (
              <div key={klant.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="font-medium">{klant.name}</p>
                  <p className="text-xs text-text-muted">
                    {[klant.contactName, klant.invoiceEmail ?? klant.email, klant.city]
                      .filter(Boolean)
                      .join(" · ") || "geen gegevens ingevuld"}
                  </p>
                </div>
                <div className="flex items-center gap-4 text-xs text-text-faint">
                  {klant.kvk && <span>KvK {klant.kvk}</span>}
                  {klant.vatId && <span>{klant.vatId}</span>}
                  <span>
                    {klant._count.invoices} factu{klant._count.invoices === 1 ? "ur" : "ren"}
                  </span>
                  <span className={klant.detailsConfirmedAt ? "text-success" : "text-warn"}>
                    {klant.detailsConfirmedAt
                      ? `zelf aangeleverd ${timeAgo(klant.detailsConfirmedAt)}`
                      : "handmatig ingevoerd"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
