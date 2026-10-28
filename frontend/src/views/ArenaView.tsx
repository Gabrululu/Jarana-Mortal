import { config, TEAMS, write, type FightReplay } from "@cvm/game";
import { Dices, Gauge, Maximize, Play, Swords, Wallet } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { BattleScene } from "../battle/BattleScene";
import { fromReplay, play, type Playback } from "../battle/playback";
import { cuePlayer } from "../audio/sound";
import { BattleCanvas } from "../components/BattleCanvas";
import { ContractLink, short } from "../components/ui";
import { useArena } from "../lib/store";
import { connectFreighter } from "../lib/wallet";

export function ArenaView() {
  const arena = useArena();
  const [scene, setScene] = useState<BattleScene | null>(null);
  const [current, setCurrent] = useState<{ fight: FightReplay; playback: Playback } | null>(null);
  const [round, setRound] = useState(0);
  const [speed, setSpeed] = useState(1);
  const queue = useRef<number[]>([]);
  const queued = useRef(0);
  const playing = useRef(false);
  const runId = useRef(0);
  const stage = useRef<HTMLDivElement>(null);

  // Las peleas nuevas que detecta el feed de eventos entran a la cola
  useEffect(() => {
    const fresh = arena.liveFightIds.slice(queued.current);
    queued.current = arena.liveFightIds.length;
    queue.current.push(...fresh);
    pump();
  });

  useEffect(() => {
    if (scene) scene.speed = speed;
  }, [scene, speed]);

  async function pump() {
    if (!scene || playing.current) return;
    const id = queue.current[0];
    if (id === undefined) return;
    const fight = arena.fights.get(id);
    // Esperamos a tener todas las rondas (pueden llegar en otra página de eventos)
    if (!fight?.end || fight.rounds.length < fight.end.rounds) return;
    queue.current.shift();
    await start(fight);
  }

  async function start(fight: FightReplay) {
    const playback = fromReplay(fight, arena.rosterById);
    if (!scene || !playback) return;
    const run = ++runId.current;
    playing.current = true;
    setCurrent({ fight, playback });
    setRound(0);
    scene.onCue(await cuePlayer(playback));
    const finished = await play(scene, playback, setRound);
    // Si otra repetición la interrumpió, esa es la dueña de la escena ahora
    if (run !== runId.current) return;
    playing.current = false;
    if (finished && !queue.current.length) scene.reset();
    pump();
  }

  const history = [...arena.fights.values()].filter((f) => f.end).sort((a, b) => b.fightId - a.fightId);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <section id="escenario" className="scroll-mt-20 space-y-3">
        <div className="flex items-end justify-between gap-3">
          <h2 className="font-display text-3xl tracking-wide uppercase sm:text-4xl">
            El <span className="text-lamp">callejón</span>
          </h2>
          <p className="eyebrow hidden sm:block">Repetición en vivo · eventos on-chain</p>
        </div>
        <div ref={stage} className="bg-night-950">
          <BattleCanvas onReady={setScene} />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="mr-auto text-bone-dim">
            {current ? (
              <>
                Pelea <b className="text-bone">#{current.fight.fightId}</b> · ronda {round}/{current.playback.rounds.length} ·{" "}
                repetida desde eventos on-chain
              </>
            ) : (
              "Escuchando la blockchain… cada pelea nueva aparece aquí sola."
            )}
          </span>
          <button type="button" className="btn-ghost py-1.5" onClick={() => setSpeed(speed === 1 ? 2 : 1)}>
            <Gauge size={16} /> {speed}×
          </button>
          <button
            type="button"
            className="btn-ghost py-1.5"
            onClick={() => stage.current?.requestFullscreen?.()}
            aria-label="Pantalla completa"
          >
            <Maximize size={16} /> Proyector
          </button>
        </div>
      </section>

      <aside className="space-y-4">
        <ScoreCard />
        <OrganizerPanel />
        {current && <OnChainPanel fight={current.fight} playback={current.playback} />}
        <div className="card p-4">
          <h2 className="eyebrow mb-3">Historial de peleas</h2>
          {history.length === 0 ? (
            <p className="text-sm text-bone-dim">Todavía no hay peleas en las últimas horas.</p>
          ) : (
            <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
              {history.map((f) => {
                const p = fromReplay(f, arena.rosterById)!;
                const winner = p.winner === "a" ? p.a : p.b;
                return (
                  <li key={f.fightId} className="flex items-center gap-2 rounded-sm border border-sage/8 bg-night-800/50 px-3 py-2 text-sm">
                    <span className="font-mono text-xs text-bone-dim">#{f.fightId}</span>
                    <span className="min-w-0 flex-1 truncate">
                      {p.a.name} <span className="text-bone-dim">vs</span> {p.b.name}
                    </span>
                    <span title={`Gana ${winner.name}`}>{TEAMS[winner.team].emoji}</span>
                    <button
                      type="button"
                      aria-label={`Repetir pelea ${f.fightId}`}
                      className="rounded-sm p-1.5 text-sage hover:bg-night-700 hover:text-lamp"
                      onClick={() => {
                        queue.current = [f.fightId, ...queue.current.filter((x) => x !== f.fightId)];
                        playing.current = false;
                        pump();
                      }}
                    >
                      <Play size={14} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <LiveFeed />
      </aside>
    </div>
  );
}

function ScoreCard() {
  const { score, online } = useArena();
  const j = score?.jarana ?? 0;
  const t = score?.terror ?? 0;
  const pct = j + t ? (j / (j + t)) * 100 : 50;
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <span className="eyebrow">Marcador global</span>
        <span className={`font-mono text-[11px] uppercase tracking-widest ${online ? "text-mint" : "text-blood"}`}>
          ● {online ? "en vivo" : "sin conexión"}
        </span>
      </div>
      <div className="grid grid-cols-2">
        <TeamTile img="/art/card-jarana.jpg" label="Team Jarana" emoji="🎸" value={j} color="text-jarana" />
        <TeamTile img="/art/card-terror.jpg" label="Team Halloween" emoji="🎃" value={t} color="text-terror" right />
      </div>
      <div className="flex h-1.5 bg-terror">
        <div className="bg-jarana transition-[width] duration-500 ease-out" style={{ width: `${pct}%` }} />
      </div>
      <p className="px-4 py-2 font-mono text-[11px] text-bone-dim">
        {score?.fights ?? 0} peleas · leído del contrato de la Arena
      </p>
    </div>
  );
}

function TeamTile(p: { img: string; label: string; emoji: string; value: number; color: string; right?: boolean }) {
  return (
    <div className={`group relative isolate h-36 overflow-hidden ${p.right ? "text-right" : ""}`}>
      <img
        src={p.img}
        alt=""
        className="absolute inset-0 -z-10 h-full w-full object-cover opacity-70 transition duration-700 group-hover:scale-105 group-hover:opacity-90"
      />
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-night-950 via-night-950/50 to-transparent" />
      <div className="flex h-full flex-col justify-end p-3">
        <div className={`font-display text-5xl leading-none ${p.color}`}>{p.value}</div>
        <div className="mt-1 font-mono text-[11px] uppercase tracking-widest">
          {p.right ? `${p.label} ${p.emoji}` : `${p.emoji} ${p.label}`}
        </div>
      </div>
    </div>
  );
}

function OrganizerPanel() {
  const { roster, signer, setSigner } = useArena();
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [status, setStatus] = useState<{ kind: "busy" | "ok" | "error"; text: string; tx?: string } | null>(null);
  const isAdmin = signer?.publicKey === config.admin;

  async function connect() {
    try {
      setSigner(await connectFreighter());
      setStatus(null);
    } catch (e) {
      setStatus({ kind: "error", text: (e as Error).message });
    }
  }

  function draw() {
    const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
    const jarana = roster.filter((r) => r.profile.team === "JARANA");
    const terror = roster.filter((r) => r.profile.team === "TERROR");
    if (jarana.length && terror.length) {
      setA(pick(jarana).fighter);
      setB(pick(terror).fighter);
    }
  }

  async function fight() {
    if (!signer) return;
    setStatus({ kind: "busy", text: "Simulando y esperando tu firma en Freighter…" });
    const res = await write.fight(signer, a, b);
    if (!res.ok) return setStatus({ kind: "error", text: res.error });
    setStatus({
      kind: "ok",
      text: `Pelea #${res.value.value.fight_id} confirmada en el ledger ${res.value.ledger}. Llega a la pantalla en segundos…`,
      tx: res.value.txHash,
    });
  }

  return (
    <div className="card p-4">
      <h2 className="eyebrow mb-2 flex items-center gap-2">
        <Swords size={14} className="text-lamp" /> Organizador
      </h2>
      {!signer ? (
        <>
          <p className="mb-3 text-sm text-bone-dim">Conecta la wallet admin de la Arena para iniciar peleas.</p>
          <button type="button" className="btn-ghost w-full" onClick={connect}>
            <Wallet size={16} /> Conectar Freighter
          </button>
        </>
      ) : !isAdmin ? (
        <p className="text-sm text-bone-dim">
          Conectado como <span className="font-mono">{short(signer.publicKey)}</span>, que no es el admin. Solo{" "}
          <span className="font-mono">{short(config.admin)}</span> puede iniciar peleas (o usa <code>pnpm arena:fight</code>).
        </p>
      ) : (
        <div className="space-y-2.5">
          {[
            { value: a, set: setA, label: "Luchador A" },
            { value: b, set: setB, label: "Luchador B" },
          ].map((s) => (
            <label key={s.label} className="block text-xs text-bone-dim">
              {s.label}
              <select className="field mt-1 font-sans" value={s.value} onChange={(e) => s.set(e.target.value)}>
                <option value="">Elegir…</option>
                {roster.map((r) => (
                  <option key={r.fighter} value={r.fighter}>
                    {TEAMS[r.profile.team as "JARANA"].emoji} {r.profile.name} ({r.wins}V {r.losses}D)
                  </option>
                ))}
              </select>
            </label>
          ))}
          <div className="flex gap-2">
            <button type="button" className="btn-ghost" onClick={draw} aria-label="Sortear Jarana vs Halloween">
              <Dices size={16} />
            </button>
            <button
              type="button"
              className="btn-primary flex-1"
              disabled={!a || !b || a === b || status?.kind === "busy"}
              onClick={fight}
            >
              <Swords size={16} /> ¡Pelear!
            </button>
          </div>
        </div>
      )}
      {status && (
        <p
          role="status"
          className={`mt-3 text-sm ${status.kind === "error" ? "text-blood" : status.kind === "ok" ? "text-mint" : "text-lamp"}`}
        >
          {status.text} {status.tx && <ContractLink id={status.tx} kind="tx" />}
        </p>
      )}
    </div>
  );
}

function OnChainPanel({ fight, playback }: { fight: FightReplay; playback: Playback }) {
  const end = fight.end!;
  return (
    <div className="card space-y-2 p-4 text-sm">
      <h2 className="eyebrow">¿Qué pasó on-chain?</h2>
      <p className="text-bone-dim">
        Toda la pelea #{fight.fightId} ocurrió en <b className="text-bone">una sola transacción</b>. La Arena llamó{" "}
        <b className="text-bone">{playback.rounds.length * 2} veces</b> a <code>decide_move</code> en los contratos de cada
        luchador y dejó <b className="text-bone">{fight.rounds.length + 1} eventos</b> públicos ({fight.rounds.length}{" "}
        <code>RoundPlayed</code> + 1 <code>FightEnded</code>). Lo que ves es la repetición de esos eventos.
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-bone-dim">Transacción</dt>
        <dd><ContractLink id={end.txHash} kind="tx" /></dd>
        <dt className="text-bone-dim">Ledger</dt>
        <dd className="font-mono">{end.ledger} · {new Date(end.closedAt).toLocaleTimeString()}</dd>
        <dt className="text-bone-dim">{playback.a.name}</dt>
        <dd><ContractLink id={playback.a.id} /></dd>
        <dt className="text-bone-dim">{playback.b.name}</dt>
        <dd><ContractLink id={playback.b.id} /></dd>
      </dl>
    </div>
  );
}

const FEED_LABEL = {
  registered: "🆕 Inscripción",
  removed: "🚫 Expulsión",
  round: "🥊 Ronda",
  fight_ended: "🏆 Fin de pelea",
} as const;

function LiveFeed() {
  const { feed, rosterById } = useArena();
  const last = feed.slice(-8).reverse();
  return (
    <div className="card p-4">
      <h2 className="eyebrow mb-1">Feed de la blockchain</h2>
      <p className="mb-3 text-xs text-bone-dim">
        Eventos del contrato <ContractLink id={config.arenaId} /> leídos del RPC de Testnet.
      </p>
      <ul className="space-y-1 font-mono text-xs">
        {last.map((e) => {
          const name =
            e.kind === "registered" ? e.name : e.kind === "removed" ? rosterById.get(e.fighter)?.profile.name ?? short(e.fighter) : `#${e.fightId}${e.kind === "round" ? ` r${e.round}` : ""}`;
          return (
            <li key={e.id} className="flex justify-between gap-2">
              <span>{FEED_LABEL[e.kind]} <span className="text-bone-dim">{name}</span></span>
              <span className="text-bone-dim">L{e.ledger}</span>
            </li>
          );
        })}
        {!last.length && <li className="text-bone-dim">Sin eventos recientes.</li>}
      </ul>
    </div>
  );
}
