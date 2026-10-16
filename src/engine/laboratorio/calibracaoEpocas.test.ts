import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Servicos } from "../api/handler";
import { RepositorioMemoria } from "../persistencia/repositorioMemoria";
import { avaliarCalibracao, correrEpocas, formatarRelatorio } from "./calibracaoEpocas";

const ler = (f: string) => readFileSync(`data/${f}.csv`, "utf8");
const servicos = (): Servicos => {
  const repositorio = new RepositorioMemoria();
  return {
    agora: () => new Date(2026, 9, 15),
    abrirRepositorio: async () => ({ repositorio, backend: "memoria" as const, versaoSqlite: "teste" }),
    carregarDados: async () => ({ clubes: ler("clubes"), cidades: ler("cidades"), localidades: ler("localidades"), rivalidades: ler("rivalidades"), distritos: ler("distritos"), paises: ler("paises") }),
  };
};

/** `RAIZES_CALIBRAR=50 pnpm calibrar` corre N épocas e imprime o relatório; sem isso, corre 2 como teste de fumo. */
const N = Number(process.env.RAIZES_CALIBRAR ?? 0);

describe("harness de calibração (RZ-123)", () => {
  it(N > 0 ? `${N} épocas: relatório` : "2 épocas: o harness corre e produz números sãos", async () => {
    const r = await correrEpocas(servicos(), process.env.RAIZES_SEED ?? "calibracao", N > 0 ? N : 2, (e) => { if (N > 0) console.log(`época ${e.epoca} feita`); });
    const texto = formatarRelatorio(r);
    console.log("\n" + texto);
    if (N > 0) { mkdirSync("calibracao", { recursive: true }); writeFileSync("calibracao/relatorio.md", texto + "\n"); }
    expect(r.epocas).toHaveLength(N > 0 ? N : 2);
    for (const e of r.epocas) {
      expect(e.jogos).toBeGreaterThan(1000);
      expect(e.golosPorJogo.primeiraLiga).toBeGreaterThan(0);
    }
    if (N >= 5) expect(avaliarCalibracao(r)).toEqual([]);
  }, 3_600_000);
});
