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

  const standupValue = (standup?.value ?? {}) as { time?: string; timezone?: string; enabled?: boolean };
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
          <div className="flex items-center justify-between gap-4">
            <div>
              <p>
                Elke werkdag om <strong>{standupValue.time ?? "08:00"}</strong> ({standupValue.timezone ?? "Europe/Amsterdam"})
              </p>
              <p className="mt-1 text-xs text-text-muted">
                Het dashboard vraagt elke agent om zijn standup en zet er een samenvatting boven.
              </p>
            </div>
            <span className="chip">{standupValue.enabled === false ? "Uit" : "Aan"}</span>
          </div>
          <p className="mt-3 border-t border-border pt-3 text-xs text-text-faint">
            Het overlegscherm zelf komt in fase 3. De instelling staat er alvast, zodat je hem straks
            alleen nog hoeft aan te zetten.
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
