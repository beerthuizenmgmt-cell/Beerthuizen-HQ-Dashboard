"use client";

import { useState } from "react";
import { useActie } from "@/components/use-actie";
import { ActieFout } from "@/components/actie-fout";
import { bewaarBureauSleutels, bewaarToolSleutels } from "@/lib/actions/integrations";

// Waar je de sleutel van een koppeling invult.
//
// Dit ontbrak. Je kon een tool wel aan een agent hangen, maar de sleutel nergens
// invullen — dus stonden er zesentachtig koppelingen zonder één werkende
// verbinding, en niemand die kon zien waaróm ze niets deden.
//
// Wat er staat tonen we nooit terug. Een wachtwoordveld met de echte waarde erin
// is met één klik in de broncode van de pagina te lezen; daarom staat er alleen
// óf het ingevuld is. Laat je een veld leeg, dan blijft staan wat er stond.

export type ToolVeld = {
  name: string;
  label: string;
  type: string;
  required?: boolean;
  secret?: boolean;
  placeholder?: string;
};

export function ToolSleutels({
  agentId,
  agentNaam,
  toolKey,
  velden,
  ingevuld,
}: {
  /// Leeg voor de sleutel van het bureau: die geldt voor iedereen die deze
  /// koppeling heeft. Vul je hem per agent in, dan wint die van de bureausleutel
  /// — bedoeld voor koppelingen waar ieder een eigen account heeft.
  agentId?: string;
  agentNaam?: string;
  toolKey: string;
  velden: ToolVeld[];
  ingevuld: string[];
}) {
  const { doe, fout, bezig } = useActie();
  const [open, setOpen] = useState(false);
  const [waarden, setWaarden] = useState<Record<string, string>>({});
  const [gelukt, setGelukt] = useState<string | null>(null);

  if (velden.length === 0) return null;

  const compleet = velden.filter((v) => v.required).every((v) => ingevuld.includes(v.name));

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs underline"
        style={{ color: compleet ? "var(--ok)" : "var(--warn)" }}
      >
        {agentId
          ? compleet
            ? "eigen sleutel"
            : "eigen sleutel toevoegen"
          : compleet
            ? "sleutel staat erin"
            : "sleutel invullen"}
      </button>
    );
  }

  return (
    <div className="w-full rounded-lg border border-border bg-bg p-3">
      <p className="mb-2 text-xs text-text-muted">
        {agentId
          ? `Een eigen sleutel voor ${agentNaam}, die van het bureau overschrijft. Alleen nodig als deze agent een eigen account heeft.`
          : "Eén keer invullen; elke agent die deze koppeling heeft, gebruikt hem. Wat je hier invult wordt versleuteld opgeslagen en nooit meer getoond."}
      </p>

      <div className="space-y-2">
        {velden.map((veld) => (
          <label key={veld.name} className="block">
            <span className="mb-1 block text-[11px] text-text-faint">
              {veld.label}
              {veld.required ? " *" : ""}
              {ingevuld.includes(veld.name) && (
                <span className="ml-2 text-ok">staat er al — leeg laten om te behouden</span>
              )}
            </span>
            <input
              type={veld.secret ? "password" : "text"}
              className="input text-sm"
              placeholder={veld.placeholder ?? (ingevuld.includes(veld.name) ? "••••••••" : "")}
              autoComplete="off"
              value={waarden[veld.name] ?? ""}
              onChange={(e) => setWaarden((w) => ({ ...w, [veld.name]: e.target.value }))}
            />
          </label>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          className="btn btn-primary text-xs"
          disabled={bezig}
          onClick={() =>
            doe(async () => {
              const uit = agentId
                ? await bewaarToolSleutels(agentId, toolKey, waarden)
                : await bewaarBureauSleutels(toolKey, waarden);
              if (uit.error) throw new Error(uit.error);
              setGelukt(uit.ok ?? "Opgeslagen.");
              setWaarden({});
              setOpen(false);
            })
          }
        >
          {bezig ? "Bezig…" : "Opslaan"}
        </button>
        <button
          type="button"
          className="text-xs text-text-faint underline"
          onClick={() => {
            setOpen(false);
            setWaarden({});
          }}
        >
          annuleren
        </button>
      </div>

      {gelukt && <p className="mt-2 text-xs text-ok">{gelukt}</p>}
      <ActieFout fout={fout} />
    </div>
  );
}
