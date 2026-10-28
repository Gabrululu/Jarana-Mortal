// pnpm setup:account [nombre]
// Crea (o reutiliza) tu cuenta de Stellar Testnet y la llena de XLM de prueba.
import { accountAddress, ask, c, explorer, fail, local, NETWORK, run, step } from "./lib.mjs";

const saved = local.read().account;
const suggestion = saved ?? `luchador-${Math.random().toString(36).slice(2, 6)}`;
const name = process.argv[2] ?? (await ask("Nombre para tu cuenta", suggestion));

if (!/^[a-z0-9_-]{1,32}$/i.test(name)) {
  fail("Usa solo letras, números, - y _ (máximo 32).");
}

let address = accountAddress(name);
if (address) {
  step(`La cuenta "${name}" ya existe en esta computadora. Me aseguro de que tenga fondos…`);
  // Friendbot responde error si ya estaba fondeada: no pasa nada.
  run("stellar", ["keys", "fund", name, "--network", NETWORK], { capture: true, allowFail: true });
} else {
  step(`Creando la cuenta "${name}" y pidiéndole XLM de prueba a Friendbot…`);
  run("stellar", ["keys", "generate", name, "--network", NETWORK, "--fund"]);
  address = accountAddress(name);
}

local.update({ account: name, address });

console.log(`
${c.green("✔")} Cuenta lista

  Nombre:    ${c.bold(name)}
  Dirección: ${c.bold(address)}
  Explorer:  ${explorer.account(address)}

  ${c.dim("Tu llave secreta vive en la config del Stellar CLI, nunca en este repo.")}
  ${c.dim("Siguiente paso: edita contracts/fighter/src/lib.rs y corre  pnpm fighter:test")}
`);
