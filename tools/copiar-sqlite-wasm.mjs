// Copia os ficheiros do sqlite-wasm para public/sqlite/ (gerado, não vai para o git).
// O worker carrega-os por URL em vez de os passar pelo bundler: o Turbopack não resolve os
// `new URL(variável, import.meta.url)` internos do pacote, e assim os ficheiros ficam todos lado a lado.
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const pacote = dirname(require.resolve("@sqlite.org/sqlite-wasm/package.json"));
const destino = join(process.cwd(), "public", "sqlite");
mkdirSync(destino, { recursive: true });
for (const f of ["index.mjs", "sqlite3.wasm", "sqlite3-opfs-async-proxy.js"]) {
  const origem = join(pacote, "dist", f);
  if (!existsSync(origem)) throw new Error(`Falta ${origem}`);
  copyFileSync(origem, join(destino, f));
}
console.log("sqlite-wasm copiado para public/sqlite/");
