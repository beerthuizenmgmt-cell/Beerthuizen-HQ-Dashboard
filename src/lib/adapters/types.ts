import type { AdapterType, AgentStatus } from "@/generated/prisma/enums";

/// Eén veld in de "agent toevoegen"-wizard. De adapter beschrijft zelf welke
/// gegevens hij nodig heeft, zodat het formulier meegroeit met nieuwe
/// koppeltypes zonder dat de UI aangepast hoeft te worden.
export type AdapterField = {
  name: string;
  label: string;
  type: "text" | "password" | "url" | "select";
  required: boolean;
  placeholder?: string;
  help?: string;
  /// Waarde wordt versleuteld opgeslagen en nooit teruggestuurd naar de browser.
  secret?: boolean;
  options?: { value: string; label: string }[];
};

export type AdapterConfig = Record<string, string>;

export type ConnectionTest = {
  ok: boolean;
  /// Leesbare uitleg — dit komt letterlijk in de UI te staan, dus geen
  /// stacktraces of ruwe foutcodes.
  message: string;
  details?: Record<string, unknown>;
};

export type AgentSnapshot = {
  status: AgentStatus;
  statusText?: string;
  model?: string;
  lastActiveAt?: Date;
  channels?: string[];
};

export type SendResult = {
  ok: boolean;
  externalId?: string;
  error?: string;
};

export interface AgentAdapter {
  type: AdapterType;
  label: string;
  /// Korte uitleg in de wizard: wanneer kies je dit koppeltype?
  description: string;
  fields: AdapterField[];
  capabilities: {
    /// Kan het dashboard opdrachten naar de agent sturen?
    send: boolean;
    /// Kan het dashboard actief status ophalen?
    poll: boolean;
    /// Komt er data binnen via webhook of push?
    receive: boolean;
  };
  testConnection(config: AdapterConfig): Promise<ConnectionTest>;
  fetchStatus?(config: AdapterConfig): Promise<AgentSnapshot>;
  sendMessage?(config: AdapterConfig, text: string): Promise<SendResult>;
}

/// Zet onbekende fouten om in iets dat een mens kan lezen.
export function readableError(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "AbortError" || /timed? ?out/i.test(error.message)) {
      return "Time-out — de agent reageerde niet op tijd. Draait hij en klopt de URL?";
    }
    if (/ECONNREFUSED|fetch failed|unreachable/i.test(error.message)) {
      return "Geen verbinding mogelijk. Controleer de URL en of de agent bereikbaar is vanaf deze server.";
    }
    return error.message;
  }
  return String(error);
}
