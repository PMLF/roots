import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const alias = { "@": fileURLToPath(new URL("./src", import.meta.url)) };

// Dois projetos: `fast` (dia a dia) e `slow` (calibração e simulações de várias épocas, `*.slow.test.ts`).
// `pnpm test` = fast · `pnpm test:slow` = slow · `pnpm test:all` e o CI = ambos.
export default defineConfig({
  test: {
    projects: [
      { resolve: { alias }, test: { name: "fast", include: ["src/**/*.test.ts"], exclude: ["src/**/*.slow.test.ts", "**/node_modules/**"], environment: "node" } },
      { resolve: { alias }, test: { name: "slow", include: ["src/**/*.slow.test.ts"], environment: "node" } },
    ],
  },
});
