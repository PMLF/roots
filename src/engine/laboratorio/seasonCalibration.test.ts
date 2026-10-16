import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Servicos } from "../api/handler";
import { RepositorioMemoria } from "../persistencia/repositorioMemoria";
import { evaluateCalibration, formatReport, runSeasons } from "./seasonCalibration";

const read = (f: string) => readFileSync(`data/${f}.csv`, "utf8");
const services = (): Servicos => {
  const repositorio = new RepositorioMemoria();
  return {
    agora: () => new Date(2026, 9, 15),
    abrirRepositorio: async () => ({ repositorio, backend: "memoria" as const, versaoSqlite: "teste" }),
    carregarDados: async () => ({ clubes: read("clubes"), cidades: read("cidades"), localidades: read("localidades"), rivalidades: read("rivalidades"), distritos: read("distritos"), paises: read("paises") }),
  };
};

/** `CALIBRATE_SEASONS=50 pnpm calibrate` plays N seasons and writes `calibration/report.md`; without it, a 2-season smoke test runs. */
const N = Number(process.env.CALIBRATE_SEASONS ?? 0);

describe("calibration harness (RZ-123)", () => {
  it(N > 0 ? `${N} seasons: report` : "2 seasons: the harness runs and produces sane numbers", async () => {
    const r = await runSeasons(services(), process.env.CALIBRATE_SEED ?? "calibration", N > 0 ? N : 2, (s) => { if (N > 0) console.log(`season ${s.season} done`); });
    const text = formatReport(r);
    console.log("\n" + text);
    if (N > 0) { mkdirSync("calibration", { recursive: true }); writeFileSync("calibration/report.md", text + "\n"); }
    expect(r.seasons).toHaveLength(N > 0 ? N : 2);
    for (const s of r.seasons) {
      expect(s.games).toBeGreaterThan(1000);
      expect(s.goalsPerGame.primeiraLiga).toBeGreaterThan(0);
    }
    if (N >= 5) expect(evaluateCalibration(r)).toEqual([]);
  }, 3_600_000);
});
