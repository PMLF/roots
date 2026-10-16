import { describe, expect, it } from "vitest";
import { consecutiveYears, winnersPerDistrict, type RankedClub } from "./premioEstado";

const c = (club: string, extra: Partial<RankedClub> = {}): RankedClub => ({ club, district: "Braga", tier: "district", position: 1, matches: 20, points: 40, difference: 10, scoredGoals: 30, reputation: 100, ...extra });

describe("Prémio do Estado", () => {
  it("o escalão mais alto vence a posição: um 15.º da Terceira Liga bate um campeão distrital", () => {
    expect(winnersPerDistrict([c("champion"), c("third", { tier: "thirdLeague", position: 15 })])[0]!.club).toBe("third");
  });
  it("no mesmo escalão, a melhor posição na tabela", () => {
    expect(winnersPerDistrict([c("segundo", { position: 2 }), c("first", { position: 1 })])[0]!.club).toBe("first");
  });
  it("posições iguais (séries diferentes do CP): pontos por jogo, diferença, golos e, por fim, menor reputação", () => {
    const base = { tier: "cp" as const };
    expect(winnersPerDistrict([c("a", { ...base, points: 48, matches: 20 }), c("b", { ...base, points: 50, matches: 20 })])[0]!.club).toBe("b");
    expect(winnersPerDistrict([c("a", { ...base, difference: 5 }), c("b", { ...base, difference: 9 })])[0]!.club).toBe("b");
    expect(winnersPerDistrict([c("a", { ...base, scoredGoals: 40 }), c("b", { ...base, scoredGoals: 35 })])[0]!.club).toBe("a");
    expect(winnersPerDistrict([c("grande", { ...base, reputation: 300 }), c("pequeno", { ...base, reputation: 80 })])[0]!.club).toBe("pequeno");
  });
  it("empate total e reputações iguais: decide o id, sempre o mesmo", () => {
    expect(winnersPerDistrict([c("b"), c("a")])[0]!.club).toBe("a");
    expect(winnersPerDistrict([c("a"), c("b")])[0]!.club).toBe("a");
  });
  it("um prémio por distrito, ordenado", () => {
    const r = winnersPerDistrict([c("x", { district: "Viseu" }), c("y", { district: "Braga" }), c("z", { district: "Braga", position: 2 })]);
    expect(r).toEqual([{ district: "Braga", club: "y" }, { district: "Viseu", club: "x" }]);
  });
  it("conta os anos seguidos do mesmo clube e recomeça noutro", () => {
    expect(consecutiveYears(undefined, "a")).toBe(1);
    expect(consecutiveYears({ club: "a", consecutive: 2 }, "a")).toBe(3);
    expect(consecutiveYears({ club: "a", consecutive: 2 }, "b")).toBe(1);
  });
});
