import { describe, expect, it } from "vitest";
import { PARAMETROS_PADRAO } from "../config/parametros";
import type { CidadeBase } from "../dados/tipos";
import { fatoresDeDistrito, valorDoFinalista, valorDoPremio } from "./premiosCompeticao";

const cidade = (distrito: string, orcamento: number, apoio: number): CidadeBase => ({ id: `${distrito}${orcamento}`, nome: "x", distrito, populacao: 1, setor: "", tag2: "", polo: "", ilha: false, orcamentoMunicipal: orcamento, autarca: { nome: "a", tracos: { ambicao: 1, vaidade: 1, paciencia: 1, integridade: 1 }, apoioDesporto: apoio }, culturaFutebol: 50, clubes: [] });

describe("premiosCompeticao", () => {
  const p = PARAMETROS_PADRAO;
  it("valores fixos das ligas e do CP", () => {
    expect(valorDoPremio("primeiraLiga", p)).toBe(10_000_000);
    expect(valorDoPremio("serieCp", p) + valorDoPremio("vencedorCp", p)).toBe(200_000);
  });
  it("distritais escalam com o fator, dentro dos limites", () => {
    const f = fatoresDeDistrito([cidade("A", 1e6, 2), cidade("B", 1e7, 8), cidade("C", 5e6, 5)], p);
    expect(f.get("A")!).toBeLessThan(f.get("C")!);
    expect(f.get("C")!).toBeLessThan(f.get("B")!);
    for (const v of f.values()) { expect(v).toBeGreaterThanOrEqual(p.premios.fatorDistrito.min); expect(v).toBeLessThanOrEqual(p.premios.fatorDistrito.max); }
    expect(valorDoPremio("distrital", p, 2)).toBe(10_000);
    expect(valorDoPremio("serieCp", p, 2)).toBe(100_000);
  });
  it("finalista vencido recebe 25 %", () => {
    expect(valorDoFinalista(2_000_000, p)).toBe(500_000);
  });
});
