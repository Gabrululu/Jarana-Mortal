// Lectura de eventos on-chain de la Arena. Así la pantalla gigante "repite" cada pelea:
// la pelea ya ocurrió en una sola transacción; los eventos son la prueba pública.
import { rpc, scValToNative } from "@stellar/stellar-sdk";
import type { RoundLog } from "@cvm/arena-client";
import { config } from "./config";

const server = new rpc.Server(config.rpcUrl);

interface EventMeta {
  id: string;
  ledger: number;
  txHash: string;
  closedAt: string;
}

export type ArenaEvent =
  | (EventMeta & { kind: "registered"; fighter: string; owner: string; name: string; team: string })
  | (EventMeta & { kind: "removed"; fighter: string })
  | (EventMeta & { kind: "round"; fightId: number } & RoundLog)
  | (EventMeta & {
      kind: "fight_ended";
      fightId: number;
      fighter_a: string;
      fighter_b: string;
      winner: string;
      winner_team: string;
      rounds: number;
      knockout: boolean;
    });

/** Nombre del evento on-chain (snake_case del struct `#[contractevent]`) → tipo local. */
const KINDS: Record<string, ArenaEvent["kind"]> = {
  fighter_registered: "registered",
  fighter_removed: "removed",
  round_played: "round",
  fight_ended: "fight_ended",
};

function decode(e: rpc.Api.EventResponse): ArenaEvent | null {
  const [name, key] = e.topic.map((t) => scValToNative(t));
  const kind = KINDS[name as string];
  if (!kind) return null;
  const meta: EventMeta = { id: e.id, ledger: e.ledger, txHash: e.txHash, closedAt: e.ledgerClosedAt };
  const data = scValToNative(e.value) as Record<string, unknown>;
  switch (kind) {
    case "registered":
    case "removed":
      return { ...meta, kind, fighter: key as string, ...data } as ArenaEvent;
    case "round":
    case "fight_ended":
      return { ...meta, kind, fightId: Number(key), ...data } as ArenaEvent;
  }
}

export interface EventPage {
  events: ArenaEvent[];
  cursor: string;
  latestLedger: number;
}

/**
 * Trae eventos de la Arena. La primera vez pasa `startLedger`; luego usa el `cursor`
 * que te devuelve para seguir desde ahí (útil para hacer polling en vivo).
 * Testnet solo guarda ~7 días de eventos.
 */
export async function fetchArenaEvents(from: { startLedger: number } | { cursor: string }, limit = 200): Promise<EventPage> {
  const filters: rpc.Api.EventFilter[] = [{ type: "contract", contractIds: [config.arenaId] }];
  const res = await server.getEvents({ ...from, filters, limit } as rpc.Server.GetEventsRequest);
  return {
    events: res.events.map(decode).filter((e): e is ArenaEvent => e !== null),
    cursor: res.cursor,
    latestLedger: res.latestLedger,
  };
}

export async function latestLedger(): Promise<number> {
  return (await server.getLatestLedger()).sequence;
}

export interface FightReplay {
  fightId: number;
  rounds: Extract<ArenaEvent, { kind: "round" }>[];
  end?: Extract<ArenaEvent, { kind: "fight_ended" }>;
}

/** Agrupa eventos sueltos por pelea, en orden de ronda. */
export function groupFights(events: ArenaEvent[]): Map<number, FightReplay> {
  const fights = new Map<number, FightReplay>();
  for (const e of events) {
    if (e.kind !== "round" && e.kind !== "fight_ended") continue;
    const fight = fights.get(e.fightId) ?? { fightId: e.fightId, rounds: [] };
    if (e.kind === "round") fight.rounds.push(e);
    else fight.end = e;
    fights.set(e.fightId, fight);
  }
  for (const f of fights.values()) f.rounds.sort((a, b) => a.round - b.round);
  return fights;
}

/** Eventos de una pelea concreta, sabiendo en qué ledger ocurrió (lo da `write.fight`). */
export async function fetchFight(fightId: number, ledger: number): Promise<FightReplay | undefined> {
  const { events } = await fetchArenaEvents({ startLedger: ledger });
  return groupFights(events).get(fightId);
}
