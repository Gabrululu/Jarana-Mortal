// pnpm --filter @cvm/game smoke [cuenta-admin]
// Prueba @cvm/game contra la Arena real de Testnet. Con una cuenta admin del
// Stellar CLI también firma una pelea oficial y la "repite" desde los eventos.
import { execFileSync } from "node:child_process";
import { Keypair } from "@stellar/stellar-sdk";
import { basicNodeSigner } from "@stellar/stellar-sdk/contract";
import { config, fetchFight, MOVES, read, write, type Move, type Signer } from "../src";

function must<T>(label: string, o: { ok: true; value: T } | { ok: false; error: string }): T {
  if (!o.ok) throw new Error(`${label}: ${o.error}`);
  console.log(`✔ ${label}`);
  return o.value;
}

console.log(`Arena ${config.arenaId}\n`);

const score = must("scoreboard", await read.scoreboard());
console.log(`  Jarana ${score.jarana} · Halloween ${score.terror} · ${score.fights} peleas`);

const fighters = must("fighters", await read.fighters());
for (const f of fighters) console.log(`  ${f.profile.name} (${f.profile.team}) ${f.wins}V ${f.losses}D`);

const profile = must("profile (Saco de Box)", await read.profile(config.sparringId));
console.log(`  HP ${profile.hp} ATK ${profile.attack} DEF ${profile.defense}`);

const same = await read.spar(config.sparringId, config.sparringId);
if (same.ok || !same.error.includes("sí mismo")) throw new Error(`Error mal traducido: ${JSON.stringify(same)}`);
console.log(`✔ error traducido: "${same.error}"`);

const [a, b] = fighters.map((f) => f.fighter);
const spar = must("spar (simulación)", await read.spar(a, b));
console.log(`  ${spar.rounds} rondas, ${spar.knockout ? "KO" : "por puntos"}`);

const adminAccount = process.argv[2];
if (adminAccount) {
  const secret = execFileSync("stellar", ["keys", "secret", adminAccount], { encoding: "utf8" }).trim();
  const keypair = Keypair.fromSecret(secret);
  const signer: Signer = {
    publicKey: keypair.publicKey(),
    ...basicNodeSigner(keypair, config.networkPassphrase),
  };

  const sent = must("fight (firmada y enviada)", await write.fight(signer, a, b));
  console.log(`  pelea #${sent.value.fight_id} · tx ${sent.txHash} · ledger ${sent.ledger}`);

  const replay = await fetchFight(sent.value.fight_id, sent.ledger);
  if (!replay?.end) throw new Error("No encontré los eventos de la pelea");
  console.log(`✔ replay desde eventos: ${replay.rounds.length} rondas`);
  for (const r of replay.rounds) {
    console.log(`  R${r.round}: ${MOVES[r.move_a as Move].emoji} vs ${MOVES[r.move_b as Move].emoji}  HP ${r.hp_a} / ${r.hp_b}`);
  }
  if (replay.rounds.length !== sent.value.rounds) throw new Error("Rondas en eventos ≠ resultado");
  if (replay.end.winner !== sent.value.winner) throw new Error("Ganador en eventos ≠ resultado");
  console.log("✔ eventos coinciden con el resultado de la transacción");
}
