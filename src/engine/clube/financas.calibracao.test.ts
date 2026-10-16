import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { tratar, type Servicos } from "../api/handler";
import { RepositorioMemoria } from "../persistencia/repositorioMemoria";

const ler = (f: string) => readFileSync(`data/${f}.csv`, "utf8");
const servicos = (): Servicos => {
  const repositorio = new RepositorioMemoria();
  return {
    agora: () => new Date(2026, 9, 15),
    abrirRepositorio: async () => ({ repositorio, backend: "memoria" as const, versaoSqlite: "teste" }),
    carregarDados: async () => ({ clubes: ler("clubes"), cidades: ler("cidades"), localidades: ler("localidades"), rivalidades: ler("rivalidades"), distritos: ler("distritos"), paises: ler("paises") }),
  };
};
const mediana = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)] ?? 0;

describe("calibração das finanças (RZ-114)", () => {
  it("uma época: resultado líquido por escalão fica perto do equilíbrio e quase ninguém falha", async () => {
    const s = servicos();
    await tratar({ id: 1, tipo: "criarMundo", entrada: { seed: "financas" } }, s);
    const { repositorio: repo } = await s.abrirRepositorio();
    const clubes = await tratar({ id: 2, tipo: "clubes", entrada: null }, s);
    let fim = false, guarda = 0, resumo;
    while (!fim && guarda++ < 80) { const r = await tratar({ id: 3, tipo: "avancar", entrada: { modo: "semana" } }, s); fim = r.fimDeEpoca; resumo = r.resumoEpoca; }
    expect(resumo).toBeDefined();
    const por = new Map<string, { liq: number[]; pct: number[]; neg: number }>();
    for (const c of clubes) {
      const fechos = repo.eventosDe({ k: "clube", id: c.id }, { tipo: "FECHO_FINANCEIRO" });
      expect(fechos.length).toBeGreaterThanOrEqual(11);
      const liq = fechos.reduce((t, e) => t + Number(e.dados.receitas) + Number(e.dados.despesas), 0);
      const custos = fechos.reduce((t, e) => t - Number(e.dados.despesas), 0);
      const esc = c.liga.includes("Primeira") ? "PL" : c.liga.includes("Segunda") ? "SL" : c.liga.includes("Terceira") ? "TL" : c.liga.startsWith("CP") ? "CP" : "D";
      const x = por.get(esc) ?? { liq: [], pct: [], neg: 0 };
      x.liq.push(liq); x.pct.push(liq / custos);
      if (Number(repo.meta(`saldo.${c.id}`)) < 0) x.neg++;
      por.set(esc, x);
    }
    // a ficha do clube: palavra para todos; o clube do gamer vê o saldo exato e o último fecho
    await tratar({ id: 4, tipo: "escolherClube", entrada: { id: clubes[50]!.id, forcar: true } }, s);
    const meu = await tratar({ id: 5, tipo: "fichaClube", entrada: { id: clubes[50]!.id } }, s);
    const outro = await tratar({ id: 6, tipo: "fichaClube", entrada: { id: clubes[51]!.id } }, s);
    expect(meu!.financas.exato).toBe(true);
    expect(meu!.financas.saldo).toBe(Number(repo.meta(`saldo.${clubes[50]!.id}`)));
    expect(meu!.financas.ultimoFecho).toBeDefined();
    expect(outro!.financas.exato).toBe(false);
    expect(outro!.financas.saldo).toBeUndefined();
    // calibração: o clube mediano de cada escalão fica perto do equilíbrio e ninguém (ou quase) acaba o ano em negativo
    for (const [e, x] of por) {
      expect(mediana(x.pct), e).toBeGreaterThan(-0.2);
      expect(mediana(x.pct), e).toBeLessThan(0.35);
      expect(x.neg / x.liq.length, e).toBeLessThan(0.05);
    }
  }, 300000);
});
