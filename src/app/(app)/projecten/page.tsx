import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { AgentAvatar } from "@/components/agent-avatar";
import { AanvulKnop } from "@/components/aanvul-knop";
import { formatDate, timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";

// Projecten: wat er binnenkomt en wat er nog aan ontbreekt.
//
// Het belangrijkste op dit scherm is niet wat er staat, maar wat er níét staat.
// Een aanvraag die compleet lijkt maar geen budget of doelgroep heeft, kost
// later meer tijd dan hij nu bespaart.

const STATUS_LABELS: Record<string, string> = {
  nieuw: "Nieuw",
  info_nodig: "Aanvullende informatie nodig",
  in_voorbereiding: "In voorbereiding",
  loopt: "Loopt",
  afgerond: "Afgerond",
  afgewezen: "Afgewezen",
};

const STATUS_STIJL: Record<string, string> = {
  nieuw: "border-accent/40 text-accent",
  info_nodig: "border-warn/40 text-warn",
  in_voorbereiding: "border-warn/40 text-warn",
  loopt: "border-success/40 text-success",
  afgerond: "text-text-faint",
  afgewezen: "text-text-faint",
};

export default async function ProjectenPagina() {
  await requireUser();

  const projecten = await db.project.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      client: { select: { name: true } },
      request: { select: { submission: true, submittedAt: true } },
      tasks: {
        include: { agent: { select: { name: true, emoji: true, color: true, avatarUrl: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Projecten</h1>
        <p className="mt-2 max-w-2xl text-sm text-text-muted">
          Aanvragen die via het klantportaal binnenkomen, met wie eraan werkt en wat er nog ontbreekt.
        </p>
      </header>

      {projecten.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-sm text-text-muted">
            Nog geen projecten. Stuur een klant een campagnebriefing via{" "}
            <Link href="/klanten" className="underline">
              Klanten
            </Link>
            , dan verschijnt de aanvraag hier.
          </p>
        </div>
      ) : (
        projecten.map((project) => {
          const briefing = (project.request?.submission as Record<string, string> | null) ?? null;

          return (
            <article key={project.id} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold">{project.name}</h2>
                    <span className={`chip text-xs ${STATUS_STIJL[project.status] ?? ""}`}>
                      {STATUS_LABELS[project.status] ?? project.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-text-muted">
                    {project.client?.name ?? "klant onbekend"}
                    {project.request?.submittedAt && ` · aangeleverd ${timeAgo(project.request.submittedAt)}`}
                    {project.deadline && ` · voorstel voor ${formatDate(project.deadline)}`}
                  </p>
                </div>

                <code className="shrink-0 rounded bg-bg-elevated px-2 py-1 text-xs text-text-faint">
                  {project.id.slice(-8).toUpperCase()}
                </code>
              </div>

              {project.missingInfo.length > 0 && (
                <div className="mt-4 rounded-lg border border-warn/40 bg-warn/5 p-3">
                  <p className="text-xs font-semibold text-warn">
                    Aanvullende informatie nodig — {project.missingInfo.length} punt
                    {project.missingInfo.length === 1 ? "" : "en"}
                  </p>
                  <ul className="mt-2 space-y-1 text-xs text-text-muted">
                    {project.missingInfo.map((punt, index) => (
                      <li key={index}>· {punt}</li>
                    ))}
                  </ul>
                  <AanvulKnop projectId={project.id} />
                </div>
              )}

              {project.tasks.length > 0 && (
                <div className="mt-4">
                  <p className="eyebrow mb-2">Wie eraan werkt</p>
                  <ul className="space-y-2">
                    {project.tasks.map((taak) => (
                      <li key={taak.id} className="flex items-center gap-3 text-sm">
                        {taak.agent && <AgentAvatar agent={taak.agent} size="sm" />}
                        <Link href={`/taken/${taak.id}`} className="min-w-0 flex-1 hover:underline">
                          {taak.title}
                        </Link>
                        <span className="text-xs text-text-faint">{taak.status}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {briefing && (
                <details className="mt-4 border-t border-border pt-3">
                  <summary className="cursor-pointer text-xs text-text-muted hover:text-text">
                    De volledige briefing zoals de klant hem instuurde
                  </summary>
                  <dl className="mt-3 grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
                    {Object.entries(briefing).map(([sleutel, waarde]) => (
                      <div key={sleutel}>
                        <dt className="text-text-faint">{sleutel}</dt>
                        <dd className="whitespace-pre-wrap">{waarde}</dd>
                      </div>
                    ))}
                  </dl>
                </details>
              )}
            </article>
          );
        })
      )}
    </div>
  );
}
