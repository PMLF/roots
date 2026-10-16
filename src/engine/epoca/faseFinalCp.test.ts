import { describe, expect, it } from "vitest";
import { PARAMETROS_PADRAO as P } from "../config/parametros";
import { diaDaSemana } from "../calendario/datas";
import { datasDaFaseFinal, emparelharMeiasFinais, ordenarCampeoes, vencedorEliminatoria, type CampeaoDeSerie } from "./faseFinalCp";

const c = (clube: string, serie: CampeaoDeSerie["serie"], pontos: number, extra: Partial<CampeaoDeSerie> = {}): CampeaoDeSerie => ({ serie, clube, jogos: 18, pontos, diferenca: 20, golosMarcados: 40, reputacao: 100, ...extra });

describe("fase final do CP", () => {
  it("meias-finais: o melhor contra o pior e o segundo contra o terceiro, com o melhor em casa", () => {
    const r = emparelharMeiasFinais([c("b", "B", 45), c("a", "A", 50), c("d", "D", 38), c("cc", "C", 41)]);
    expect(r).toEqual([{ casa: "a", fora: "d" }, { casa: "b", fora: "cc" }]);
  });
  it("desempata por pontos por jogo, diferença, golos, menor reputação e id", () => {
    expect(ordenarCampeoes([c("a", "A", 40, { jogos: 20 }), c("b", "B", 40, { jogos: 18 })])[0]!.clube).toBe("b");
    expect(ordenarCampeoes([c("a", "A", 40, { diferenca: 10 }), c("b", "B", 40, { diferenca: 15 })])[0]!.clube).toBe("b");
    expect(ordenarCampeoes([c("a", "A", 40, { golosMarcados: 30 }), c("b", "B", 40, { golosMarcados: 35 })])[0]!.clube).toBe("b");
    expect(ordenarCampeoes([c("a", "A", 40, { reputacao: 300 }), c("b", "B", 40, { reputacao: 90 })])[0]!.clube).toBe("b");
    expect(ordenarCampeoes([c("b", "B", 40), c("a", "A", 40)])[0]!.clube).toBe("a");
  });
  it("precisa dos quatro campeões", () => {
    expect(() => emparelharMeiasFinais([c("a", "A", 40)])).toThrow();
  });
  it("sem empate passa quem marcou mais; com empate decidem os penáltis, sempre os mesmos e com um vencedor", () => {
    expect(vencedorEliminatoria({ seed: "s", id: "j", casa: "x", fora: "y", golosCasa: 2, golosFora: 1 }, P)).toEqual({ vencedor: "x" });
    expect(vencedorEliminatoria({ seed: "s", id: "j", casa: "x", fora: "y", golosCasa: 0, golosFora: 1 }, P)).toEqual({ vencedor: "y" });
    const a = vencedorEliminatoria({ seed: "s", id: "j", casa: "x", fora: "y", golosCasa: 1, golosFora: 1 }, P);
    expect(vencedorEliminatoria({ seed: "s", id: "j", casa: "x", fora: "y", golosCasa: 1, golosFora: 1 }, P)).toEqual(a);
    expect(a.penaltis).toBeDefined();
    expect(a.penaltis!.casa).not.toBe(a.penaltis!.fora);
    expect(a.vencedor).toBe(a.penaltis!.casa > a.penaltis!.fora ? "x" : "y");
  });
  it("os penáltis dão vitórias aos dois lados, perto de metade-metade", () => {
    let casa = 0;
    for (let i = 0; i < 2000; i++) if (vencedorEliminatoria({ seed: "s", id: `j${i}`, casa: "x", fora: "y", golosCasa: 0, golosFora: 0 }, P).vencedor === "x") casa++;
    expect(casa / 2000).toBeGreaterThan(0.45);
    expect(casa / 2000).toBeLessThan(0.55);
  });
  it("as datas são domingos, depois das séries, e a final vem a seguir às meias-finais", () => {
    const d = datasDaFaseFinal("2027-04-25", P);
    expect(diaDaSemana(d.meiasFinais)).toBe(0);
    expect(diaDaSemana(d.final)).toBe(0);
    expect(d.meiasFinais > "2027-04-25").toBe(true);
    expect(d.final > d.meiasFinais).toBe(true);
    expect(d.final <= "2027-05-31").toBe(true);
  });
});
