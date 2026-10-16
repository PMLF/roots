import { describe, expect, it } from "vitest";
import { PARAMETROS_PADRAO } from "../config/parametros";
import type { ClubeBase } from "../dados/tipos";
import { RepositorioMemoria } from "../persistencia/repositorioMemoria";
import { premioDeRonda } from "../epoca/premiosCompeticao";
import { assistenciaDoJogo } from "./assistencia";
import { definirOrcamento, orcamentoDoClube, orcamentoPorDefeito } from "./orcamento";
import { fatorReputacao, fecharMesesAte, lancar, liquidar, mesDoClube, saldoDoClube } from "./financas";

const p = PARAMETROS_PADRAO;
const clube = (id: string, escalao: ClubeBase["escalao"], reputacao: number, capacidade: number, rival = ""): ClubeBase => ({ id, nome: id, escalao, reputacao, financas: 100_000, rival, estadio: { capacidade } } as unknown as ClubeBase);

describe("livro de finanças", () => {
  it("o saldo arranca no capital inicial e os lançamentos somam ao saldo e ao mês", () => {
    const repo = new RepositorioMemoria();
    const c = clube("a", "cp", 2590, 3000);
    expect(saldoDoClube(repo, c)).toBe(100_000);
    lancar(repo, c, "bilheteira", 5_000);
    lancar(repo, c, "salarios", -2_000);
    lancar(repo, c, "bilheteira", 1_000);
    expect(saldoDoClube(repo, c)).toBe(104_000);
    expect(mesDoClube(repo, "a")).toEqual({ bilheteira: 6_000, salarios: -2_000 });
  });
  it("o fecho mensal corre uma vez por mês em atraso e zera o mês", () => {
    const repo = new RepositorioMemoria();
    const c = clube("a", "cp", 2590, 3000);
    const dados = { clubes: [c] } as never;
    fecharMesesAte(repo, dados, p, "2026-07-01", 1, () => true); // arranque: só marca o mês
    expect(repo.contar("FECHO_FINANCEIRO")).toBe(0);
    fecharMesesAte(repo, dados, p, "2026-10-01", 1, () => true);
    expect(repo.contar("FECHO_FINANCEIRO", { k: "clube", id: "a" })).toBe(3);
    fecharMesesAte(repo, dados, p, "2026-10-01", 1, () => true);
    expect(repo.contar("FECHO_FINANCEIRO")).toBe(3);
    expect(mesDoClube(repo, "a")).toEqual({});
  });
  it("um clube de maior reputação vale mais, dentro de limites", () => {
    expect(fatorReputacao(clube("a", "cp", 2590 * 2, 1), p)).toBeGreaterThan(fatorReputacao(clube("b", "cp", 2590, 1), p));
    expect(fatorReputacao(clube("c", "cp", 1, 1), p)).toBeCloseTo(0.5 ** p.financas.modelo.expoenteReputacao);
  });
});

describe("assistência v1", () => {
  const casa = clube("casa", "distrital", 1295, 2000, "fora");
  it("dérbi e final enchem mais o estádio; nunca passa da capacidade", () => {
    const normal = assistenciaDoJogo({ casa, fora: clube("x", "distrital", 1295, 1), culturaFutebol: 50 }, p);
    const derbi = assistenciaDoJogo({ casa, fora: clube("fora", "distrital", 1295, 1, "casa"), culturaFutebol: 50 }, p);
    const final = assistenciaDoJogo({ casa, fora: clube("x", "distrital", 1295, 1), culturaFutebol: 50, final: true }, p);
    expect(derbi.assistencia).toBeGreaterThan(normal.assistencia);
    expect(final.assistencia).toBeGreaterThan(normal.assistencia);
    expect(final.assistencia).toBeLessThanOrEqual(2000);
    expect(normal.receita).toBe(Math.round(normal.assistencia * p.financas.modelo.precoBilhete.distrital));
  });
  it("a cultura de futebol da cidade pesa", () => {
    const f = clube("x", "distrital", 1295, 1);
    expect(assistenciaDoJogo({ casa, fora: f, culturaFutebol: 90 }, p).assistencia).toBeGreaterThan(assistenciaDoJogo({ casa, fora: f, culturaFutebol: 10 }, p).assistencia);
  });
});

describe("prémio por ronda da Taça", () => {
  it("meias 500 k€ e metade em cada ronda para trás, com mínimo", () => {
    expect(premioDeRonda(0, p)).toBe(500_000);
    expect(premioDeRonda(1, p)).toBe(250_000);
    expect(premioDeRonda(2, p)).toBe(125_000);
    expect(premioDeRonda(30, p)).toBe(5_000);
  });
});

describe("transferências e orçamento", () => {
  it("o pagamento entre clubes é soma zero e vai para a categoria certa; recebe e paga no mesmo mês somam-se", () => {
    const repo = new RepositorioMemoria();
    const a = clube("a", "segundaLiga", 4650, 7000);
    const b = clube("b", "terceiraLiga", 3000, 3900);
    liquidar(repo, a, b, 300_000, "transferencias");
    liquidar(repo, b, a, 50_000, "compensacoes");
    expect(saldoDoClube(repo, a) + saldoDoClube(repo, b)).toBe(200_000);
    expect(saldoDoClube(repo, a)).toBe(100_000 - 300_000 + 50_000);
    expect(mesDoClube(repo, "a")).toEqual({ transferencias: -300_000, compensacoes: 50_000 });
    liquidar(repo, a, b, 0, "transferencias");
    expect(saldoDoClube(repo, a)).toBe(-150_000);
  });
  it("sem contratos a massa por defeito vem das receitas; o gamer redefine-a e a verba não passa da caixa", () => {
    const repo = new RepositorioMemoria();
    const a = { ...clube("a", "segundaLiga", 4650, 7000), financas: 2_000_000 };
    const o = orcamentoPorDefeito(repo, a, p, 1);
    expect(o.massaSalarialMax).toBeGreaterThan(0);
    expect(o.transferencias).toBeGreaterThan(0);
    expect(o.transferencias).toBeLessThan(2_000_000);
    expect(orcamentoDoClube(repo, a, p, 1)).toEqual(o);
    expect(definirOrcamento(repo, a, p, 1, { massaSalarialMax: 900_000, transferencias: 100_000 })).toMatchObject({ massaSalarialMax: 900_000, transferencias: 100_000 });
    expect(orcamentoDoClube(repo, a, p, 1).massaSalarialMax).toBe(900_000);
    expect(orcamentoDoClube(repo, a, p, 2).massaSalarialMax).not.toBe(900_000); // nova época: volta ao defeito
    expect(() => definirOrcamento(repo, a, p, 1, { massaSalarialMax: 1, transferencias: 3_000_000 })).toThrow();
    expect(() => definirOrcamento(repo, a, p, 1, { massaSalarialMax: -1, transferencias: 0 })).toThrow();
  });
});
