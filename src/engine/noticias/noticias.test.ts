import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { tratar, type Servicos } from "../api/handler";
import { RepositorioMemoria } from "../persistencia/repositorioMemoria";
import { VARIANTES } from "./noticias";

const ler = (f: string) => readFileSync(`data/${f}.csv`, "utf8");
const servicos = (): Servicos => {
  const repositorio = new RepositorioMemoria();
  return {
    agora: () => new Date(2026, 9, 15),
    abrirRepositorio: async () => ({ repositorio, backend: "memoria" as const, versaoSqlite: "teste" }),
    carregarDados: async () => ({ clubes: ler("clubes"), cidades: ler("cidades"), localidades: ler("localidades"), rivalidades: ler("rivalidades"), distritos: ler("distritos"), paises: ler("paises") }),
  };
};

describe("notícias e caixa de entrada", () => {
  it("saem dos eventos: mundo ⊇ liga ⊇ clube; a caixa tem os resultados e sabe o que está por ler", async () => {
    const s = servicos();
    await tratar({ id: 1, tipo: "criarMundo", entrada: { seed: "noticias" } }, s);
    expect(await tratar({ id: 2, tipo: "caixa", entrada: {} }, s)).toEqual({ mensagens: [], naoLidas: 0 });
    const clube = (await tratar({ id: 3, tipo: "clubes", entrada: null }, s))[10]!;
    await tratar({ id: 4, tipo: "escolherClube", entrada: { id: clube.id } }, s);
    for (let i = 0; i < 8; i++) {
      const r = await tratar({ id: 10 + i, tipo: "avancar", entrada: { modo: "proximoJogo" } }, s);
      if (r.pausa) { await tratar({ id: 30, tipo: "confirmarJogo", entrada: { jogo: r.pausa.jogo } }, s); await tratar({ id: 31, tipo: "avancar", entrada: { modo: "dia" } }, s); }
    }
    const mundo = await tratar({ id: 40, tipo: "noticias", entrada: { escopo: "mundo", limite: 500 } }, s);
    const liga = await tratar({ id: 41, tipo: "noticias", entrada: { escopo: "liga", limite: 500 } }, s);
    const meu = await tratar({ id: 42, tipo: "noticias", entrada: { escopo: "clube", limite: 500 } }, s);
    expect(mundo.length).toBeGreaterThan(5);
    const ids = (l: typeof mundo) => new Set(l.map((n) => n.id));
    for (const n of liga) expect(ids(mundo).has(n.id)).toBe(true);
    for (const n of meu) expect(ids(liga).has(n.id)).toBe(true);
    expect(liga.length).toBeLessThanOrEqual(mundo.length);
    // ordem, variantes válidas e ligações com nome
    expect(mundo.every((n, i, a) => i === 0 || a[i - 1]!.id > n.id)).toBe(true);
    for (const n of mundo) {
      expect(n.variante).toBeGreaterThanOrEqual(1);
      expect(n.variante).toBeLessThanOrEqual(VARIANTES[n.tipo]);
      expect(n.ligacoes.length).toBeGreaterThan(0);
      expect(["resultado", "lesao", "demissao", "contratado"]).not.toContain(n.tipo);
    }
    // paginação
    const pagina = await tratar({ id: 43, tipo: "noticias", entrada: { escopo: "mundo", limite: 3 } }, s);
    const seguinte = await tratar({ id: 44, tipo: "noticias", entrada: { escopo: "mundo", limite: 3, antesDe: pagina.at(-1)!.id } }, s);
    expect(seguinte.every((n) => n.id < pagina.at(-1)!.id)).toBe(true);
    // caixa: 8 jogos dão vários resultados do teu clube
    const cx = await tratar({ id: 50, tipo: "caixa", entrada: {} }, s);
    expect(cx.mensagens.filter((m) => m.tipo === "resultado").length).toBeGreaterThanOrEqual(3);
    expect(cx.mensagens.every((m) => m.doTeuClube)).toBe(true);
    expect(cx.naoLidas).toBe(cx.mensagens.length);
    await tratar({ id: 51, tipo: "marcarCaixaLida", entrada: null }, s);
    const lida = await tratar({ id: 52, tipo: "caixa", entrada: {} }, s);
    expect(lida.naoLidas).toBe(0);
    expect(lida.mensagens.every((m) => m.lida)).toBe(true);
    // novos jogos voltam a trazer mensagens por ler
    const r = await tratar({ id: 53, tipo: "avancar", entrada: { modo: "proximoJogo" } }, s);
    if (r.pausa) { await tratar({ id: 54, tipo: "confirmarJogo", entrada: { jogo: r.pausa.jogo } }, s); await tratar({ id: 55, tipo: "avancar", entrada: { modo: "dia" } }, s); }
    expect((await tratar({ id: 56, tipo: "caixa", entrada: {} }, s)).naoLidas).toBeGreaterThan(0);
  }, 180000);

  it("o gamer demitido continua a ver a sua carreira na caixa", async () => {
    const s = servicos();
    await tratar({ id: 1, tipo: "criarMundo", entrada: { seed: "demitido" } }, s);
    const clube = (await tratar({ id: 3, tipo: "clubes", entrada: null }, s))[5]!;
    await tratar({ id: 4, tipo: "escolherClube", entrada: { id: clube.id } }, s);
    await tratar({ id: 5, tipo: "demitir", entrada: null }, s);
    const cx = await tratar({ id: 6, tipo: "caixa", entrada: {} }, s);
    expect(cx.mensagens.map((m) => m.tipo)).toContain("demissao");
    expect(cx.naoLidas).toBe(1);
  }, 60000);
});
