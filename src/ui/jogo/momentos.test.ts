import { describe, expect, it } from "vitest";
import type { MomentoChave } from "../../engine/jogo/estatisticas";
import { marcadorEmTexto, momentoEmTexto } from "./momentos";

const nomes = { jogador: (id: string) => ({ a: "Rui Alves", b: "Tiago Melo", gr: "Nuno Reis" })[id] ?? id, clube: { casa: "CD Foz", fora: "SC Mar" } };
const golo = (extra: Partial<Extract<MomentoChave, { tipo: "golo" }>> = {}): Extract<MomentoChave, { tipo: "golo" }> => ({ tipo: "golo", minuto: 34, lado: "casa", jogador: "a", origem: "jogada", contexto: "abertura", golosCasa: 1, golosFora: 0, ...extra });

describe("momentos em texto", () => {
  it("escreve golos com contexto e assistência", () => {
    expect(momentoEmTexto("pt-PT", golo({ assistente: "b" }), nomes)).toBe("34' — Rui Alves abre o marcador (CD Foz). Assistência de Tiago Melo.");
    expect(momentoEmTexto("en", golo({ contexto: "reviravolta", lado: "fora" }), nomes)).toBe("34' — Rui Alves turns the game around for SC Mar.");
  });
  it("a origem do golo tem prioridade sobre o contexto", () => {
    expect(momentoEmTexto("pt-PT", golo({ origem: "penalti" }), nomes)).toContain("converte o penálti");
    expect(momentoEmTexto("pt-PT", golo({ origem: "canto" }), nomes)).toContain("canto");
  });
  it("escreve penáltis falhados, grandes defesas e ocasiões falhadas", () => {
    expect(momentoEmTexto("pt-PT", { tipo: "penalti-falhado", minuto: 70, lado: "fora", jogador: "a", guardaRedes: "gr", defendido: true }, nomes)).toBe("70' — Nuno Reis defende o penálti de Rui Alves.");
    expect(momentoEmTexto("pt-PT", { tipo: "penalti-falhado", minuto: 70, lado: "fora", jogador: "a", defendido: false }, nomes)).toBe("70' — Rui Alves falha o penálti.");
    expect(momentoEmTexto("en", { tipo: "grande-defesa", minuto: 12, lado: "casa", jogador: "a", guardaRedes: "gr", xg: 0.4 }, nomes)).toBe("12' — Great save by Nuno Reis from Rui Alves.");
    expect(momentoEmTexto("pt-PT", { tipo: "ocasiao-falhada", minuto: 5, lado: "casa", jogador: "a", xg: 0.5 }, nomes)).toBe("5' — Rui Alves desperdiça uma grande ocasião para CD Foz.");
  });
  it("escreve o marcador", () => {
    expect(marcadorEmTexto("pt-PT", golo(), nomes)).toBe("CD Foz 1-0 SC Mar");
  });
});
