import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { tratar, type Servicos } from "../api/handler";
import { TATICA_PADRAO } from "../jogo/formacoes";
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

async function ateAoJogo(seed: string) {
  const s = servicos();
  await tratar({ id: 1, tipo: "criarMundo", entrada: { seed } }, s);
  const clube = (await tratar({ id: 2, tipo: "clubes", entrada: null }, s))[10]!;
  await tratar({ id: 3, tipo: "escolherClube", entrada: { id: clube.id } }, s);
  const r = await tratar({ id: 4, tipo: "avancar", entrada: { modo: "proximoJogo" } }, s);
  expect(r.pausa).toBeDefined();
  return { s, pausa: r.pausa! };
}

describe("jogo do gamer minuto a minuto (RZ-170)", () => {
  it("não deixa notícias nem mensagens até ao apito final; depois regista tudo e o avanço continua", async () => {
    const { s, pausa } = await ateAoJogo("sessao-1");
    const antes = await tratar({ id: 10, tipo: "caixa", entrada: {} }, s);
    const v0 = await tratar({ id: 11, tipo: "iniciarJogo", entrada: { jogo: pausa.jogo } }, s);
    expect(v0.emCurso).toBe(true);
    expect(v0.minuto).toBe(0);
    expect(v0.tabela.length).toBeGreaterThan(5);
    expect(Object.keys(v0.cores ?? {}).length).toBeGreaterThan(5);
    // a pausa continua, agora «em curso»
    const p2 = await tratar({ id: 12, tipo: "avancar", entrada: { modo: "dia" } }, s);
    expect(p2.pausa?.emCurso).toBe(true);
    const v45 = await tratar({ id: 13, tipo: "passoJogo", entrada: { minutos: 45 } }, s);
    expect(v45.minuto).toBe(45);
    expect(v45.linhas.every((l) => l.minuto <= 45)).toBe(true);
    expect(v45.linhas.some((l) => l.tipo === "fim")).toBe(false);
    expect(v45.resumo?.minuto).toBe(45);
    const meio = await tratar({ id: 14, tipo: "caixa", entrada: {} }, s);
    expect(meio.mensagens.length).toBe(antes.mensagens.length);
    // o ao-vivo continua a ser devolvido enquanto decorre
    expect((await tratar({ id: 15, tipo: "jogoAoVivo", entrada: {} }, s))?.emCurso).toBe(true);
    const fim = await tratar({ id: 16, tipo: "passoJogo", entrada: { minutos: 200 } }, s);
    expect(fim.emCurso).toBeFalsy();
    expect(fim.linhas.at(-1)?.tipo).toBe("fim");
    expect(fim.resumo?.terminado).toBe(true);
    const depois = await tratar({ id: 17, tipo: "caixa", entrada: {} }, s);
    expect(depois.mensagens.some((m) => m.tipo === "resultado")).toBe(true);
    expect((await tratar({ id: 18, tipo: "jogoAoVivo", entrada: { id: pausa.jogo } }, s))?.emCurso).toBeFalsy();
    // o jogo de hoje já foi jogado: deixa de ser «o próximo» e o avanço continua
    const plano = await tratar({ id: 20, tipo: "plano", entrada: null }, s);
    expect(plano?.proximoJogo?.id).not.toBe(pausa.jogo);
    const seg = await tratar({ id: 19, tipo: "avancar", entrada: { modo: "dia" } }, s);
    expect(seg.pausa).toBeUndefined();
  }, 120000);

  it("sem mudanças dá o mesmo jogo que a simulação de uma vez; mudar a tática só altera os minutos seguintes", async () => {
    const a = await ateAoJogo("sessao-2");
    await tratar({ id: 20, tipo: "iniciarJogo", entrada: { jogo: a.pausa.jogo } }, a.s);
    await tratar({ id: 21, tipo: "passoJogo", entrada: { minutos: 30 } }, a.s);
    const base30 = await tratar({ id: 22, tipo: "jogoAoVivo", entrada: {} }, a.s);
    const tat = { ...(base30!.tatica ?? TATICA_PADRAO), intensidade: 5 as const, linha: 5 as const, ritmo: 5 as const, estilo: "direto" as const };
    const mudada = await tratar({ id: 23, tipo: "taticaNoJogo", entrada: { tatica: tat } }, a.s);
    expect(mudada.tatica?.intensidade).toBe(5);
    expect(mudada.linhas.filter((l) => l.minuto <= 30)).toEqual(base30!.linhas);
    const fimA = await tratar({ id: 24, tipo: "passoJogo", entrada: { minutos: 200 } }, a.s);

    const b = await ateAoJogo("sessao-2");
    await tratar({ id: 30, tipo: "iniciarJogo", entrada: { jogo: b.pausa.jogo } }, b.s);
    const fimB = await tratar({ id: 31, tipo: "passoJogo", entrada: { minutos: 200 } }, b.s);
    // os primeiros 30 minutos são iguais com ou sem mudança
    expect(fimA.linhas.filter((l) => l.minuto <= 30)).toEqual(fimB.linhas.filter((l) => l.minuto <= 30));
    // depois dos 30 minutos o jogo é outro (tática ofensiva e intensa mexe nos remates)
    expect(fimA.resumo!.casa.remates + fimA.resumo!.fora.remates).not.toBe(fimB.resumo!.casa.remates + fimB.resumo!.fora.remates);
  }, 120000);

  it("rejeita mudar de formação a meio do jogo", async () => {
    const { s, pausa } = await ateAoJogo("sessao-3");
    const v = await tratar({ id: 40, tipo: "iniciarJogo", entrada: { jogo: pausa.jogo } }, s);
    const outra = v.tatica!.formacao === "4-4-2" ? "4-3-3" : "4-4-2";
    await expect(tratar({ id: 41, tipo: "taticaNoJogo", entrada: { tatica: { ...v.tatica!, formacao: outra } } }, s)).rejects.toThrow(/formação/i);
  }, 60000);
});
