import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ontbrekendeResultaten } from "@/lib/creators";
import { CreatorPaneel } from "@/components/creator-paneel";
import { CreatorBewerken } from "@/components/creator-bewerken";
import { timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";

// Het creatorregister.
//
// Eén creator, één regel, ongeacht hoeveel campagnes hij gedaan heeft. Wat je
// over hem weet hoort bij hém; wat er per campagne is afgesproken staat bij de
// campagne. Zo hoeft niemand dezelfde creator twee keer in te voeren.

const SOORT_LABEL: Record<string, string> = {
  eigen: "Eigen creator",
  via_agency: "Via een bureau",
  extern: "Extern",
};

const STATUS_STIJL: Record<string, string> = {
  actief: "border-success/40 text-success",
  kandidaat: "text-text-muted",
  rust: "text-text-faint",
  niet_inzetten: "border-danger/40 text-danger",
};

const STATUS_LABEL: Record<string, string> = {
  actief: "Actief",
  kandidaat: "Kandidaat",
  rust: "Even niet",
  niet_inzetten: "Niet inzetten",
};

function getal(waarde: number | null): string {
  if (waarde === null) return "—";
  return new Intl.NumberFormat("nl-NL", { notation: "compact", maximumFractionDigits: 1 }).format(waarde);
}

export default async function CreatorsPagina() {
  await requireUser();

  const [creators, campagnes, gaten] = await Promise.all([
    db.creator.findMany({
      orderBy: [{ status: "asc" }, { name: "asc" }],
      include: {
        campagnes: {
          include: { project: { select: { id: true, name: true, status: true } } },
          orderBy: { createdAt: "desc" },
        },
      },
    }),
    db.project.findMany({
      where: { status: { notIn: ["afgerond", "afgewezen"] } },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true },
    }),
    ontbrekendeResultaten(),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Creators</h1>
        <p className="mt-2 max-w-2xl text-sm text-text-muted">
          Eén creator staat hier één keer, ook als hij aan vijf campagnes werkt. Wat je over hem weet
          hoort bij hem; wat er per campagne is afgesproken staat bij die campagne.
        </p>
      </header>

      {/* Wat er nog ontbreekt aan resultaten — het eerste wat Fleur wil zien */}
      {gaten.length > 0 && (
        <section className="card border border-warn/40 bg-warn/5 p-4">
          <p className="text-sm font-medium text-warn">
            {gaten.length} {gaten.length === 1 ? "ontbrekend punt" : "ontbrekende punten"} in
            creatorresultaten
          </p>
          <ul className="mt-2 space-y-0.5 text-xs text-text-muted">
            {gaten.slice(0, 8).map((gat, index) => (
              <li key={index}>
                <span className="text-text">{gat.creatorNaam}</span> — {gat.wat}
                {gat.gevraagdOp && ` · gevraagd ${timeAgo(gat.gevraagdOp)}`}
              </li>
            ))}
            {gaten.length > 8 && <li className="text-text-faint">… en nog {gaten.length - 8}</li>}
          </ul>
        </section>
      )}

      <CreatorPaneel campagnes={campagnes} />

      {creators.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-sm text-text-muted">
            Nog geen creators. Voeg er hierboven een toe, of laat Fleur er een voorstellen vanuit een
            campagne.
          </p>
        </div>
      ) : (
        <div className="card lijst">
          {creators.map((creator) => {
            const lopend = creator.campagnes.filter(
              (k) => !["afgezegd"].includes(k.status) && k.project.status !== "afgerond",
            );
            const geleverd = creator.campagnes.filter((k) => k.resultatenOntvangenOp);

            return (
              <article key={creator.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-medium">{creator.name}</h2>
                      <span className={`chip text-xs ${STATUS_STIJL[creator.status] ?? ""}`}>
                        {STATUS_LABEL[creator.status] ?? creator.status}
                      </span>
                      <span className="text-xs text-text-faint">{SOORT_LABEL[creator.soort]}</span>
                      {creator.agency && (
                        <span className="text-xs text-text-faint">· {creator.agency}</span>
                      )}
                    </div>

                    <p className="mt-1 text-xs text-text-muted">
                      {[
                        creator.instagram && `IG @${creator.instagram}`,
                        creator.tiktok && `TikTok @${creator.tiktok}`,
                        creator.youtube && `YouTube ${creator.youtube}`,
                        ...creator.andereKanalen,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "geen kanalen ingevuld"}
                    </p>

                    {creator.niche.length > 0 && (
                      <p className="mt-0.5 text-xs text-text-faint">{creator.niche.join(" · ")}</p>
                    )}
                  </div>

                  <dl className="flex shrink-0 gap-5 text-xs">
                    <div className="text-right">
                      <dt className="text-text-faint">Instagram</dt>
                      <dd className="font-medium">{getal(creator.volgersInstagram)}</dd>
                    </div>
                    <div className="text-right">
                      <dt className="text-text-faint">TikTok</dt>
                      <dd className="font-medium">{getal(creator.volgersTiktok)}</dd>
                    </div>
                    <div className="text-right">
                      <dt className="text-text-faint">Engagement</dt>
                      <dd className="font-medium">
                        {creator.engagement !== null ? `${creator.engagement}%` : "—"}
                      </dd>
                    </div>
                    <div className="text-right">
                      <dt className="text-text-faint">Richtprijs</dt>
                      <dd className="font-medium">
                        {creator.prijsindicatieEur !== null
                          ? `€${creator.prijsindicatieEur.toLocaleString("nl-NL")}`
                          : "—"}
                      </dd>
                    </div>
                  </dl>
                </div>

                {/* Waar deze cijfers vandaan komen. Zonder bron is een getal een bewering. */}
                {creator.cijfersBron && (
                  <p className="mt-2 text-xs text-text-faint">
                    Cijfers: {creator.cijfersBron}
                    {creator.cijfersOp && ` · ${timeAgo(creator.cijfersOp)}`}
                  </p>
                )}

                {creator.campagnes.length > 0 && (
                  <div className="mt-3 border-t border-border pt-3">
                    <p className="eyebrow mb-1.5">
                      {lopend.length} lopend · {geleverd.length} geleverd
                    </p>
                    <ul className="space-y-1 text-xs">
                      {creator.campagnes.slice(0, 4).map((koppeling) => (
                        <li key={koppeling.id} className="flex flex-wrap items-center gap-2">
                          <Link href="/projecten" className="hover:underline">
                            {koppeling.project.name}
                          </Link>
                          <span className="text-text-faint">{koppeling.status}</span>
                          {koppeling.resultatenOntvangenOp ? (
                            <span className="text-success">
                              resultaten binnen {timeAgo(koppeling.resultatenOntvangenOp)}
                            </span>
                          ) : koppeling.resultatenGevraagdOp ? (
                            <span className="text-warn">
                              gevraagd {timeAgo(koppeling.resultatenGevraagdOp)}
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="mt-3">
                  <CreatorBewerken
                    creator={{
                      id: creator.id,
                      name: creator.name,
                      soort: creator.soort,
                      instagram: creator.instagram,
                      tiktok: creator.tiktok,
                      youtube: creator.youtube,
                      niche: creator.niche,
                      land: creator.land,
                      agency: creator.agency,
                      volgersInstagram: creator.volgersInstagram,
                      volgersTiktok: creator.volgersTiktok,
                      prijsindicatieEur: creator.prijsindicatieEur,
                    }}
                  />
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
