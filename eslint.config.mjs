import js from "@eslint/js";
import tseslint from "typescript-eslint";

// Fronteiras de arquitetura (CLAUDE.md):
//  - o motor (src/engine) não depende de React, Next nem do DOM;
//  - a UI (src/ui, src/app) nunca lê a "verdade" oculta: só a Vista e o cliente do motor.
const sem = (patterns, message) => ({ patterns: patterns.map((group) => ({ group: [group], message })) });

export default tseslint.config(
  { ignores: [".next/**", "out/**", "node_modules/**", "next-env.d.ts", "data/**", "tools/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/engine/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", sem(["react", "react-dom", "react/*", "next", "next/*", "**/ui/**"], "O motor não pode importar React, Next nem a UI.")],
      "no-restricted-globals": ["error", "window", "document", "localStorage", "sessionStorage", "navigator"],
    },
  },
  {
    files: ["src/ui/**/*.{ts,tsx}", "src/app/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", sem(["**/engine/verdade/**", "**/engine/repositorio/**", "**/engine/worker/**"], "A UI só fala com o motor pelo cliente e lê dados pela Vista.")],
    },
  },
);
