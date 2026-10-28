// Comandos del organizador (usan la cuenta de `pnpm setup:account`):
//   pnpm arena:deploy [--force]     despliega Arena + Saco de Box y escribe config/arena.json
//   pnpm arena:fight A B            pelea oficial entre dos CONTRACT_ID inscritos
//   pnpm arena:fighters             lista de inscritos
//   pnpm arena:scoreboard           marcador Jarana vs Halloween
//   pnpm arena:remove ID            expulsa a un luchador
import {
  arenaConfig, ask, c, deploy, explorer, fail, FIGHT_INSTRUCTION_LEEWAY, FIGHT_RESOURCE_FEE, invoke, NETWORK, requireAccount, requireArena, run, step,
} from "./lib.mjs";

const [cmd, ...rest] = process.argv.slice(2);

const commands = { deploy: deployArena, fight, fighters, scoreboard, remove };

if (!commands[cmd]) fail(`Comando desconocido: ${cmd ?? "(ninguno)"}`, `Usa uno de: ${Object.keys(commands).join(", ")}`);
await commands[cmd]();

async function deployArena() {
  const { account, address } = requireAccount();
  const existing = arenaConfig.read();
  if (existing?.arenaId && !rest.includes("--force")) {
    const answer = await ask(`Ya hay una Arena (${existing.arenaId}). ¿Desplegar otra y reemplazarla? s/N`, "N");
    if (!/^s/i.test(answer)) process.exit(0);
  }

  step("Compilando todos los contratos…");
  run("stellar", ["contract", "build"]);

  step(`Desplegando la Arena (admin: ${account})…`);
  const arenaId = deploy("arena", account, ["--admin", address]);

  step("Desplegando el Saco de Box (rival de práctica)…");
  const sparringId = deploy("sparring", account);
  // Luchador de la casa: pelea, pero sus peleas no suman al marcador de bandos
  const reg = invoke(arenaId, account, "register_house", { fighter: sparringId });
  if (!reg.ok) fail(`No se pudo inscribir el Saco de Box: ${reg.error}`);

  arenaConfig.write({
    network: NETWORK,
    rpcUrl: "https://soroban-testnet.stellar.org",
    networkPassphrase: "Test SDF Network ; September 2015",
    arenaId,
    sparringId,
    admin: address,
    deployedAt: new Date().toISOString(),
  });

  console.log(`
${c.green("✔")} Arena lista

  ARENA_ID:    ${c.bold(arenaId)}
  Saco de Box: ${c.bold(sparringId)}
  Explorer:    ${explorer.contract(arenaId)}

  ${c.dim("Comparte config/arena.json con los asistentes (súbelo al repo).")}
`);
}

function nameOf(id, account) {
  const res = invoke(id, account, "get_profile", {}, { send: false });
  return res.ok ? `${res.value.name} (${res.value.team})` : id.slice(0, 8) + "…";
}

async function fight() {
  const { account } = requireAccount();
  const { arenaId } = requireArena();
  const [a, b] = rest;
  if (!a || !b) fail("Uso: pnpm arena:fight <CONTRACT_ID_A> <CONTRACT_ID_B>");

  step(`${nameOf(a, account)}  vs  ${nameOf(b, account)}`);
  const res = invoke(arenaId, account, "fight", { fighter_a: a, fighter_b: b }, {
    instructionLeeway: FIGHT_INSTRUCTION_LEEWAY,
    resourceFee: FIGHT_RESOURCE_FEE,
  });
  if (!res.ok) fail(res.error);

  const r = res.value;
  console.log(`
  🏆 Pelea #${r.fight_id}: gana ${c.bold(nameOf(r.winner, account))}
     ${r.rounds} rondas ${r.knockout ? "por KO" : "por puntos"} · bando ${r.winner_team}
`);
}

async function fighters() {
  const { account } = requireAccount();
  const { arenaId } = requireArena();
  const res = invoke(arenaId, account, "fighters", {}, { send: false });
  if (!res.ok) fail(res.error);

  console.log(`\n  ${res.value.length} luchadores inscritos\n`);
  for (const f of res.value) {
    const p = f.profile;
    const team = p.team === "JARANA" ? c.yellow("JARANA") : c.magenta("TERROR");
    console.log(
      `  ${p.name.padEnd(24)} ${team}  ${c.dim(`HP ${p.hp} ATK ${p.attack} DEF ${p.defense}`)}  ` +
        `${c.green(f.wins + "V")} ${c.red(f.losses + "D")}  ${c.dim(f.fighter)}${f.house ? c.dim("  (de la casa: no suma)") : ""}`,
    );
  }
  console.log();
}

async function scoreboard() {
  const { account } = requireAccount();
  const { arenaId } = requireArena();
  const res = invoke(arenaId, account, "scoreboard", {}, { send: false });
  if (!res.ok) fail(res.error);
  const s = res.value;
  console.log(`\n  🎸 Jarana ${c.bold(s.jarana)}  vs  ${c.bold(s.terror)} Halloween 🎃   ${c.dim(`(${s.fights} peleas)`)}\n`);
}

async function remove() {
  const { account } = requireAccount();
  const { arenaId } = requireArena();
  const [id] = rest;
  if (!id) fail("Uso: pnpm arena:remove <CONTRACT_ID>");
  const res = invoke(arenaId, account, "remove_fighter", { fighter: id });
  if (!res.ok) fail(res.error);
  console.log(`\n${c.green("✔")} Expulsado ${id}\n`);
}
