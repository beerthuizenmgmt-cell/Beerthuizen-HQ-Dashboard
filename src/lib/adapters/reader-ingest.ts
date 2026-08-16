import { db } from "@/lib/db";
import type { AgentAdapter, AdapterConfig, AgentSnapshot } from "./types";

/// Push-koppeling: een reader draait naast de agent en stuurt elke 10–30s
/// snapshots, activiteit en heartbeats hierheen. Werkt ook als de agent achter
/// NAT zit, want al het verkeer is uitgaand.
///
/// Dit is exact het model dat je bestaande ~/.elara-reader al gebruikt.
export const readerIngestAdapter: AgentAdapter = {
  type: "reader_ingest",
  label: "Reader (push)",
  description:
    "Een klein achtergrondproces naast de agent pusht status hierheen. Nodig als de agent zelf niet bereikbaar is van buitenaf.",
  fields: [
    {
      name: "instancePublicId",
      label: "Instance-ID",
      type: "text",
      required: true,
      placeholder: "i_bhmgmt_a1b2c3",
      help: "Maak eerst een instance aan bij Instellingen → Koppelingen; daar krijg je ook de API-sleutel voor de reader.",
    },
    {
      name: "remoteAgentId",
      label: "Agent-ID bij de bron",
      type: "text",
      required: false,
      placeholder: "main",
      help: "Onder welke ID deze agent in de snapshots voorkomt. Leeg laten als er maar één agent is.",
    },
  ],
  capabilities: { send: false, poll: false, receive: true },

  async testConnection(config: AdapterConfig) {
    const instance = await db.instance.findUnique({
      where: { publicId: config.instancePublicId },
      select: { name: true, active: true, lastHeartbeatAt: true, readerVersion: true },
    });

    if (!instance) {
      return {
        ok: false,
        message: `Onbekende instance "${config.instancePublicId}". Maak hem eerst aan bij Instellingen → Koppelingen.`,
      };
    }
    if (!instance.active) {
      return { ok: false, message: `Instance "${instance.name}" staat uit.` };
    }
    if (!instance.lastHeartbeatAt) {
      return {
        ok: false,
        message: `Instance "${instance.name}" bestaat, maar heeft zich nog nooit gemeld. Draait de reader al?`,
      };
    }

    const secondsAgo = Math.round((Date.now() - instance.lastHeartbeatAt.getTime()) / 1000);
    if (secondsAgo > 180) {
      return {
        ok: false,
        message: `Laatste teken van leven was ${formatAgo(secondsAgo)} geleden. De reader lijkt gestopt.`,
      };
    }

    return {
      ok: true,
      message: `Reader ${instance.readerVersion ?? ""} meldt zich, laatste heartbeat ${formatAgo(secondsAgo)} geleden.`.replace(
        /\s+/g,
        " ",
      ),
    };
  },

  async fetchStatus(config: AdapterConfig): Promise<AgentSnapshot> {
    const instance = await db.instance.findUnique({
      where: { publicId: config.instancePublicId },
      select: { lastHeartbeatAt: true },
    });
    const last = instance?.lastHeartbeatAt;
    const fresh = last ? Date.now() - last.getTime() < 3 * 60_000 : false;
    return {
      status: fresh ? "idle" : "offline",
      statusText: fresh ? "Reader actief" : "Geen heartbeat",
      lastActiveAt: last ?? undefined,
    };
  },
};

function formatAgo(seconds: number): string {
  if (seconds < 60) return `${seconds} sec`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  return `${Math.round(seconds / 3600)} uur`;
}
