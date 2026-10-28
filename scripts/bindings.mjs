// pnpm bindings — regenera los clientes TypeScript a partir de los contratos.
// Se generan desde el .wasm (no desde un CONTRACT_ID), así sirven para cualquier
// Arena: el ID real lo lee el frontend de config/arena.json.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { c, pnpm, ROOT, run, step, WASM_DIR } from "./lib.mjs";

const PACKAGES = [
  { wasm: "arena", dir: "arena-client", name: "@cvm/arena-client" },
  { wasm: "fighter", dir: "fighter-client", name: "@cvm/fighter-client" },
];

step("Compilando contratos…");
run("stellar", ["contract", "build"]);

for (const pkg of PACKAGES) {
  step(`Generando ${pkg.name}…`);
  const outDir = join(ROOT, "packages", pkg.dir);
  run("stellar", [
    "contract", "bindings", "typescript",
    "--wasm", join(WASM_DIR, `${pkg.wasm}.wasm`),
    "--output-dir", outDir,
    "--overwrite",
  ]);

  // El CLI genera un package.json genérico: le ponemos nombre del workspace
  const file = join(outDir, "package.json");
  const json = JSON.parse(readFileSync(file, "utf8"));
  writeFileSync(file, JSON.stringify({ ...json, name: pkg.name, private: true }, null, 2) + "\n");
}

// El postinstall de la raíz compila los clientes
step("Instalando y compilando los clientes…");
pnpm(["install"]);

console.log(`\n${c.green("✔")} Clientes TypeScript listos en packages/\n`);
