import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { AgentAvatar } from "@/components/agent-avatar";
import { formatDate, isRecent, isVerlopen } from "@/lib/format";

export const dynamic = "force-dynamic";

// Het onderzoeksarchief.
//
// Wat het bureau al weet, met de vraag erbij en de bronnen eronder. Zonder dit
// begint elk onderzoek bij nul en wordt dezelfde vraag drie keer uitgezocht.

const ONDERWERP_LABELS: Record<string, string> = {
  markt: "Markt",
  merk: "Merk",
  creator: "Creator",
  concurrent: "Concurrent",
  trend: "Trend",
  doelgroep: "Doelgroep",
  prospect: "Prospect",
  overig: "Overig",
};

type Bron = { titel?: string; url?: string; geraadpleegdOp?: string };

export default async function KennisPage() {
  await requireUser();

  const entries = await db.researchEntry.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { agent: { select: { name: true, emoji: true, color: true, avatarUrl: true } } },
  });

  const perOnderwerp = new Map<string, number>();
  for (const entry of entries) {
    perOnderwerp.set(entry.subject, (perOnderwerp.get(entry.subject) ?? 0) + 1);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Wat we al weten</h1>
        <p className="mt-2 max-w-2xl text-sm text-text-muted">
          Het onderzoeksarchief van het bureau. Elke agent kan hierin zoeken voordat hij iets laat
          uitzoeken — zo hoeft dezelfde vraag niet twee keer beantwoord te worden.
        </p>
      </header>

      {entries.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-sm text-text-muted">
            Nog geen onderzoek vastgelegd. Zodra Stefano zijn eerste vraag uitzoekt komt het hier te
            staan, met de bronnen erbij.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {[...perOnderwerp.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([onderwerp, aantal]) => (
                <span key={onderwerp} className="chip text-xs">
                  {ONDERWERP_LABELS[onderwerp] ?? onderwerp} · {aantal}
                </span>
              ))}
          </div>

          <div className="space-y-4">
            {entries.map((entry) => {
              const verouderd = isVerlopen(entry.staleAfter);
              const bronnen = (entry.sources as Bron[] | null) ?? [];

              return (
                <article key={entry.id} className="card p-5">
                  <div className="flex flex-wrap items-start gap-3">
                    <AgentAvatar agent={entry.agent} size="sm" />
                    <div className="min-w-0 flex-1">
                      <h2 className="text-sm font-semibold">{entry.question}</h2>
                      <p className="mt-0.5 text-xs text-text-faint">
                        {entry.agent.name} · {formatDate(entry.createdAt)}
                        {entry.about && ` · over ${entry.about}`}
                        {isRecent(entry.createdAt, 24 * 60 * 60_000) && " · nieuw"}
                      </p>
                    </div>
                    <span className="chip text-xs">{ONDERWERP_LABELS[entry.subject] ?? entry.subject}</span>
                  </div>

                  {verouderd && (
                    <p className="mt-3 rounded-lg border border-warn/40 bg-warn/5 px-3 py-2 text-xs text-warn">
                      Deze informatie is verlopen op {formatDate(entry.staleAfter!)} en moet opnieuw
                      gecontroleerd worden voordat er een besluit op genomen wordt.
                    </p>
                  )}

                  <div className="mt-4 space-y-3 text-sm">
                    <div>
                      <p className="eyebrow mb-1">Bevindingen</p>
                      <p className="whitespace-pre-wrap text-text-muted">{entry.findings}</p>
                    </div>

                    {entry.insight && (
                      <div>
                        <p className="eyebrow mb-1">Inzicht</p>
                        <p className="whitespace-pre-wrap text-text-muted">{entry.insight}</p>
                      </div>
                    )}

                    <div className="grid gap-3 sm:grid-cols-2">
                      {entry.risks && (
                        <div>
                          <p className="eyebrow mb-1 text-warn">Risico&apos;s</p>
                          <p className="whitespace-pre-wrap text-text-muted">{entry.risks}</p>
                        </div>
                      )}
                      {entry.opportunities && (
                        <div>
                          <p className="eyebrow mb-1 text-success">Kansen</p>
                          <p className="whitespace-pre-wrap text-text-muted">{entry.opportunities}</p>
                        </div>
                      )}
                    </div>

                    {entry.advice && (
                      <div className="verdiept p-3">
                        <p className="eyebrow mb-1">Advies</p>
                        <p className="whitespace-pre-wrap">{entry.advice}</p>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 border-t border-border pt-3">
                    <p className="eyebrow mb-1">Bronnen</p>
                    {bronnen.length === 0 ? (
                      <p className="text-xs text-danger">
                        Geen bronnen vastgelegd — behandel dit als een observatie, niet als een feit.
                      </p>
                    ) : (
                      <ul className="space-y-1 text-xs text-text-muted">
                        {bronnen.map((bron, index) => (
                          <li key={index}>
                            {bron.url ? (
                              <a
                                href={bron.url}
                                target="_blank"
                                rel="noreferrer noopener"
                                className="underline hover:text-text"
                              >
                                {bron.titel || bron.url}
                              </a>
                            ) : (
                              (bron.titel ?? "onbekende bron")
                            )}
                            {bron.geraadpleegdOp && ` · geraadpleegd ${bron.geraadpleegdOp}`}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
