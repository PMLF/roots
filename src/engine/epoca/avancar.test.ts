import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { tratar, type Servicos } from "../api/handler";
import { RepositorioMemoria } from "../persistencia/repositorioMemoria";

const ler = (f: string) => readFileSync(`data/${f}.csv`, "utf8");
const servicos = (): Servicos => {
  const repositorio = new RepositorioMemoria();
  return {
    abrirRepositorio: async () => ({ repositorio, backend: "memoria" as const, versaoSqlite: "teste" }),
    carregarDados: async () => ({ clubes: ler("clubes"), cidades: ler("cidades"), localidades: ler("localidades"), rivalidades: ler("rivalidades"), distritos: ler("distritos"), paises: ler("paises") }),
  };
};

describe("clube do save", () => {
  it("escolhe-se uma vez; só os developers (forcar) podem trocar", async () => {
    const s = servicos();
    await tratar({ id: 1, tipo: "criarMundo", entrada: { seed: "clube" } }, s);
    expect(await tratar({ id: 2, tipo: "clubeDoGamer", entrada: null }, s)).toBeNull();
    const [a, b] = await tratar({ id: 3, tipo: "clubes", entrada: null }, s);
    await tratar({ id: 4, tipo: "escolherClube", entrada: { id: a!.id } }, s);
    expect(await tratar({ id: 5, tipo: "clubeDoGamer", entrada: null }, s)).toEqual({ id: a!.id });
    await expect(tratar({ id: 6, tipo: "escolherClube", entrada: { id: b!.id } }, s)).rejects.toThrow();
    await tratar({ id: 7, tipo: "escolherClube", entrada: { id: b!.id, forcar: true } }, s);
    expect(await tratar({ id: 8, tipo: "clubeDoGamer", entrada: null }, s)).toEqual({ id: b!.id });
    await expect(tratar({ id: 9, tipo: "escolherClube", entrada: { id: "nao-existe", forcar: true } }, s)).rejects.toThrow();
  }, 60000);
});

describe("avançar no tempo", () => {
  it("joga os jogos de cada dia, grava-os e passa à frente", async () => {
    const s = servicos();
    await tratar({ id: 1, tipo: "criarMundo", entrada: { seed: "avancar" } }, s);
    const { repositorio: repo } = await s.abrirRepositorio();
    const antes = await tratar({ id: 2, tipo: "estadoTempo", entrada: null }, s);
    expect(antes.epoca).toBe(1);
    expect(antes.hoje).toBe("2026-08-01");
    expect(antes.porJogar).toBeGreaterThan(3000);
    expect(antes.proximoDiaDeJogos! >= "2026-08-15").toBe(true);

    const clube = (await tratar({ id: 3, tipo: "clubes", entrada: null }, s))[0]!;
    const r = await tratar({ id: 4, tipo: "avancar", entrada: { modo: "proximoJogo", clube: clube.id } }, s);
    expect(r.dias.length).toBeGreaterThan(10); // de 1 de agosto até ao primeiro jogo do clube
    const doClube = r.dias.at(-1)!.jogos.find((j) => j.casa === clube.id || j.fora === clube.id)!;
    expect(doClube.nivel).toBe(0);
    expect(repo.jogo(doClube.id)).toBeDefined();
    const todos = r.dias.flatMap((d) => d.jogos);
    expect(todos.length).toBeGreaterThan(10);
    expect(todos.filter((j) => j.nivel === 1).length).toBe(todos.length - todos.filter((j) => j.nivel === 0).length);
    expect(r.estado.hoje).toBe(r.dias.at(-1)!.data.replace(/\d\d$/, (d) => String(Number(d) + 1).padStart(2, "0")));
    expect(r.estado.porJogar).toBe(antes.porJogar - todos.length);

    // um dia a seguir não repete jogos
    const r2 = await tratar({ id: 5, tipo: "avancar", entrada: { modo: "dia" } }, s);
    expect(r2.dias).toHaveLength(1);
    for (const j of r2.dias[0]!.jogos) expect(todos.map((x) => x.id)).not.toContain(j.id);
  }, 120000);

  it("uma época inteira: lesões e suspensões acontecem e todos os jogos são jogados", async () => {
    const s = servicos();
    await tratar({ id: 1, tipo: "criarMundo", entrada: { seed: "epoca" } }, s);
    const { repositorio: repo } = await s.abrirRepositorio();
    const inicio = await tratar({ id: 2, tipo: "estadoTempo", entrada: null }, s);
    let lesoes = 0, vermelhos = 0, jogos = 0, fim = false, guarda = 0;
    while (!fim && guarda++ < 60) {
      const r = await tratar({ id: 3, tipo: "avancar", entrada: { modo: "semana" } }, s);
      for (const d of r.dias) for (const j of d.jogos) { jogos++; lesoes += j.lesoes.length; vermelhos += j.cartoes.filter((c) => c.cor === "vermelho").length; }
      fim = r.fimDeEpoca;
    }
    expect(fim).toBe(true);
    expect(jogos).toBe(inicio.porJogar);
    expect(lesoes).toBeGreaterThan(100);
    expect(vermelhos).toBeGreaterThan(50);
    expect(repo.eventosDe({ k: "competicao", id: "Primeira Liga" }).length).toBeGreaterThanOrEqual(0);
    const pagina = await tratar({ id: 4, tipo: "competitionPage", entrada: { league: "Primeira Liga" } }, s);
    expect(pagina!.gamesPlayed).toBe(380);
    expect(pagina!.table.every((l) => l.played === 38)).toBe(true);
  }, 600000);
});
