import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { adapterCatalog } from "@/lib/adapters";
import { AgentForm } from "@/components/agent-form";

export default async function NewAgentPage() {
  await requireUser();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <Link href="/agents" className="text-xs text-text-muted hover:text-text">
          ← Agents
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">Agent toevoegen</h1>
        <p className="mt-1 text-sm text-text-muted">
          Na het opslaan kun je de verbinding testen, zodat je meteen weet of het werkt.
        </p>
      </header>

      <div className="card p-6">
        <AgentForm catalog={adapterCatalog()} submitLabel="Agent aanmaken" />
      </div>
    </div>
  );
}
