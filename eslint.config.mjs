import js from "@eslint/js";
import tseslint from "typescript-eslint";

// Fronteiras de arquitetura (CLAUDE.md):
//  - o motor (src/engine) não depende de React, Next nem do DOM;
//  - a UI (src/ui, src/app) nunca lê a "verdade" oculta: só a Vista e o cliente do motor.
const sem = (patterns, message) => ({ patterns: patterns.map((group) => ({ group: [group], message })) });
const MOTOR = ["react", "react-dom", "react/*", "next", "next/*", "**/ui/**"];
// Bibliotecas SQLite: só os drivers (src/node, src/engine/worker) as conhecem; o motor fala com o Repositorio.
const SQLITE = ["better-sqlite3", "@sqlite.org/*"];

export default tseslint.config(
  { ignores: [".next/**", "out/**", "public/sqlite/**", "node_modules/**", "next-env.d.ts", "data/**", "tools/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/engine/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [
        ...sem(MOTOR, "O motor não pode importar React, Next nem a UI.").patterns,
        ...sem(SQLITE, "O motor usa a interface Repositorio; os drivers SQLite ficam em src/node e src/engine/worker.").patterns,
      ] }],
      "no-restricted-globals": ["error", "window", "document", "localStorage", "sessionStorage", "navigator"],
    },
  },
  {
    // O worker é a casca que liga o motor ao browser: pode importar o driver sqlite-wasm.
    files: ["src/engine/worker/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", sem(MOTOR, "O motor não pode importar React, Next nem a UI.")],
    },
  },
  {
    files: ["src/ui/**/*.{ts,tsx}", "src/app/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [
        ...sem(["**/engine/verdade/**", "**/engine/repositorio/**", "**/engine/persistencia/**", "**/engine/worker/**"], "A UI só fala com o motor pelo cliente e lê dados pela Vista.").patterns,
        ...sem(SQLITE, "A UI não acede à base de dados.").patterns,
      ] }],
    },
  },
);
