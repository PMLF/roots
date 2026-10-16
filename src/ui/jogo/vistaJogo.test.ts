import { describe, expect, it } from "vitest";
import type { JogoVivo } from "@/engine/epoca/jogoAoVivo";
import type { EstatLado } from "@/engine/jogo/tipos";
import { estatisticasDoJogo, marcadorAo, tabelaAoVivo } from "./vistaJogo";

const lado = (x: Partial<EstatLado>): EstatLado => ({ golos: 0, oportunidades: 0, remates: 0, aBaliza: 0, bloqueados: 0, xg: 0, cantos: 0, faltas: 0, minutosPosse: 0, amarelos: 0, vermelhos: 0, lesoes: 0, ...x });

describe("vista do jogo", () => {
  it("estatísticas: 14 linhas, derivadas coerentes e posse a somar 100%", () => {
    const l = estatisticasDoJogo({ casa: lado({ remates: 10, aBaliza: 5, bloqueados: 2, golos: 2 }), fora: lado({ remates: 4, aBaliza: 3, bloqueados: 0, golos: 1 }), posseCasa: 0.6 });
    expect(l).toHaveLength(14);
    const por = Object.fromEntries(l.map((x) => [x.chave, x]));
    expect(por.fora).toMatchObject({ casa: 3, fora: 1 });
    expect(por.precisao).toMatchObject({ casa: 0.5, fora: 0.75 });
    expect(por.defesas).toMatchObject({ casa: 2, fora: 3 }); // casa defendeu 3-1 do adversário; fora defendeu 5-2
    expect(por.posse!.casa + por.posse!.fora).toBeCloseTo(1);
  });

  it("marcador e tabela ao vivo somam só o que já aconteceu", () => {
    expect(marcadorAo([{ minuto: 10, lado: "casa" }, { minuto: 50, lado: "fora" }], 30)).toEqual([1, 0]);
    const jogo = {
      casa: { id: "A", nome: "A" }, fora: { id: "B", nome: "B" }, pontosVitoria: 3, pontosEmpate: 1, linhas: [{ minuto: 10, tipo: "golo", lado: "casa", importante: true, golosCasa: 1, golosFora: 0 }],
      outros: [{ id: "x", casa: { id: "C", nome: "C" }, fora: { id: "D", nome: "D" }, duracao: 90, golos: [{ minuto: 20, lado: "fora" }], golosCasa: 0, golosFora: 1 }],
      tabela: ["A", "B", "C", "D"].map((c) => ({ clube: c, nome: c, jogos: 0, pontos: 0, golosMarcados: 0, golosSofridos: 0 })),
    } as unknown as JogoVivo;
    const aos15 = Object.fromEntries(tabelaAoVivo(jogo, 15).map((l) => [l.clube, l.pontos]));
    expect(aos15).toEqual({ A: 3, B: 0, C: 1, D: 1 });
    const aos25 = Object.fromEntries(tabelaAoVivo(jogo, 25).map((l) => [l.clube, l.pontos]));
    expect(aos25).toEqual({ A: 3, B: 0, C: 0, D: 3 });
  });
});
