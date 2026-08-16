import type { AgentAdapter } from "./types";

/// Geen technische koppeling: de agent staat in het overzicht, maar het
/// dashboard praat niet met hem. Handig om vast te leggen dat hij bestaat
/// terwijl je de koppeling nog regelt — je kunt later omzetten zonder de agent
/// opnieuw aan te maken.
export const manualAdapter: AgentAdapter = {
  type: "manual",
  label: "Nog niet koppelen",
  description:
    "Zet de agent alvast in het overzicht zonder verbinding. Je houdt status en notities zelf bij en koppelt later.",
  fields: [
    {
      name: "note",
      label: "Notitie",
      type: "text",
      required: false,
      placeholder: "Wacht op gateway-token van Clawy",
      help: "Voor jezelf: waarom is deze agent nog niet gekoppeld?",
    },
  ],
  capabilities: { send: false, poll: false, receive: false },

  async testConnection() {
    return {
      ok: true,
      message: "Geen koppeling ingesteld — deze agent staat alleen in het overzicht.",
    };
  },
};
