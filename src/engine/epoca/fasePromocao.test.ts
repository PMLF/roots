import { describe, expect, it } from "vitest";
import { PARAMETROS_PADRAO } from "../config/parametros";
import type { SerieCP } from "../dados/tipos";
import { calendarioDoGrupo, classificarGrupo, formarGrupos, promovidosDoGrupo } from "./fasePromocao";

const serieDe = (d: string) => d[0] as SerieCP;
const campeoes = ["A", "B", "C", "D"].flatMap((s) => [1, 2, 3, 4, 5].map((i) => ({ clube: `${s}${i}`, distrito: `${s}${i}` })));

describe("Fase de Promoção", () => {
  it("forma 4 grupos de 5 pelas séries", () => {
    const { grupos, avisos } = formarGrupos(campeoes, serieDe, PARAMETROS_PADRAO);
    expect(avisos).toEqual([]);
    expect(grupos.map((g) => g.clubes.length)).toEqual([5, 5, 5, 5]);
    expect(grupos[1]!.clubes).toEqual(["B1", "B2", "B3", "B4", "B5"]);
  });

  it("avisa de grupos incompletos", () => {
    expect(formarGrupos(campeoes.slice(1), serieDe, PARAMETROS_PADRAO).avisos).toHaveLength(1);
  });

  it("o calendário é uma volta: cada par joga uma vez (10 jogos, 5 rondas com folga)", () => {
    const { grupos } = formarGrupos(campeoes, serieDe, PARAMETROS_PADRAO);
    const cal = calendarioDoGrupo(grupos[0]!, 1, "seed", PARAMETROS_PADRAO);
    expect(cal).toHaveLength(5);
    const pares = cal.flatMap((r) => r.jogos.map((j) => [j.casa, j.fora].sort().join("-")));
    expect(pares).toHaveLength(10);
    expect(new Set(pares).size).toBe(10);
  });

  it("promove os 2 primeiros do grupo e desempata pelo menor reputação", () => {
    const { grupos } = formarGrupos(campeoes, serieDe, PARAMETROS_PADRAO);
    const g = grupos[2]!; // C1..C5
    const jogos = [
      { casa: "C1", fora: "C2", golosCasa: 1, golosFora: 0 },
      { casa: "C3", fora: "C4", golosCasa: 1, golosFora: 0 },
      { casa: "C5", fora: "C1", golosCasa: 0, golosFora: 1 },
    ];
    // C1 tem 6 pontos; C3 tem 3, tal como... C3 1 jogo=3 pts; os restantes 0 → C3 segundo
    const tabela = classificarGrupo(g, jogos, 1, "seed", PARAMETROS_PADRAO, new Map());
    expect(tabela.slice(0, 2)).toEqual(["C1", "C3"]);
    expect(promovidosDoGrupo(g, tabela, PARAMETROS_PADRAO)).toEqual([{ clube: "C1", serie: "C" }, { clube: "C3", serie: "C" }]);
    // empate total entre C2, C4, C5 (0 pontos, DG diferentes) — sem jogos extra, o desempate é estável
    expect(classificarGrupo(g, jogos, 1, "seed", PARAMETROS_PADRAO, new Map())).toEqual(tabela);
  });
});
