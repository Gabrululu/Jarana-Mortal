// Convierte lo que viene de la blockchain (eventos o una simulación) en una "repetición" para la escena.
import { config, type BattleReport, type FightReplay, type FighterRecord } from "@cvm/game";
import type { BattleScene, FighterView, RoundView, Side } from "./BattleScene";
import type { Team } from "./looks";

export interface Playback {
  key: string;
  a: FighterView;
  b: FighterView;
  rounds: RoundView[];
  winner: Side;
  knockout: boolean;
}

function view(id: string, roster: Map<string, FighterRecord>, fallbackMax: number): FighterView {
  const rec = roster.get(id);
  return {
    id,
    name: rec?.profile.name ?? `${id.slice(0, 5)}…`,
    team: (rec?.profile.team as Team) ?? "JARANA",
    maxHp: rec ? rec.profile.hp * 3 : fallbackMax,
    house: rec?.house ?? id === config.sparringId,
  };
}

export function fromReplay(f: FightReplay, roster: Map<string, FighterRecord>): Playback | null {
  if (!f.end) return null;
  const first = f.rounds[0];
  // Si el luchador ya no está en el roster, estimamos su vida máxima con la primera ronda
  const guessA = first ? first.hp_a + first.damage_to_a : 100;
  const guessB = first ? first.hp_b + first.damage_to_b : 100;
  return {
    key: `fight-${f.fightId}`,
    a: view(f.end.fighter_a, roster, guessA),
    b: view(f.end.fighter_b, roster, guessB),
    rounds: f.rounds,
    winner: f.end.winner === f.end.fighter_a ? "a" : "b",
    knockout: f.end.knockout,
  };
}

export function fromReport(
  report: BattleReport,
  a: { id: string; name: string; team: string },
  b: { id: string; name: string; team: string },
): Playback {
  return {
    key: `spar-${Date.now()}`,
    a: { id: a.id, name: a.name, team: a.team as Team, maxHp: report.max_hp_a, house: a.id === config.sparringId },
    b: { id: b.id, name: b.name, team: b.team as Team, maxHp: report.max_hp_b, house: b.id === config.sparringId },
    rounds: report.log,
    winner: report.winner === a.id ? "a" : "b",
    knockout: report.knockout,
  };
}

let playToken = 0;

/** Reproduce una pelea completa. Si empieza otra, la anterior se corta. */
export async function play(scene: BattleScene, p: Playback, onRound?: (round: number) => void) {
  const token = ++playToken;
  await scene.showMatchup(p.a, p.b);
  for (const r of p.rounds) {
    if (token !== playToken) return false;
    onRound?.(r.round);
    await scene.playRound(r);
  }
  if (token !== playToken) return false;
  await scene.playFinish(p.winner, p.knockout);
  return true;
}
