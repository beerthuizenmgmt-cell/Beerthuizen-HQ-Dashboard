"use client";

import { useState, useTransition } from "react";
import { testConnectionAction } from "@/lib/actions/agents";
import type { ConnectionTest } from "@/lib/adapters/types";

export function ConnectionTestButton({ agentId }: { agentId: string }) {
  const [result, setResult] = useState<ConnectionTest | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      setResult(await testConnectionAction(agentId));
    });
  }

  return (
    <div className="space-y-3">
      <button type="button" onClick={run} className="btn btn-ghost" disabled={pending}>
        {pending ? "Verbinding testen…" : "Verbinding testen"}
      </button>

      {result && (
        <p
          className={`rounded-lg border px-3 py-2 text-sm ${
            result.ok
              ? "border-ok/40 bg-ok/10 text-ok"
              : "border-danger/40 bg-danger/10 text-danger"
          }`}
        >
          {result.ok ? "✓ " : "✕ "}
          {result.message}
        </p>
      )}
    </div>
  );
}
