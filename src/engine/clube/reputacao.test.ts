import { describe, expect, it } from "vitest";
import { PARAMETROS_PADRAO as P, validarParametros } from "../config/parametros";
import { nivelGeral } from "../mundo/nivel";
import { nivelDeReputacao } from "./reputacao";

describe("reputação em palavras", () => {
  it("fronteiras e extremos", () => {
    expect(nivelDeReputacao(10000, P)).toBe("mundial");
    expect(nivelDeReputacao(9000, P)).toBe("mundial");
    expect(nivelDeReputacao(8999, P)).toBe("continental");
    expect(nivelDeReputacao(8300, P)).toBe("continental"); // os maiores clubes do arranque
    expect(nivelDeReputacao(5000, P)).toBe("nacional");
    expect(nivelDeReputacao(2592, P)).toBe("regional"); // Campeonato de Portugal
    expect(nivelDeReputacao(1296, P)).toBe("local"); // distritais
    expect(nivelDeReputacao(900, P)).toBe("obscuro");
    expect(nivelDeReputacao(0, P)).toBe("obscuro");
  });
  it("validação dos níveis", () => {
    expect(validarParametros(P)).toEqual([]);
    expect(validarParametros({ ...P, reputacao: { niveis: [...P.reputacao.niveis].reverse() } })).not.toEqual([]);
  });
});

describe("nível geral do jogador", () => {
  it("média dos atributos-chave; sem todos, desconhecido", () => {
    expect(nivelGeral(() => 12, "ST")).toBe(12);
    expect(nivelGeral((a) => (a === "finalizacao" ? 18 : 10), "ST")).toBe(11.3);
    expect(nivelGeral((a) => (a === "finalizacao" ? 18 : undefined), "ST")).toBeUndefined();
  });
});
