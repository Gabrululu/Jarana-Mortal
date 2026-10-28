// pnpm check — revisa que tengas todo lo necesario para el taller.
import { accountAddress, arenaConfig, c, local, run } from "./lib.mjs";

const checks = [];
const check = (label, ok, hint) => checks.push({ label, ok, hint });
const version = (cmd, args) => {
  const res = run(cmd, args, { capture: true, allowFail: true });
  return res.ok ? res.stdout.split("\n")[0] : null;
};

const [major] = process.versions.node.split(".").map(Number);
check(`Node ${process.versions.node}`, major >= 20, "Instala Node 20 o superior: https://nodejs.org");

const rustc = version("rustc", ["--version"]);
check(rustc ?? "Rust", !!rustc, "Instala Rust: https://rustup.rs");

const targets = run("rustup", ["target", "list", "--installed"], { capture: true, allowFail: true });
check(
  "Target wasm32v1-none",
  targets.ok && targets.stdout.includes("wasm32v1-none"),
  "Corre: rustup target add wasm32v1-none",
);

const stellar = version("stellar", ["--version"]);
check(
  stellar ?? "Stellar CLI",
  !!stellar,
  "Instala el CLI: https://developers.stellar.org/docs/tools/cli/install-cli",
);

const { account, fighterId } = local.read();
const address = account && stellar ? accountAddress(account) : null;
check(account ? `Cuenta "${account}"` : "Cuenta de testnet", !!address, "Corre: pnpm setup:account");

const arena = arenaConfig.read();
check(
  arena?.arenaId ? `Arena ${arena.arenaId.slice(0, 8)}…` : "Arena configurada",
  !!arena?.arenaId,
  "Falta config/arena.json: pídeselo al organizador",
);

console.log();
for (const { label, ok, hint } of checks) {
  console.log(`  ${ok ? c.green("✔") : c.red("✖")} ${label}${ok ? "" : `\n      ${c.dim(hint)}`}`);
}
if (fighterId) console.log(`  ${c.green("✔")} Luchador ${fighterId.slice(0, 8)}…`);

const failed = checks.filter((x) => !x.ok).length;
console.log(failed ? `\n  ${c.yellow(`${failed} cosa(s) por arreglar.`)}\n` : `\n  ${c.green("¡Todo listo para pelear!")}\n`);
process.exit(failed ? 1 : 0);
