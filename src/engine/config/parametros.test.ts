import { describe, expect, it } from "vitest";
import { PARAMETROS_PADRAO, criarParametros, derivados, validarParametros } from "./parametros";

describe("parâmetros padrão", () => {
  it("são coerentes", () => {
    expect(validarParametros(PARAMETROS_PADRAO)).toEqual([]);
  });

  it("batem com o Clubes_Raizes.xlsx › Parâmetros (prémios, distritais, CP, promoção)", () => {
    const p = PARAMETROS_PADRAO;
    expect({ clube: p.premios.clube, cidade: p.premios.cidade }).toEqual({ clube: 2_000_000, cidade: 1_000_000 });
    expect([p.distritais.alvo, p.distritais.min, p.distritais.max]).toEqual([10, 8, 14]);
    expect([p.piramide.cp.series, p.piramide.cp.clubesPorSerie, p.piramide.promocao.promovidosPorGrupo, p.piramide.distritos]).toEqual([4, 10, 2, 20]);
  });

  it("derivam as contas da pirâmide: 8 promovidos, 8 descem do CP, 30 % de rotatividade", () => {
    const d = derivados(PARAMETROS_PADRAO);
    expect(d.promovidosAoCp).toBe(8);
    expect(d.descemDoCp).toBe(8);
    expect(d.descemPorSerieMedia).toBe(2);
    expect(d.percentagemSaidaCp).toBeCloseTo(0.3, 5);
  });
});

describe("criarParametros", () => {
  it("funde alterações parciais sem mexer no resto", () => {
    const p = criarParametros({ premios: { clube: 3_000_000 }, saves: { autosaveDias: 14 } });
    expect(p.premios.clube).toBe(3_000_000);
    expect(p.premios.cidade).toBe(1_000_000);
    expect(p.saves.autosaveDias).toBe(14);
    expect(p.saves.autosavesRotativos).toBe(3);
    expect(PARAMETROS_PADRAO.premios.clube).toBe(2_000_000);
  });

  it("recusa configurações incoerentes", () => {
    expect(() => criarParametros({ distritais: { min: 12 } })).toThrow(/distritais/);
    expect(() => criarParametros({ piramide: { promocao: { grupos: 5 } } })).toThrow(/promocao\.grupos/);
    expect(() => criarParametros({ financas: { percentisRiqueza: [50, 70, 40, 15] } })).toThrow(/percentisRiqueza/);
  });

  it("aceita variantes válidas de PROMO_POR_GRUPO (1 a 3) e recalcula as descidas do CP", () => {
    expect(derivados(criarParametros({ piramide: { promocao: { promovidosPorGrupo: 1 } } })).descemDoCp).toBe(4);
    expect(derivados(criarParametros({ piramide: { promocao: { promovidosPorGrupo: 3 } } })).descemDoCp).toBe(12);
  });
});
