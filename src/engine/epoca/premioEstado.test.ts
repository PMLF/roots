import { describe, expect, it } from "vitest";
import { anosSeguidos, premiadosPorDistrito, type ClubeClassificado } from "./premioEstado";

const c = (clube: string, extra: Partial<ClubeClassificado> = {}): ClubeClassificado => ({ clube, distrito: "Braga", escalao: "distrital", posicao: 1, jogos: 20, pontos: 40, diferenca: 10, golosMarcados: 30, reputacao: 100, ...extra });

describe("Prémio do Estado", () => {
  it("o escalão mais alto vence a posição: um 15.º da Terceira Liga bate um campeão distrital", () => {
    expect(premiadosPorDistrito([c("campeao"), c("terceira", { escalao: "terceiraLiga", posicao: 15 })])[0]!.clube).toBe("terceira");
  });
  it("no mesmo escalão, a melhor posição na tabela", () => {
    expect(premiadosPorDistrito([c("segundo", { posicao: 2 }), c("primeiro", { posicao: 1 })])[0]!.clube).toBe("primeiro");
  });
  it("posições iguais (séries diferentes do CP): pontos por jogo, diferença, golos e, por fim, menor reputação", () => {
    const base = { escalao: "cp" as const };
    expect(premiadosPorDistrito([c("a", { ...base, pontos: 48, jogos: 20 }), c("b", { ...base, pontos: 50, jogos: 20 })])[0]!.clube).toBe("b");
    expect(premiadosPorDistrito([c("a", { ...base, diferenca: 5 }), c("b", { ...base, diferenca: 9 })])[0]!.clube).toBe("b");
    expect(premiadosPorDistrito([c("a", { ...base, golosMarcados: 40 }), c("b", { ...base, golosMarcados: 35 })])[0]!.clube).toBe("a");
    expect(premiadosPorDistrito([c("grande", { ...base, reputacao: 300 }), c("pequeno", { ...base, reputacao: 80 })])[0]!.clube).toBe("pequeno");
  });
  it("empate total e reputações iguais: decide o id, sempre o mesmo", () => {
    expect(premiadosPorDistrito([c("b"), c("a")])[0]!.clube).toBe("a");
    expect(premiadosPorDistrito([c("a"), c("b")])[0]!.clube).toBe("a");
  });
  it("um prémio por distrito, ordenado", () => {
    const r = premiadosPorDistrito([c("x", { distrito: "Viseu" }), c("y", { distrito: "Braga" }), c("z", { distrito: "Braga", posicao: 2 })]);
    expect(r).toEqual([{ distrito: "Braga", clube: "y" }, { distrito: "Viseu", clube: "x" }]);
  });
  it("conta os anos seguidos do mesmo clube e recomeça noutro", () => {
    expect(anosSeguidos(undefined, "a")).toBe(1);
    expect(anosSeguidos({ clube: "a", seguidos: 2 }, "a")).toBe(3);
    expect(anosSeguidos({ clube: "a", seguidos: 2 }, "b")).toBe(1);
  });
});
