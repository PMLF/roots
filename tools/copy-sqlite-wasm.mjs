// Copies the sqlite-wasm files to public/sqlite/ (generated, not in git).
// The worker loads them by URL instead of going through the bundler: Turbopack cannot resolve the package's internal
// `new URL(variable, import.meta.url)`, and this way all files sit side by side.
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const pkg = dirname(require.resolve("@sqlite.org/sqlite-wasm/package.json"));
const target = join(process.cwd(), "public", "sqlite");
mkdirSync(target, { recursive: true });
for (const f of ["index.mjs", "sqlite3.wasm", "sqlite3-opfs-async-proxy.js"]) {
  const source = join(pkg, "dist", f);
  if (!existsSync(source)) throw new Error(`Missing ${source}`);
  copyFileSync(source, join(target, f));
}
console.log("sqlite-wasm copied to public/sqlite/");
