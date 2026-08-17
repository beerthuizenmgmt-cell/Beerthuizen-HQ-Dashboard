import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { creatorStanden, type Leverstatus } from "@/lib/creators";
import { AgentAvatar } from "@/components/agent-avatar";
import { ResultatenKnop } from "@/components/resultaten-knop";
import { AanvulKnop } from "@/components/aanvul-knop";
import { formatDate, timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";

// Alles over één campagne op één pagina.
//
// Het idee: nooit meer denken "waar stond dat ook alweer?". De briefing, wie
// eraan werkt, welke creators erop zitten en wat er van hen binnen is, wat er
// ontbreekt en wat je nu kunt doen — allemaal hier, in die volgorde. Wat er
// mis is staat boven wat er goed gaat.

const STIP: Record<Leverstatus, string> = {
  compleet: "🟢",
  gedeeltelijk: "🟡",
  ontbreekt: "🔴",
};

const STATUS_LABELS: Record<string, string> = {
  nieuw: "Nieuw",
  info_nodig: "Aanvullende informatie nodig",
  in_voorbereiding: "In voorbereiding",
  loopt: "Loopt",
  afgerond: "Afgerond",
  afgewezen: "Afgewezen",
};

export default async function CampagnePagina({ params }: PageProps<"/projecten/[id]">) {
  await requireUser();
  const { id } = await params;

  const project = await db.project.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, name: true, email: true } },
      request: { select: { submission: true, submittedAt: true } },
      tasks: {
        include: { agent: { select: { name: true, emoji: true, color: true, avatarUrl: true } } },
        orderBy: { createdAt: "asc" },
      },
      creators: {
        include: {
          creator: { select: { id: true, name: true, instagram: true, tiktok: true } },
          uploads: { select: { bereik: true, views: true, likes: true, engagementRate: true, ontbreekt: true } },
        },
      },
    },
  });

  if (!project) notFound();

  const standen = await creatorStanden(project.id);
  const briefing = (project.request?.submission as Record<string, string> | null) ?? null;

  // Optellen wat er echt is. Een creator zonder cijfers telt niet mee als 0 —
  // dan zou het gemiddelde dalen door iets wat we niet weten.
  const metBereik = project.creators.flatMap((k) => k.uploads).filter((u) => u.bereik !== null);
  const totaalBereik = metBereik.reduce((n, u) => n + (u.bereik ?? 0), 0);
  const metViews = project.creators.flatMap((k) => k.uploads).filter((u) => u.views !== null);
  const totaalViews = metViews.reduce((n, u) => n + (u.views ?? 0), 0);
  const compleet = standen.filter((s) => s.status === "compleet").length;

  const openTaken = project.tasks.filter((t) => !["done", "cancelled"].includes(t.status));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <Link href="/projecten" className="text-xs text-text-muted hover:text-text">
          ← Alle projecten
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{project.name}</h1>
            <p className="mt-1 text-sm text-text-muted">
              {project.client?.name ?? "klant onbekend"}
              {project.deadline && ` · deadline ${formatDate(project.deadline)}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="chip text-xs">{STATUS_LABELS[project.status] ?? project.status}</span>
            <Link href={`/projecten/${project.id}/rapport`} className="btn btn-ghost text-xs">
              Rapport
            </Link>
          </div>
        </div>
      </header>

      {/* ── Wat er mis is, eerst ──────────────────────────────────────── */}
      {project.missingInfo.length > 0 && (
        <section className="card border border-warn/40 bg-warn/5 p-4">
          <p className="text-sm font-semibold text-warn">
            {project.missingInfo.length} {project.missingInfo.length === 1 ? "punt ontbreekt" : "punten ontbreken"}
          </p>
          <ul className="mt-2 space-y-0.5 text-xs text-text-muted">
            {project.missingInfo.map((punt, index) => (
              <li key={index}>· {punt}</li>
            ))}
          </ul>
          <AanvulKnop projectId={project.id} />
        </section>
      )}

      {/* ── De stand ──────────────────────────────────────────────────── */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "creators", waarde: String(standen.length) },
          { label: "resultaten compleet", waarde: `${compleet}/${standen.length}` },
          {
            label: "bereik",
            waarde: metBereik.length > 0 ? totaalBereik.toLocaleString("nl-NL") : "—",
            uitleg: metBereik.length < standen.length ? `van ${metBereik.length} creators` : undefined,
          },
          {
            label: "weergaven",
            waarde: metViews.length > 0 ? totaalViews.toLocaleString("nl-NL") : "—",
            uitleg: metViews.length < standen.length ? `van ${metViews.length} creators` : undefined,
          },
        ].map((tegel) => (
          <div key={tegel.label} className="card p-4">
            <p className="text-2xl font-semibold">{tegel.waarde}</p>
            <p className="mt-0.5 text-xs text-text-muted">{tegel.label}</p>
            {/* Zeggen waarop een getal gebaseerd is. Een totaal van drie van de
                zes creators is iets anders dan een totaal. */}
            {tegel.uitleg && <p className="text-xs text-text-faint">{tegel.uitleg}</p>}
          </div>
        ))}
      </section>

      {/* ── Creators ──────────────────────────────────────────────────── */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="eyebrow-rule start">Creators</h2>
          <Link href="/creators" className="text-xs text-text-muted hover:text-text">
            Register →
          </Link>
        </div>

        {standen.length === 0 ? (
          <div className="card p-6 text-center">
            <p className="text-sm text-text-muted">
              Nog geen creators gekoppeld. Doe dat in het{" "}
              <Link href="/creators" className="underline">
                creatorregister
              </Link>
              .
            </p>
          </div>
        ) : (
          <div className="card divide-y divide-border">
            {standen.map((stand) => {
              const koppeling = project.creators.find((k) => k.id === stand.creatorCampagneId);
              return (
                <div key={stand.creatorCampagneId} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {STIP[stand.status]} {stand.creatorNaam}
                      </p>
                      <p className="mt-0.5 text-xs text-text-muted">
                        {koppeling?.status}
                        {stand.deliverables > 0 && ` · ${stand.deliverables} afgesproken`}
                        {stand.aantalContentstukken > 0 && ` · ${stand.aantalContentstukken} aangeleverd`}
                        {stand.ontvangenOp
                          ? ` · binnen ${timeAgo(stand.ontvangenOp)}`
                          : stand.gevraagdOp
                            ? ` · gevraagd ${timeAgo(stand.gevraagdOp)}`
                            : " · nog niet gevraagd"}
                      </p>
                      {stand.mist.length > 0 && (
                        <ul className="mt-1.5 space-y-0.5 text-xs text-warn">
                          {stand.mist.map((punt, index) => (
                            <li key={index}>· {punt}</li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {koppeling && koppeling.uploads.length > 0 && (
                      <dl className="flex shrink-0 gap-4 text-xs">
                        {[
                          ["bereik", koppeling.uploads[0].bereik],
                          ["views", koppeling.uploads[0].views],
                          ["interacties", koppeling.uploads[0].likes],
                        ].map(([label, waarde]) => (
                          <div key={String(label)} className="text-right">
                            <dt className="text-text-faint">{label}</dt>
                            <dd className="font-medium">
                              {typeof waarde === "number" ? waarde.toLocaleString("nl-NL") : "—"}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {standen.some((s) => s.status !== "compleet") && (
          <ResultatenKnop
            creators={standen
              .filter((s) => s.status !== "compleet")
              .map((s) => ({ id: s.creatorCampagneId, naam: s.creatorNaam }))}
          />
        )}
      </section>

      {/* ── Wie eraan werkt ───────────────────────────────────────────── */}
      {project.tasks.length > 0 && (
        <section>
          <h2 className="eyebrow-rule start mb-3">
            Wie eraan werkt · {openTaken.length} open van {project.tasks.length}
          </h2>
          <div className="card divide-y divide-border">
            {project.tasks.map((taak) => (
              <Link
                key={taak.id}
                href={`/taken/${taak.id}`}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-hover"
              >
                {taak.agent && <AgentAvatar agent={taak.agent} size="xs" />}
                <span className="min-w-0 flex-1 truncate text-sm">{taak.title}</span>
                <span className="shrink-0 text-xs text-text-faint">{taak.status}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── De briefing ───────────────────────────────────────────────── */}
      {briefing && (
        <details className="card p-4">
          <summary className="cursor-pointer text-sm text-text-muted hover:text-text">
            De briefing zoals de klant hem instuurde
            {project.request?.submittedAt && ` · ${timeAgo(project.request.submittedAt)}`}
          </summary>
          <dl className="mt-4 grid gap-x-8 gap-y-2 border-t border-border pt-4 text-xs sm:grid-cols-2">
            {Object.entries(briefing).map(([sleutel, waarde]) => (
              <div key={sleutel}>
                <dt className="text-text-faint">{sleutel}</dt>
                <dd className="whitespace-pre-wrap">{waarde}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </div>
  );
}
