import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PARAMETROS_PADRAO as P } from "../config/parametros";
import { importarDados } from "../dados/importar";
import { gerarMundo } from "../mundo/gerarMundo";
import { importarPaises } from "../mundo/paises";
import { equipaDe, forcaEquipa, type CandidatoOnze } from "./equipa";
import { simularJogo } from "./simulador";
import type { EquipaJogo } from "./tipos";

const ler = (f: string) => readFileSync(`data/${f}`, "utf8");
const d = importarDados({ clubes: ler("clubes.csv"), cidades: ler("cidades.csv"), localidades: ler("localidades.csv"), rivalidades: ler("rivalidades.csv"), distritos: ler("distritos.csv") });
const pr = importarPaises(ler("paises.csv"));
if (!d.ok || !pr.ok) throw new Error("dados inválidos");
const lote = gerarMundo({ seed: "jogo-mundo", dados: d.dados, paises: pr.paises, params: P });

function equipaDoClube(clube: string): EquipaJogo {
  const cs: CandidatoOnze[] = lote.jogadores
    .filter((j) => j.clube === clube && j.estado === "ativo")
    .map((j) => ({ pessoa: j.pessoa, posicoes: j.posicoes, atributos: j.atributos, alturaCm: j.alturaCm }));
  return equipaDe(clube, cs);
}
const primeiro = (esc: string, n = 1) => d.dados.clubes.filter((c) => c.escalao === esc).slice(0, n).map((c) => c.id);

describe("motor de jogo com o mundo gerado", () => {
  it("todos os clubes montam onze com 1 guarda-redes e a força cresce com o escalão", () => {
    const media: Record<string, number[]> = {};
    for (const c of d.dados.clubes) {
      const eq = equipaDoClube(c.id);
      expect(eq.onze).toHaveLength(11);
      expect(eq.onze.filter((j) => j.posicao === "GR")).toHaveLength(1);
      const f = forcaEquipa(eq.onze);
      (media[c.escalao] ??= []).push((f.ataque + f.controlo + f.defesa) / 3);
    }
    const m = (e: string) => (media[e] as number[]).reduce((a, b) => a + b, 0) / (media[e] as number[]).length;
    expect(m("primeiraLiga")).toBeGreaterThan(m("segundaLiga"));
    expect(m("segundaLiga")).toBeGreaterThan(m("terceiraLiga"));
    expect(m("terceiraLiga")).toBeGreaterThan(m("cp"));
    expect(m("cp")).toBeGreaterThan(m("distrital"));
  });

  it("um clube da Primeira Liga ganha quase sempre a um distrital; e entre pares há equilíbrio", () => {
    const [pl1, pl2] = primeiro("primeiraLiga", 2) as [string, string];
    const [di] = primeiro("distrital") as [string];
    const a = equipaDoClube(pl1);
    const b = equipaDoClube(pl2);
    const z = equipaDoClube(di);
    let vitorias = 0;
    let golosPares = 0;
    let vitoriasA = 0;
    const N = 300;
    for (let i = 0; i < N; i++) {
      const r1 = simularJogo({ seed: "w", id: `x${i}`, casa: a, fora: z }, P).resumo;
      if (r1.casa.golos > r1.fora.golos) vitorias++;
      const r2 = simularJogo({ seed: "w", id: `y${i}`, casa: a, fora: b }, P).resumo;
      golosPares += r2.casa.golos + r2.fora.golos;
      if (r2.casa.golos > r2.fora.golos) vitoriasA++;
    }
    expect(vitorias / N).toBeGreaterThan(0.75);
    expect(golosPares / N).toBeGreaterThan(1.8);
    expect(golosPares / N).toBeLessThan(3.6);
    expect(vitoriasA / N).toBeGreaterThan(0.2);
    expect(vitoriasA / N).toBeLessThan(0.8);
  });
});
