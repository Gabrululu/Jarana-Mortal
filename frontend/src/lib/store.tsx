// Estado compartido de la Arena: inscritos, marcador y el feed de eventos on-chain.
import {
  fetchArenaEvents,
  groupFights,
  latestLedger,
  read,
  type ArenaEvent,
  type FightReplay,
  type FighterRecord,
  type Scoreboard,
  type Signer,
} from "@cvm/game";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

const POLL_MS = 4000;
/** Al abrir la página traemos ~2.7 h de historia (2000 ledgers × ~5 s). */
const HISTORY_LEDGERS = 2000;

interface ArenaState {
  roster: FighterRecord[];
  loaded: boolean;
  rosterById: Map<string, FighterRecord>;
  score: Scoreboard | null;
  fights: Map<number, FightReplay>;
  /** Peleas terminadas que llegaron después de abrir la página, en orden. */
  liveFightIds: number[];
  feed: ArenaEvent[];
  online: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  signer: Signer | null;
  setSigner: (s: Signer | null) => void;
}

const Ctx = createContext<ArenaState | null>(null);

export function ArenaProvider({ children }: { children: ReactNode }) {
  const [roster, setRoster] = useState<FighterRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [score, setScore] = useState<Scoreboard | null>(null);
  const [events, setEvents] = useState<ArenaEvent[]>([]);
  const [liveFightIds, setLive] = useState<number[]>([]);
  const [online, setOnline] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signer, setSigner] = useState<Signer | null>(null);
  const cursor = useRef<string | null>(null);
  const seen = useRef(new Set<string>());

  const refresh = useCallback(async () => {
    const [f, s] = await Promise.all([read.fighters(), read.scoreboard()]);
    if (f.ok) setRoster(f.value);
    if (s.ok) setScore(s.value);
    setError(f.ok ? null : f.error);
    setLoaded(true);
  }, []);

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;

    const ingest = (batch: ArenaEvent[], live: boolean) => {
      const fresh = batch.filter((e) => !seen.current.has(e.id));
      fresh.forEach((e) => seen.current.add(e.id));
      if (!fresh.length) return;
      setEvents((prev) => [...prev, ...fresh]);
      if (live) {
        const ended = fresh.filter((e) => e.kind === "fight_ended").map((e) => (e as { fightId: number }).fightId);
        if (ended.length) setLive((prev) => [...prev, ...ended]);
        if (fresh.some((e) => e.kind !== "round")) refresh();
      }
    };

    const tick = async (first: boolean) => {
      try {
        if (!cursor.current) {
          const start = Math.max(1, (await latestLedger()) - HISTORY_LEDGERS);
          const page = await fetchArenaEvents({ startLedger: start });
          ingest(page.events, false);
          cursor.current = page.cursor;
        }
        // Drenamos páginas hasta ponernos al día
        for (let i = 0; i < 20; i++) {
          const page = await fetchArenaEvents({ cursor: cursor.current! });
          ingest(page.events, !first);
          cursor.current = page.cursor;
          if (page.events.length < 200) break;
        }
        setOnline(true);
      } catch {
        setOnline(false);
      }
      if (!stop) timer = setTimeout(() => tick(false), POLL_MS);
    };

    refresh();
    tick(true);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [refresh]);

  const value = useMemo<ArenaState>(
    () => ({
      roster,
      loaded,
      rosterById: new Map(roster.map((r) => [r.fighter, r])),
      score,
      fights: groupFights(events),
      liveFightIds,
      feed: events,
      online,
      error,
      refresh,
      signer,
      setSigner,
    }),
    [roster, loaded, score, events, liveFightIds, online, error, refresh, signer],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useArena() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useArena fuera de ArenaProvider");
  return v;
}
