// Utilidades compartidas por los scripts. Sin dependencias: solo Node.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const NETWORK = "testnet";
export const WASM_DIR = join(ROOT, "target", "wasm32v1-none", "release");

const LOCAL_FILE = join(ROOT, ".cvm", "local.json");
export const ARENA_FILE = join(ROOT, "config", "arena.json");

// ─── Consola ────────────────────────────────────────────────────────────────

const paint = (code) => (s) => `\x1b[${code}m${s}\x1b[0m`;
export const c = {
  bold: paint(1),
  dim: paint(2),
  red: paint(31),
  green: paint(32),
  yellow: paint(33),
  magenta: paint(35),
  cyan: paint(36),
};

export function step(msg) {
  console.log(`\n${c.cyan("▶")} ${c.bold(msg)}`);
}

export function fail(msg, hint) {
  console.error(`\n${c.red("✖")} ${msg}`);
  if (hint) console.error(`  ${c.dim(hint)}`);
  process.exit(1);
}

export const explorer = {
  contract: (id) => `https://stellar.expert/explorer/${NETWORK}/contract/${id}`,
  account: (addr) => `https://stellar.expert/explorer/${NETWORK}/account/${addr}`,
};

export async function ask(question, fallback) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(`${question}${fallback ? c.dim(` (${fallback})`) : ""}: `)).trim();
  rl.close();
  return answer || fallback;
}

// ─── Procesos ───────────────────────────────────────────────────────────────

/**
 * Corre un comando. Con `capture` devuelve stdout/stderr en vez de mostrarlos.
 * Por defecto aborta si el comando falla.
 */
export function run(cmd, args, { capture = false, allowFail = false } = {}) {
  if (!capture) console.log(c.dim(`$ ${cmd} ${args.join(" ")}`));
  const res = spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: capture ? ["inherit", "pipe", "pipe"] : "inherit",
  });
  if (res.error?.code === "ENOENT") {
    fail(`No encontré el comando "${cmd}".`, "Revisa tu instalación con: pnpm check");
  }
  const out = { ok: res.status === 0, stdout: (res.stdout ?? "").trim(), stderr: (res.stderr ?? "").trim() };
  if (!out.ok && !allowFail) {
    if (capture && out.stderr) console.error(out.stderr);
    fail(`Falló: ${cmd} ${args.join(" ")}`);
  }
  return out;
}

/**
 * Corre pnpm. Dentro de `pnpm run`, npm_execpath apunta al pnpm real (un .cjs);
 * si no, en Windows pnpm es un shim .cmd que solo arranca con shell.
 */
export function pnpm(args) {
  const execPath = process.env.npm_execpath;
  if (execPath && /\.c?js$/.test(execPath)) return run(process.execPath, [execPath, ...args]);
  console.log(c.dim(`$ pnpm ${args.join(" ")}`));
  const res = spawnSync("pnpm", args, { cwd: ROOT, stdio: "inherit", shell: process.platform === "win32" });
  if (res.status !== 0) fail(`Falló: pnpm ${args.join(" ")}`);
}

// ─── Stellar CLI ────────────────────────────────────────────────────────────

const CONTRACT_ID = /\bC[A-Z2-7]{55}\b/;

export function accountAddress(name) {
  const res = run("stellar", ["keys", "address", name], { capture: true, allowFail: true });
  return res.ok ? res.stdout : null;
}

export function deploy(wasmName, source, ctorArgs = []) {
  const wasm = join(WASM_DIR, `${wasmName}.wasm`);
  if (!existsSync(wasm)) fail(`No existe ${wasm}`, "Compila primero.");
  const args = ["contract", "deploy", "--wasm", wasm, "--source-account", source, "--network", NETWORK];
  if (ctorArgs.length) args.push("--", ...ctorArgs);
  const res = run("stellar", args, { capture: true, allowFail: true });
  const id = res.stdout.match(CONTRACT_ID)?.[0];
  if (!res.ok || !id) {
    console.error(res.stderr);
    fail(`No se pudo desplegar ${wasmName}.wasm`, "¿Tu cuenta tiene XLM de testnet? Prueba: pnpm setup:account");
  }
  return id;
}

/**
 * Margen para `fight`: los golpes FUERTE usan el azar de la red, así que la simulación (que calcula los recursos) y la
 * ejecución real juegan peleas distintas. Si la real dura más rondas, gasta más cómputo y emite más eventos de los
 * presupuestados. Una pelea de 20 rondas cuesta ~13M de instrucciones y ~38k stroops; lo que no se usa se reembolsa.
 * Mismos valores en packages/game/src/arena.ts.
 */
export const FIGHT_INSTRUCTION_LEEWAY = 15_000_000;
export const FIGHT_RESOURCE_FEE = 200_000;

/**
 * Invoca una función de un contrato y devuelve su resultado ya parseado.
 * `send: false` solo simula (gratis, no escribe nada en la red).
 */
