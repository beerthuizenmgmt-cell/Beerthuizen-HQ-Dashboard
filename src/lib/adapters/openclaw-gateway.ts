// OpenClaw gateway-adapter.
//
// De gateway spreekt geen REST maar één gemultiplexte WebSocket: HTTP GET op
// /agents levert de Control-UI HTML terug, geen JSON. De handshake hieronder is
// overgenomen uit de werkende reader in ~/.elara-reader/elara-reader/src/openclaw.ts
// — protocolonderhandeling 3..4, connect-challenge, token-auth als
// `gateway-client/backend`.
//
// Twee dingen zijn toegevoegd ten opzichte van de reader:
//   1. We vragen ook `operator.write`, zodat we opdrachten kunnen sturen.
//   2. De verzendmethode wordt niet gegokt maar uitgelezen uit `features.methods`
//      in de hello-ok payload. Gateway-builds verschillen daarin, en een
//      verkeerd gegokte methodenaam levert een onbegrijpelijke fout op.

import type { AgentAdapter, AdapterConfig, AgentSnapshot } from "./types";
import { readableError } from "./types";

const TIMEOUT_MS = 12_000;

/// Kandidaten in volgorde van voorkeur; de eerste die de gateway aanbiedt wint.
const SEND_METHOD_CANDIDATES = [
  "message.send",
  "chat.send",
  "session.send",
  "sessions.send",
  "agent.message",
  "agents.message",
  "prompt",
];

type Frame =
  | { type: "req"; id: string; method: string; params: unknown }
  | { type: "res"; id: string; ok: boolean; payload?: unknown; error?: { code?: string; message?: string } }
  | { type: "event"; event: string; payload?: unknown };

export type GatewayHello = {
  scopes: string[];
  methods: string[];
  runtimeVersion?: string;
};

class GatewayConnection {
  private ws: WebSocket | null = null;
  private pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private nextId = 1;
  hello: GatewayHello = { scopes: [], methods: [] };

  constructor(
    private url: string,
    private token: string | null,
  ) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      let connectId: string | null = null;

      const ws = new WebSocket(toWsUrl(this.url));
      this.ws = ws;

      const fail = (message: string) => {
        if (settled) return;
        settled = true;
        try {
          ws.close();
        } catch {
          /* al dicht */
        }
        this.ws = null;
        reject(new Error(message));
      };

      const openTimer = setTimeout(
        () => fail(`Time-out bij verbinden met ${this.url}. Draait de gateway en is hij bereikbaar vanaf deze server?`),
        TIMEOUT_MS,
      );

      const sendConnect = () => {
        connectId = this.makeId();
        ws.send(
          JSON.stringify({
            type: "req",
            id: connectId,
            method: "connect",
            params: {
              // 2026.5.x sprak protocol 3, 2026.6.x bumpte naar 4 en weigert
              // clients met maxProtocol < 4. Range aanbieden houdt beide werkend.
              minProtocol: 3,
              maxProtocol: 4,
              client: {
                id: "gateway-client",
                displayName: "BHMGMT HQ",
                version: "1.0.0",
                platform: "linux",
                mode: "backend",
              },
              role: "operator",
              scopes: ["operator.read", "operator.write"],
              locale: "nl-NL",
              userAgent: "bhmgmt-hq/1.0.0",
              ...(this.token ? { auth: { token: this.token } } : {}),
            },
          }),
        );
      };

      // Sommige builds sturen eerst connect.challenge, oudere verwachten dat wij
      // uit onszelf beginnen. Na een korte gratieperiode alsnog proactief sturen.
      const proactiveTimer = setTimeout(() => {
        if (!settled && !connectId && ws.readyState === 1) sendConnect();
      }, 200);

