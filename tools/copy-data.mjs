// Copies the CSV files from data/ to public/data/ (generated, not in git): the worker fetches them by URL.
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const target = join(process.cwd(), "public", "data");
mkdirSync(target, { recursive: true });
for (const f of ["clubs", "cities", "localities", "rivalries", "districts", "countries"]) {
  const source = join(process.cwd(), "data", `${f}.csv`);
  if (!existsSync(source)) throw new Error(`Missing ${source}`);
  copyFileSync(source, join(target, `${f}.csv`));
}
console.log("CSV files copied to public/data/");