export function invoke(contractId, source, fn, fnArgs = {}, { send = true, instructionLeeway, resourceFee } = {}) {
  const args = ["contract", "invoke", "--id", contractId, "--source-account", source, "--network", NETWORK];
  if (!send) args.push("--send=no");
  if (instructionLeeway) args.push("--instruction-leeway", String(instructionLeeway));
  if (resourceFee) args.push("--resource-fee", String(resourceFee));
  args.push("--", fn);
  for (const [k, v] of Object.entries(fnArgs)) args.push(`--${k}`, String(v));
  const res = run("stellar", args, { capture: true, allowFail: true });
  if (!res.ok) {
    if (process.env.CVM_DEBUG) console.error(c.dim(res.stderr));
    return { ok: false, error: explainError(res.stderr), raw: res.stderr };
  }
  return { ok: true, value: parseJson(res.stdout) };
}

function parseJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text.replace(/^"|"$/g, "");
  }
}

// Códigos de `ArenaError` en contracts/arena/src/lib.rs
const ARENA_ERRORS = {
  1: "Ese luchador ya está inscrito.",
  2: "Ese luchador no está inscrito en la Arena.",
  3: "Ese contrato no responde como un Luchador (¿desplegaste el correcto?).",
  4: "Trampa criolla: tu ficha suma más de 100 puntos.",
  5: "Cada atributo necesita al menos 5 puntos.",
  6: 'El bando debe ser "JARANA" o "TERROR".',
  7: "El nombre debe tener entre 1 y 24 bytes (las tildes y la ñ cuentan doble).",
  8: "Un luchador no puede pelear contra sí mismo.",
  9: "La Arena está llena.",
  10: "Ya hay un luchador con ese nombre: cambia NAME, vuelve a desplegar e inscríbete.",
};

export function explainError(stderr) {
  const code = stderr.match(/Error\(Contract, #(\d+)\)/)?.[1];
  if (code && ARENA_ERRORS[code]) return ARENA_ERRORS[code];
  if (/Auth|auth/.test(stderr) && /InvalidAction|NotAuthorized/.test(stderr)) {
    return "Esa acción necesita la firma de otra cuenta (¿eres el organizador?).";
  }
  if (/InsufficientRefundableFee|ResourceLimitExceeded/.test(stderr)) {
    return "La pelea real duró más de lo que estimó la simulación y no le alcanzaron los recursos. Vuelve a lanzarla.";
  }
  if (/insufficient|underfunded|tx_insufficient_balance/i.test(stderr)) {
    return "Tu cuenta no tiene suficientes XLM de testnet. Corre: pnpm setup:account";
  }
  if (/Budget|ExceededLimit/i.test(stderr)) {
    return "La pelea gastó más cómputo del permitido por transacción.";
  }
  const last = stderr.split("\n").filter(Boolean).pop() ?? "Error desconocido";
  return last.replace(/^❌\s*/, "");
}

// ─── Archivos de configuración ──────────────────────────────────────────────

function readJson(file) {
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
}

function writeJson(file, data) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
}

/** Datos de ESTA computadora: tu cuenta y tu luchador (no se suben a git). */
export const local = {
  read: () => readJson(LOCAL_FILE) ?? {},
  update: (patch) => {
    const next = { ...local.read(), ...patch };
    writeJson(LOCAL_FILE, next);
    return next;
  },
};

/** Datos de la Arena oficial: los publica el organizador en config/arena.json. */
export const arenaConfig = {
  read: () => readJson(ARENA_FILE),
  write: (data) => writeJson(ARENA_FILE, data),
};

export function requireAccount() {
  const { account } = local.read();
  if (!account) fail("Todavía no tienes cuenta.", "Corre: pnpm setup:account");
  const address = accountAddress(account);
  if (!address) fail(`La cuenta "${account}" no existe en el Stellar CLI.`, "Corre: pnpm setup:account");
  return { account, address };
}

export function requireArena() {
  const cfg = arenaConfig.read();
  if (!cfg?.arenaId) fail("No hay Arena configurada en config/arena.json.", "Pídele al organizador el archivo, o corre: pnpm arena:deploy");
  return cfg;
}

// ─── Presentación de peleas ─────────────────────────────────────────────────

export const MOVES = { 0: "¡Tropiezo!", 1: "Normal", 2: "Fuerte", 3: "Guardia" };

export function printBattle(report, idA, nameA, nameB) {
  const pad = (s, n) => String(s).padEnd(n);
  const num = (n) => String(n).padStart(3);
  console.log(`\n  ${c.bold(nameA)} ${c.dim("vs")} ${c.bold(nameB)}\n`);
  for (const r of report.log) {
    const tagA = r.missed_a ? c.yellow(" (falló)") : r.countered_a ? c.magenta(" (contra)") : "";
    const tagB = r.missed_b ? c.yellow(" (falló)") : r.countered_b ? c.magenta(" (contra)") : "";
    console.log(
      `  Ronda ${String(r.round).padStart(2)} │ ${pad(MOVES[r.move_a], 10)}${tagA} vs ${pad(MOVES[r.move_b], 10)}${tagB}` +
        ` │ daño ${num(r.damage_to_b)} / ${num(r.damage_to_a)} │ HP ${num(r.hp_a)}/${report.max_hp_a} vs ${num(r.hp_b)}/${report.max_hp_b}`,
    );
  }
  const how = report.knockout ? "por KO" : "por puntos";
  const winnerName = report.winner === idA ? nameA : nameB;
  console.log(`\n  🏆 Gana ${c.bold(winnerName)} en ${report.rounds} rondas ${how}\n`);
}