      ws.addEventListener("message", (event: MessageEvent) => {
        let frame: Frame;
        try {
          const text =
            typeof event.data === "string" ? event.data : new TextDecoder().decode(event.data as ArrayBuffer);
          frame = JSON.parse(text) as Frame;
        } catch {
          return;
        }

        if (frame.type === "event" && frame.event === "connect.challenge") {
          if (!connectId) sendConnect();
          return;
        }

        if (frame.type === "res" && connectId && frame.id === connectId) {
          clearTimeout(openTimer);
          clearTimeout(proactiveTimer);

          if (!frame.ok) {
            const message = frame.error?.message ?? "onbekende reden";
            const isAuth = frame.error?.code === "AUTH_FAILED" || /auth/i.test(message);
            fail(
              isAuth
                ? `De gateway weigerde het token: ${message}. Controleer het gateway-token uit openclaw.json (gateway.auth.token).`
                : `De gateway weigerde de verbinding: ${message}`,
            );
            return;
          }

          const payload = frame.payload as
            | { auth?: { scopes?: string[] }; features?: { methods?: string[] }; runtimeVersion?: string }
            | undefined;
          this.hello = {
            scopes: payload?.auth?.scopes ?? [],
            methods: payload?.features?.methods ?? [],
            runtimeVersion: payload?.runtimeVersion,
          };

          if (!this.hello.scopes.includes("operator.read")) {
            fail(
              `Verbonden, maar zonder leesrechten (scopes: ${this.hello.scopes.join(", ") || "geen"}). Vul een geldig gateway-token in.`,
            );
            return;
          }

          settled = true;
          resolve();
          return;
        }

        if (frame.type === "res") {
          const call = this.pending.get(frame.id);
          if (!call) return;
          this.pending.delete(frame.id);
          clearTimeout(call.timer);
          if (frame.ok) call.resolve(frame.payload ?? {});
          else call.reject(new Error(frame.error?.message ?? "de gateway gaf een fout terug"));
        }
      });

      ws.addEventListener("close", (event: CloseEvent) => {
        clearTimeout(openTimer);
        clearTimeout(proactiveTimer);
        for (const [, call] of this.pending) {
          clearTimeout(call.timer);
          call.reject(new Error(`verbinding verbroken (${event.code})`));
        }
        this.pending.clear();
        this.ws = null;
        if (!settled) {
          settled = true;
          // 1006 = socket dicht zonder afsluitbericht: in de praktijk bijna
          // altijd "er luistert niets op dit adres".
          reject(
            new Error(
              event.code === 1006
                ? `Geen verbinding mogelijk met ${this.url}. Draait de gateway op dit adres en is hij bereikbaar vanaf deze server?`
                : `De gateway verbrak de verbinding (${event.code}${event.reason ? `: ${event.reason}` : ""}).`,
            ),
          );
        }
      });

      ws.addEventListener("error", () => {
        // 'close' volgt en vertaalt dit naar een nette afwijzing.
      });
    });
  }

  call<T>(method: string, params: unknown = {}): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== 1) {
        reject(new Error(`${method}: geen open verbinding`));
        return;
      }
      const id = this.makeId();
      const timer = setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(`${method} gaf geen antwoord binnen ${TIMEOUT_MS}ms`));
      }, TIMEOUT_MS);
      this.pending.set(id, { resolve: (value) => resolve(value as T), reject, timer });
      this.ws.send(JSON.stringify({ type: "req", id, method, params }));
    });
  }

  /// Welke verzendmethode biedt deze gateway aan? Null als er geen bekende is.
  sendMethod(): string | null {
    if (this.hello.methods.length === 0) return null;
    return SEND_METHOD_CANDIDATES.find((m) => this.hello.methods.includes(m)) ?? null;
  }

  close(): void {
    try {
      this.ws?.close();
    } catch {
      /* al dicht */
    }
    this.ws = null;
  }

  private makeId(): string {
    return `r${Date.now().toString(36)}${(this.nextId++).toString(36)}`;
  }
}

function toWsUrl(url: string): string {
  const trimmed = url.trim().replace(/\/$/, "");
  if (trimmed.startsWith("ws://") || trimmed.startsWith("wss://")) return trimmed;
  if (trimmed.startsWith("https://")) return `wss://${trimmed.slice(8)}`;
  if (trimmed.startsWith("http://")) return `ws://${trimmed.slice(7)}`;
  return `ws://${trimmed}`;
}

/// Opent een verbinding, doet er iets mee en sluit hem altijd weer.
async function withConnection<T>(
  config: AdapterConfig,
  fn: (connection: GatewayConnection) => Promise<T>,
): Promise<T> {
  const connection = new GatewayConnection(config.url, config.token || null);
  await connection.connect();
  try {
    return await fn(connection);
  } finally {
    connection.close();
  }
}

