import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { tratar, type Servicos } from "../api/handler";
import { RepositorioMemoria } from "../persistencia/repositorioMemoria";

const ler = (f: string) => readFileSync(`data/${f}.csv`, "utf8");
const servicos: Servicos = {
  abrirRepositorio: (() => { const repositorio = new RepositorioMemoria(); return async () => ({ repositorio, backend: "memoria" as const, versaoSqlite: "teste" }); })(),
  carregarDados: async () => ({ clubes: ler("clubes"), cidades: ler("cidades"), localidades: ler("localidades"), rivalidades: ler("rivalidades"), distritos: ler("distritos"), paises: ler("paises") }),
};

describe("laboratório", () => {
  it("lista as competições e simula um jogo e uma liga sem gravar nada", async () => {
    await tratar({ id: 1, tipo: "criarMundo", entrada: { seed: "lab" } }, servicos);
    const { repositorio } = await servicos.abrirRepositorio();
    const eventos = repositorio.totalEventos();

    const comps = await tratar({ id: 2, tipo: "competicoes", entrada: null }, servicos);
    expect(comps[0]).toMatchObject({ escalao: "primeiraLiga", clubes: 20 });
    expect(comps.length).toBeGreaterThan(10);

    const clubes = await tratar({ id: 3, tipo: "clubes", entrada: null }, servicos);
    const [a, b] = clubes.filter((c) => c.liga === comps[0]!.liga) as [(typeof clubes)[0], (typeof clubes)[0]];
    const j = await tratar({ id: 4, tipo: "laboratorioJogo", entrada: { casa: a.id, fora: b.id, seed: "s1", taticaCasa: { formacao: "4-4-2", estilo: "direto" } } }, servicos);
    expect(j.casa.tatica).toMatchObject({ formacao: "4-4-2", estilo: "direto" });
    expect(j.relatorio.golos).toHaveLength(j.relatorio.golosCasa + j.relatorio.golosFora);
    expect(j.onzes.casa).toHaveLength(11);
    for (const p of j.onzes.casa) expect(j.nomes[p.id]).toBeTruthy();
    for (const g of j.relatorio.golos) expect(j.nomes[g.jogador]).toBeTruthy();
    // mesma seed, mesmo jogo; seed diferente, jogo (quase de certeza) diferente
    expect((await tratar({ id: 5, tipo: "laboratorioJogo", entrada: { casa: a.id, fora: b.id, seed: "s1", taticaCasa: { formacao: "4-4-2", estilo: "direto" } } }, servicos)).relatorio).toEqual(j.relatorio);
    await expect(tratar({ id: 6, tipo: "laboratorioJogo", entrada: { casa: a.id, fora: a.id, seed: "x" } }, servicos)).rejects.toThrow();

    const l = await tratar({ id: 7, tipo: "laboratorioLiga", entrada: { liga: comps[0]!.liga, seed: "s1" } }, servicos);
    expect(l.tabela).toHaveLength(20);
    expect(l.jogos).toBe(20 * 19);
    expect(l.tabela.every((x) => x.jogos === 38)).toBe(true);
    expect(l.tabela.map((x) => x.posicao)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(l.totais.golosPorJogo).toBeGreaterThan(2);
    expect(l.totais.golosPorJogo).toBeLessThan(3.4);
    expect(l.artilheiros[0]!.golos).toBeGreaterThan(5);
    const distrital = comps.find((c) => c.escalao === "distrital")!;
    const d = await tratar({ id: 8, tipo: "laboratorioLiga", entrada: { liga: distrital.liga, seed: "s1" } }, servicos);
    expect(d.tabela).toHaveLength(distrital.clubes);

    expect(repositorio.totalEventos()).toBe(eventos); // nada foi gravado
  }, 60000);
});
