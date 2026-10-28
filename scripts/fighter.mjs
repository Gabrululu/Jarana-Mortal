// Comandos del asistente:
//   pnpm fighter:deploy            compila y despliega tu luchador
//   pnpm fighter:register          lo inscribe en la Arena
//   pnpm fighter:spar [RIVAL_ID]   pelea de práctica (simulada, gratis)
//   pnpm fighter:status            tu luchador y el marcador
//   pnpm fighter:ship              test → deploy → register, todo de una
import { c, explorer, fail, invoke, local, printBattle, requireAccount, requireArena, run, step, deploy } from "./lib.mjs";

const [cmd, ...rest] = process.argv.slice(2);

const commands = {
  deploy: deployFighter,
  register: registerFighter,
  spar,
  status,
  ship: async () => {
    step("Probando tu luchador…");
    run("cargo", ["test", "-p", "fighter", "--", "--nocapture"]);
    await deployFighter();
    await registerFighter();
  },
};

if (!commands[cmd]) fail(`Comando desconocido: ${cmd ?? "(ninguno)"}`, `Usa uno de: ${Object.keys(commands).join(", ")}`);
await commands[cmd]();

function requireFighter() {
  const { fighterId } = local.read();
  if (!fighterId) fail("Todavía no desplegaste tu luchador.", "Corre: pnpm fighter:deploy");
  return fighterId;
}

function profileOf(id, account) {
  const res = invoke(id, account, "get_profile", {}, { send: false });
  return res.ok ? res.value : null;
}

async function deployFighter() {
  const { account } = requireAccount();

  step("Compilando tu luchador a WebAssembly…");
  run("stellar", ["contract", "build", "--package", "fighter"]);

  step("Desplegando en Stellar Testnet…");
  const fighterId = deploy("fighter", account);
  const profile = profileOf(fighterId, account);
  local.update({ fighterId, registered: false });

  console.log(`
${c.green("✔")} Tu luchador vive en la blockchain

  Nombre:      ${c.bold(profile?.name ?? "?")} ${c.dim(`(${profile?.team ?? "?"})`)}
  CONTRACT_ID: ${c.bold(fighterId)}
  Explorer:    ${explorer.contract(fighterId)}

  ${c.dim("Siguiente paso: pnpm fighter:spar  o  pnpm fighter:register")}
`);
}

async function registerFighter() {
  const { account, address } = requireAccount();
  const { arenaId } = requireArena();
  const fighterId = requireFighter();

  step("Inscribiendo tu luchador en la Arena (firmas con tu cuenta)…");
  const res = invoke(arenaId, account, "register", { owner: address, fighter: fighterId });
  if (!res.ok) fail(res.error);

  local.update({ registered: true });
  const p = res.value;
  console.log(`
${c.green("✔")} ¡Inscrito!  ${c.bold(p.name)} — ${p.team}  ${c.dim(`HP ${p.hp} · ATK ${p.attack} · DEF ${p.defense}`)}

  La Arena revisó tu ficha y guardó una copia: ya no la puedes cambiar.
  Pega tu CONTRACT_ID en la web de la Arena para subir tus audios:
  ${c.bold(fighterId)}
`);
}

async function spar() {
  const { account } = requireAccount();
  const { arenaId, sparringId } = requireArena();
  const fighterId = requireFighter();
  const rivalId = rest[0] ?? sparringId;
  if (!rivalId) fail("Indica el CONTRACT_ID de tu rival:  pnpm fighter:spar CABC…");

  step("Simulando la pelea (no se envía ninguna transacción)…");
  const res = invoke(arenaId, account, "simulate", { fighter_a: fighterId, fighter_b: rivalId }, { send: false });
  if (!res.ok) fail(res.error);

  const me = profileOf(fighterId, account)?.name ?? "Tú";
  const rival = profileOf(rivalId, account)?.name ?? "Rival";
  printBattle(res.value, fighterId, me, rival);
  console.log(c.dim("  Columnas de daño: lo que tú haces / lo que recibes. Los ataques fuertes son aleatorios: cada simulación puede variar.\n"));
}

async function status() {
  const { account, address } = requireAccount();
  const { fighterId } = local.read();
  const arena = requireArena();

  console.log(`\n  Cuenta:   ${c.bold(account)}  ${c.dim(address)}`);
  console.log(`  Luchador: ${fighterId ? c.bold(fighterId) : c.dim("sin desplegar")}`);
  console.log(`  Arena:    ${c.dim(arena.arenaId)}`);

  if (fighterId) {
    const rec = invoke(arena.arenaId, account, "fighter", { fighter: fighterId }, { send: false });
    if (rec.ok && rec.value) {
      const p = rec.value.profile;
      console.log(`\n  ${c.bold(p.name)} (${p.team})  ${c.green(`${rec.value.wins} victorias`)} · ${c.red(`${rec.value.losses} derrotas`)}`);
    } else {
      console.log(`\n  ${c.yellow("Aún no está inscrito.")} Corre: pnpm fighter:register`);
    }
  }

  const score = invoke(arena.arenaId, account, "scoreboard", {}, { send: false });
  if (score.ok) {
    const s = score.value;
    console.log(`\n  🎸 Jarana ${c.bold(s.jarana)}  vs  ${c.bold(s.terror)} Halloween 🎃   ${c.dim(`(${s.fights} peleas)`)}\n`);
  }
}