export const openclawGatewayAdapter: AgentAdapter = {
  type: "openclaw_gateway",
  label: "OpenClaw gateway",
  description:
    "Rechtstreekse verbinding met de gateway van de agent. Rijkst: status, sessies, skills én aansturing over één verbinding.",
  fields: [
    {
      name: "url",
      label: "Gateway-URL",
      type: "url",
      required: true,
      placeholder: "ws://127.0.0.1:18799",
      help: "Poort staat in openclaw.json onder gateway.port. Bij Clawy krijg je een wss://-adres.",
    },
    {
      name: "token",
      label: "Gateway-token",
      type: "password",
      required: false,
      secret: true,
      help: "Staat in openclaw.json onder gateway.auth.token. Leeg laten als de gateway geen auth vraagt.",
    },
    {
      name: "agentId",
      label: "Agent-ID",
      type: "text",
      required: false,
      placeholder: "main",
      help: "Welke agent binnen deze gateway. Leeg laten voor de standaardagent.",
    },
  ],
  capabilities: { send: true, poll: true, receive: false },

  async testConnection(config: AdapterConfig) {
    try {
      return await withConnection(config, async (connection) => {
        const agents = await connection
          .call<{ agents?: { id: string }[] }>("agents.list")
          .catch(() => ({ agents: [] as { id: string }[] }));

        const ids = agents.agents?.map((a) => a.id) ?? [];
        const canWrite = connection.hello.scopes.includes("operator.write");
        const sendMethod = connection.sendMethod();

        const parts = [`Verbonden met de gateway`];
        if (connection.hello.runtimeVersion) parts.push(`OpenClaw ${connection.hello.runtimeVersion}`);
        if (ids.length) parts.push(`${ids.length} agent(s): ${ids.slice(0, 5).join(", ")}`);

        if (config.agentId && ids.length && !ids.includes(config.agentId)) {
          return {
            ok: false,
            message: `${parts.join(" · ")}. Maar agent-ID "${config.agentId}" bestaat daar niet. Beschikbaar: ${ids.join(", ")}.`,
          };
        }

        if (!canWrite || !sendMethod) {
          // Lezen werkt, sturen niet — dat moet je weten vóórdat je een taak
          // toewijst, niet erna.
          return {
            ok: true,
            message: `${parts.join(" · ")}. Let op: alleen lezen mogelijk${
              !canWrite ? " (token heeft geen operator.write)" : " (deze gateway biedt geen verzendmethode)"
            }, dus taken uitbesteden werkt nog niet.`,
            details: { scopes: connection.hello.scopes, sendMethod, readOnly: true },
          };
        }

        return {
          ok: true,
          message: `${parts.join(" · ")}. Lezen én aansturen werkt.`,
          details: { scopes: connection.hello.scopes, sendMethod, agents: ids },
        };
      });
    } catch (error) {
      return { ok: false, message: readableError(error) };
    }
  },

  async fetchStatus(config: AdapterConfig): Promise<AgentSnapshot> {
    try {
      return await withConnection(config, async (connection) => {
        const [health, sessions] = await Promise.all([
          connection
            .call<{ agents?: { agentId: string; sessions?: { count?: number; recent?: { at?: string }[] } }[] }>("health")
            .catch(() => null),
          connection
            .call<{ defaults?: { model?: string }; sessions?: { agentId?: string; lastActivityAt?: string }[] }>("sessions.list")
            .catch(() => null),
        ]);

        const agentId = config.agentId || health?.agents?.[0]?.agentId;
        const forAgent = health?.agents?.find((a) => a.agentId === agentId) ?? health?.agents?.[0];
        const sessionRow = sessions?.sessions?.find((s) => s.agentId === agentId);

        const timestamps = [
          ...(forAgent?.sessions?.recent ?? []).map((r) => r.at).filter(Boolean),
          sessionRow?.lastActivityAt,
        ]
          .map((value) => (value ? Date.parse(value) : NaN))
          .filter((value) => Number.isFinite(value));

        const lastActiveAt = timestamps.length ? new Date(Math.max(...timestamps)) : undefined;
        const isFresh = lastActiveAt ? Date.now() - lastActiveAt.getTime() < 5 * 60_000 : false;

        return {
          status: isFresh ? "active" : "idle",
          statusText: forAgent?.sessions?.count ? `${forAgent.sessions.count} sessie(s)` : undefined,
          model: sessions?.defaults?.model,
          lastActiveAt,
        };
      });
    } catch {
      return { status: "offline", statusText: "Gateway niet bereikbaar" };
    }
  },

  async sendMessage(config: AdapterConfig, text: string) {
    try {
      return await withConnection(config, async (connection) => {
        const method = connection.sendMethod();
        if (!method) {
          return {
            ok: false,
            error:
              "Deze gateway biedt geen bekende verzendmethode aan. Koppel de agent via Telegram, of stuur me de methodelijst uit de gateway zodat ik hem kan toevoegen.",
          };
        }
        const result = await connection.call<{ id?: string; messageId?: string }>(method, {
          ...(config.agentId ? { agentId: config.agentId } : {}),
          text,
          message: text,
        });
        return { ok: true, externalId: result?.id ?? result?.messageId };
      });
    } catch (error) {
      return { ok: false, error: readableError(error) };
    }
  },
};
