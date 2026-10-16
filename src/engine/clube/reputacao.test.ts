import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS as P, validateParameters } from "../config/parametros";
import { generalLevel } from "../mundo/nivel";
import { reputationLevel } from "./reputacao";

describe("reputação em palavras", () => {
  it("fronteiras e extremos", () => {
    expect(reputationLevel(10000, P)).toBe("mundial");
    expect(reputationLevel(9000, P)).toBe("mundial");
    expect(reputationLevel(8999, P)).toBe("continental");
    expect(reputationLevel(8300, P)).toBe("continental"); // os maiores clubes do arranque
    expect(reputationLevel(5000, P)).toBe("nacional");
    expect(reputationLevel(2592, P)).toBe("regional"); // Campeonato de Portugal
    expect(reputationLevel(1296, P)).toBe("local"); // distritais
    expect(reputationLevel(900, P)).toBe("obscuro");
    expect(reputationLevel(0, P)).toBe("obscuro");
  });
  it("validação dos níveis", () => {
    expect(validateParameters(P)).toEqual([]);
    expect(validateParameters({ ...P, reputation: { levels: [...P.reputation.levels].reverse() } })).not.toEqual([]);
  });
});

describe("nível geral do jogador", () => {
  it("média dos atributos-chave; sem todos, desconhecido", () => {
    expect(generalLevel(() => 12, "ST")).toBe(12);
    expect(generalLevel((a) => (a === "finishing" ? 18 : 10), "ST")).toBe(11.3);
    expect(generalLevel((a) => (a === "finishing" ? 18 : undefined), "ST")).toBeUndefined();
  });
});
