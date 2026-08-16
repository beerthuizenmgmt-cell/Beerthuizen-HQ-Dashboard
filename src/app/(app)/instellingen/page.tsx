import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { InstanceManager } from "@/components/instance-manager";
import { isRecent } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();

  const [instances, standup, alerts] = await Promise.all([
    db.instance.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { agents: true } } },
    }),
    db.setting.findUnique({ where: { key: "standup" } }),
    db.setting.findUnique({ where: { key: "alerts" } }),
  ]);

  const standupValue = (standup?.value ?? {}) as {
    time?: string;
    callPrepTime?: string;
    callTime?: string;
    timezone?: string;
    enabled?: boolean;
  };
  const alertsValue = (alerts?.value ?? {}) as { inApp?: boolean; telegram?: boolean; email?: boolean };
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Instellingen</h1>
        <p className="mt-1 text-sm text-text-muted">Koppelingen, overleg en meldingen.</p>
      </header>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Reader-koppelingen</h2>
          <p className="mt-1 text-sm text-text-muted">
            Een reader draait naast een OpenClaw-installatie en pusht status, activiteit en heartbeats
            hierheen. Al het verkeer is uitgaand, dus je hoeft geen poorten open te zetten.
          </p>
        </div>
        <InstanceManager
          instances={instances.map((instance) => ({
            id: instance.id,
            name: instance.name,
            publicId: instance.publicId,
            readerVersion: instance.readerVersion,
            alive: isRecent(instance.lastHeartbeatAt, 3 * 60_000),
            agentCount: instance._count.agents,
          }))}
          appUrl={appUrl}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Ochtendoverleg</h2>
        <div className="card p-4 text-sm">
          <div className="flex items-start justify-between gap-4">
            <dl className="space-y-2">
              <div>
                <dt className="text-xs text-text-faint">Briefing</dt>
                <dd>
                  <strong>{standupValue.time ?? "08:00"}</strong> — het team wordt uitgevraagd, jij kunt
                  het lezen zodra je wakker bent
                </dd>
              </div>
              <div>
                <dt className="text-xs text-text-faint">Voorbereiding call</dt>
                <dd>
                  <strong>{standupValue.callPrepTime ?? "09:45"}</strong> — wie nog niet reageerde krijgt
                  een herinnering
                </dd>
              </div>
              <div>
                <dt className="text-xs text-text-faint">Ochtendcall</dt>
                <dd>
                  <strong>{standupValue.callTime ?? "10:00"}</strong> — alles ligt klaar, jij loopt de
                  vragen af en spreekt je antwoorden in
                </dd>
              </div>
            </dl>
            <span className="chip">{standupValue.enabled === false ? "Uit" : "Aan"}</span>
          </div>
          <p className="mt-3 border-t border-border pt-3 text-xs text-text-faint">
            Tijdzone {standupValue.timezone ?? "Europe/Amsterdam"}. De cron vuurt op meerdere momenten en
            controleert zelf of het hier écht tijd is, zodat de zomertijd niets verschuift.
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Meldingen</h2>
        <div className="card divide-y divide-border text-sm">
          {[
            { label: "In het dashboard", value: alertsValue.inApp !== false },
            { label: "Via Telegram", value: alertsValue.telegram !== false },
            { label: "Via e-mail", value: alertsValue.email === true },
          ].map((row) => (
            <div key={row.label} className="flex items-center justify-between px-4 py-3">
              <span>{row.label}</span>
              <span className="chip">{row.value ? "Aan" : "Uit"}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Account</h2>
        <div className="card p-4 text-sm">
          <p>{user.name}</p>
          <p className="text-text-muted">{user.email}</p>
          <p className="mt-2 text-xs text-text-faint">Rol: {user.role === "owner" ? "eigenaar" : "teamlid"}</p>
        </div>
      </section>
    </div>
  );
}
