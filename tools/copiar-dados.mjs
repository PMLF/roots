// Copia os CSV de data/ para public/dados/ (gerado, não vai para o git): o worker vai buscá-los por URL.
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const destino = join(process.cwd(), "public", "dados");
mkdirSync(destino, { recursive: true });
for (const f of ["clubes", "cidades", "rivalidades", "distritos", "paises"]) {
  const origem = join(process.cwd(), "data", `${f}.csv`);
  if (!existsSync(origem)) throw new Error(`Falta ${origem}`);
  copyFileSync(origem, join(destino, `${f}.csv`));
}
console.log("CSV copiados para public/dados/");
