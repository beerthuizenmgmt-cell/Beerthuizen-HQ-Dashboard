"use client";

import { useActionState } from "react";
import { addInstance, deleteInstance, type InstanceState } from "@/lib/actions/instances";

const initial: InstanceState = {};

export type InstanceRow = {
  id: string;
  name: string;
  publicId: string;
  readerVersion: string | null;
  /// Op de server bepaald: de browser mag hier niet zelf de klok voor lezen,
  /// dat maakt de render onvoorspelbaar.
  alive: boolean;
  agentCount: number;
};

export function InstanceManager({ instances, appUrl }: { instances: InstanceRow[]; appUrl: string }) {
  const [state, formAction, pending] = useActionState(addInstance, initial);

  return (
    <div className="space-y-4">
      {instances.length > 0 && (
        <div className="card lijst">
          {instances.map((instance) => {
            const alive = instance.alive;
            return (
              <div key={instance.id} className="flex items-center gap-3 px-4 py-3">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: alive ? "var(--ok)" : "var(--text-faint)" }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{instance.name}</p>
                  <p className="truncate font-mono text-xs text-text-faint">{instance.publicId}</p>
                </div>
                <div className="text-right text-xs text-text-muted">
                  <p>{alive ? "live" : "geen heartbeat"}</p>
                  <p className="text-text-faint">
                    {instance.agentCount} agent{instance.agentCount === 1 ? "" : "s"}
                    {instance.readerVersion ? ` · v${instance.readerVersion}` : ""}
                  </p>
                </div>
                <form action={deleteInstance.bind(null, instance.id)}>
                  <button type="submit" className="btn btn-ghost px-2 py-1 text-xs">
                    Verwijderen
                  </button>
                </form>
              </div>
            );
          })}
        </div>
      )}

      {state.created && (
        <div className="card border-ok/40 bg-ok/5 p-4">
          <p className="text-sm font-medium text-ok">Koppeling &ldquo;{state.created.name}&rdquo; aangemaakt</p>
          <p className="mt-1 text-xs text-text-muted">
            Bewaar de sleutel nu — hij is hierna niet meer op te vragen. Start de reader zo:
          </p>
          <pre className="mt-3 overflow-x-auto verdiept p-3 font-mono text-xs leading-relaxed text-text-muted">
{`cd ~/.elara-reader/elara-reader
ELARA_URL=${appUrl} \\
ELARA_INSTANCE_ID=${state.created.publicId} \\
ELARA_API_KEY=${state.created.apiKey} \\
npx tsx src/index.ts`}
          </pre>
        </div>
      )}

      <form action={formAction} className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1">
          <label className="label" htmlFor="instance-name">
            Nieuwe koppeling
          </label>
          <input
            id="instance-name"
            name="name"
            className="input"
            placeholder="Mac Mini kantoor"
            required
          />
        </div>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Bezig…" : "Aanmaken"}
        </button>
      </form>

      {state.error && <p className="text-sm text-danger">{state.error}</p>}
    </div>
  );
}
