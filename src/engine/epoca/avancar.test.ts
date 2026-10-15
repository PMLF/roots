import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { tratar, type Servicos } from "../api/handler";
import { RepositorioMemoria } from "../persistencia/repositorioMemoria";

const ler = (f: string) => readFileSync(`data/${f}.csv`, "utf8");
const servicos = (agora = new Date(2026, 9, 15)): Servicos => {
  const repositorio = new RepositorioMemoria();
  return {
    agora: () => agora,
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

describe("demissão e ofertas", () => {
  it("o gamer demite-se, recebe ofertas semanais e só volta a jogar aceitando uma", async () => {
    const s = servicos();
    await tratar({ id: 1, tipo: "criarMundo", entrada: { seed: "demissao" } }, s);
    const clubes = await tratar({ id: 2, tipo: "clubes", entrada: null }, s);
    const meu = clubes[40]!;
    await tratar({ id: 3, tipo: "escolherClube", entrada: { id: meu.id } }, s);
    expect((await tratar({ id: 4, tipo: "ofertas", entrada: null }, s)).desempregado).toBe(false);
    await tratar({ id: 5, tipo: "demitir", entrada: null }, s);
    expect(await tratar({ id: 6, tipo: "clubeDoGamer", entrada: null }, s)).toBeNull();
    await expect(tratar({ id: 7, tipo: "demitir", entrada: null }, s)).rejects.toThrow();
    const o1 = await tratar({ id: 8, tipo: "ofertas", entrada: null }, s);
    expect(o1.desempregado).toBe(true);
    expect(o1.ofertas.length).toBeGreaterThanOrEqual(3);
    expect(o1.ofertas.every((o) => o.id !== meu.id)).toBe(true);
    // não se escolhe um clube à vontade: só uma oferta
    await expect(tratar({ id: 9, tipo: "escolherClube", entrada: { id: clubes[0]!.id } }, s)).rejects.toThrow();
    await expect(tratar({ id: 10, tipo: "aceitarOferta", entrada: { id: "nao-existe" } }, s)).rejects.toThrow();
    // o tempo avança sem pausa e as ofertas renovam-se à segunda-feira
    const r = await tratar({ id: 11, tipo: "avancar", entrada: { modo: "semana" } }, s);
    expect(r.pausa).toBeUndefined();
    const o2 = await tratar({ id: 12, tipo: "ofertas", entrada: null }, s);
    expect(o2.ofertas[0]!.desde > o1.ofertas[0]!.desde).toBe(true);
    await tratar({ id: 13, tipo: "aceitarOferta", entrada: { id: o2.ofertas[0]!.id } }, s);
    expect(await tratar({ id: 14, tipo: "clubeDoGamer", entrada: null }, s)).toEqual({ id: o2.ofertas[0]!.id });
    expect((await tratar({ id: 15, tipo: "ofertas", entrada: null }, s)).desempregado).toBe(false);
  }, 120000);
});

describe("época inicial", () => {
  it("vem da data real de criação do save: a 1 de julho muda a época", async () => {
    for (const [data, ano] of [[new Date(2026, 5, 30), 2025], [new Date(2026, 6, 1), 2026], [new Date(2027, 9, 14), 2027]] as const) {
      const s = servicos(data);
      await tratar({ id: 1, tipo: "criarMundo", entrada: { seed: "ano" } }, s);
      const t = await tratar({ id: 2, tipo: "estadoTempo", entrada: null }, s);
      expect(t.hoje).toBe(`${ano}-07-01`);
      expect(t.proximoDiaDeJogos! >= `${ano}-08-15`).toBe(true);
      const pagina = await tratar({ id: 3, tipo: "competitionPage", entrada: { league: "Primeira Liga" } }, s);
      expect(pagina!.seasonLabel).toBe(`${ano}/${String((ano + 1) % 100).padStart(2, "0")}`);
    }
  }, 120000);
});

describe("avançar no tempo", () => {
  it("joga os jogos de cada dia, grava-os e passa à frente", async () => {
    const s = servicos();
    await tratar({ id: 1, tipo: "criarMundo", entrada: { seed: "avancar" } }, s);
    const { repositorio: repo } = await s.abrirRepositorio();
    const antes = await tratar({ id: 2, tipo: "estadoTempo", entrada: null }, s);
    expect(antes.epoca).toBe(1);
    expect(antes.hoje).toBe("2026-07-01");
    expect(antes.porJogar).toBeGreaterThan(3000);
    expect(antes.proximoDiaDeJogos! >= "2026-08-15").toBe(true);

    const clube = (await tratar({ id: 3, tipo: "clubes", entrada: null }, s))[0]!;
    await tratar({ id: 31, tipo: "escolherClube", entrada: { id: clube.id } }, s);
    // pára antes do jogo do clube, sem o jogar
    const r = await tratar({ id: 4, tipo: "avancar", entrada: { modo: "proximoJogo" } }, s);
    expect(r.pausa).toBeDefined();
    expect(r.pausa!.casa === clube.id || r.pausa!.fora === clube.id).toBe(true);
    expect(r.estado.hoje).toBe(r.pausa!.data);
    expect(repo.jogo(r.pausa!.jogo)).toBeUndefined();
    expect(r.dias.length).toBeGreaterThan(10); // de 1 de agosto até à véspera
    // outra tentativa sem confirmar continua parada
    const outra = await tratar({ id: 41, tipo: "avancar", entrada: { modo: "dia" } }, s);
    expect(outra.dias).toHaveLength(0);
    expect(outra.pausa!.jogo).toBe(r.pausa!.jogo);
    // confirmado, joga o dia com o jogo do clube em detalhe
    await tratar({ id: 42, tipo: "confirmarJogo", entrada: { jogo: r.pausa!.jogo } }, s);
    const jogo = await tratar({ id: 43, tipo: "avancar", entrada: { modo: "dia" } }, s);
    expect(jogo.pausa).toBeUndefined();
    const doClube = jogo.dias[0]!.jogos.find((j) => j.casa === clube.id || j.fora === clube.id)!;
    expect(doClube.nivel).toBe(0);
    expect(repo.jogo(doClube.id)).toBeDefined();
    // jogo ao vivo: a linha do tempo do jogo do clube bate certo com o resultado
    const vivo = (await tratar({ id: 44, tipo: "jogoAoVivo", entrada: {} }, s))!;
    expect(vivo.id).toBe(doClube.id);
    expect(vivo.linhas.at(-1)!.tipo).toBe("fim");
    expect([vivo.linhas.at(-1)!.golosCasa, vivo.linhas.at(-1)!.golosFora]).toEqual([doClube.golosCasa, doClube.golosFora]);
    expect(vivo.linhas.filter((l) => l.tipo === "golo").length).toBe(doClube.golosCasa + doClube.golosFora);
    expect(vivo.linhas.every((l, i, a) => i === 0 || a[i - 1]!.minuto <= l.minuto)).toBe(true);
    expect(vivo.linhas.some((l) => l.tipo === "remate" || l.tipo === "canto")).toBe(true);
    const todos = [...r.dias, ...jogo.dias].flatMap((d) => d.jogos);
    expect(todos.length).toBeGreaterThan(10);
    expect(todos.filter((j) => j.nivel === 1).length).toBe(todos.length - todos.filter((j) => j.nivel === 0).length);
    expect(jogo.estado.porJogar).toBe(antes.porJogar - todos.length);

    // um dia a seguir não repete jogos
    const r2 = await tratar({ id: 5, tipo: "avancar", entrada: { modo: "dia" } }, s);
    for (const j of r2.dias.flatMap((d) => d.jogos)) expect(todos.map((x) => x.id)).not.toContain(j.id);
  }, 120000);

  it("uma época inteira: lesões e suspensões acontecem e todos os jogos são jogados", async () => {
    const s = servicos();
    await tratar({ id: 1, tipo: "criarMundo", entrada: { seed: "epoca" } }, s);
    const { repositorio: repo } = await s.abrirRepositorio();
    const inicio = await tratar({ id: 2, tipo: "estadoTempo", entrada: null }, s);
    let lesoes = 0, vermelhos = 0, jogos = 0, fim = false, guarda = 0, resumo: Awaited<ReturnType<typeof tratar<"avancar">>>["resumoEpoca"];
    while (!fim && guarda++ < 80) {
      const r = await tratar({ id: 3, tipo: "avancar", entrada: { modo: "semana" } }, s);
      for (const d of r.dias) for (const j of d.jogos) { jogos++; lesoes += j.lesoes.length; vermelhos += j.cartoes.filter((c) => c.cor === "vermelho").length; }
      fim = r.fimDeEpoca;
      resumo = r.resumoEpoca;
    }
    expect(fim).toBe(true);
    expect(jogos).toBeGreaterThan(inicio.porJogar); // ligas + Fase de Promoção
    expect(lesoes).toBeGreaterThan(100);
    expect(vermelhos).toBeGreaterThan(50);
    // as distritais acabam cedo e a Fase de Promoção joga-se até maio
    const ultima = (c: string) => repo.jogosDaCompeticao(c, 1).map((j) => j.data).sort().pop()!;
    const distritais = (await tratar({ id: 9, tipo: "competicoes", entrada: null }, s)).filter((c) => c.escalao === "distrital");
    expect(distritais.length).toBe(20);
    for (const d of distritais) expect(ultima(d.liga) <= "2027-04-06").toBe(true);
    for (const g of ["A", "B", "C", "D"]) expect(repo.jogosDaCompeticao(`Fase de Promoção ${g}`, 1).length).toBe(10);
    for (const g of ["A", "B", "C", "D"]) expect(ultima(`Fase de Promoção ${g}`) <= "2027-05-31").toBe(true);
    expect(resumo!.campeoes.length).toBe(7);
    expect(resumo!.movimentos.length).toBeGreaterThan(20);
    expect(repo.meta("epoca")).toBe("2");
    expect(repo.meta("piramide.2")).toBeDefined();
    const nova = await tratar({ id: 4, tipo: "estadoTempo", entrada: null }, s);
    expect(nova.epoca).toBe(2);
    expect(nova.porJogar).toBeGreaterThan(3000);
    const antiga = await tratar({ id: 5, tipo: "competitionPage", entrada: { league: "Primeira Liga", season: 1 } }, s);
    expect(antiga!.gamesPlayed).toBe(380);
    expect(antiga!.table.every((l) => l.played === 38)).toBe(true);
    const atual = await tratar({ id: 6, tipo: "competitionPage", entrada: { league: "Primeira Liga" } }, s);
    expect(atual!.gamesPlayed).toBe(0);
    const subiu = resumo!.movimentos.find((m) => m.motivo !== "descida" && m.para === "primeira");
    if (subiu) expect(atual!.table.some((l) => l.club === subiu.clube)).toBe(true);
  }, 600000);
});

describe("plano de jogo", () => {
  it("guarda tática e onze, valida e usa-os no jogo do clube", async () => {
    const s = servicos();
    await tratar({ id: 1, tipo: "criarMundo", entrada: { seed: "plano" } }, s);
    const clube = (await tratar({ id: 2, tipo: "clubes", entrada: null }, s))[0]!;
    expect(await tratar({ id: 3, tipo: "plano", entrada: null }, s)).toBeNull();
    await tratar({ id: 4, tipo: "escolherClube", entrada: { id: clube.id } }, s);
    const p = (await tratar({ id: 5, tipo: "plano", entrada: null }, s))!;
    expect(p.automatico).toBe(true);
    expect(p.onze).toHaveLength(11);
    expect(p.plantel.length).toBeGreaterThan(18);
    expect(p.proximoJogo?.confirmado).toBe(false);

    // formação 4-4-2 com o onze proposto reorganizado: rejeita posições que não batem
    await expect(tratar({ id: 6, tipo: "guardarPlano", entrada: { tatica: { ...p.tatica, formacao: "4-4-2" }, onze: p.onze.map((o) => ({ jogador: o.jogador, posicao: o.posicao })) } }, s)).rejects.toThrow();
    await expect(tratar({ id: 7, tipo: "guardarPlano", entrada: { tatica: { ...p.tatica, intensidade: 9 as never }, onze: null } }, s)).rejects.toThrow();
    const novo = await tratar({ id: 8, tipo: "guardarPlano", entrada: { tatica: { ...p.tatica, estilo: "direto", ritmo: 5 }, onze: p.onze.map((o) => ({ jogador: o.jogador, posicao: o.posicao })) } }, s);
    expect(novo.automatico).toBe(false);
    expect(novo.tatica).toMatchObject({ estilo: "direto", ritmo: 5 });
    expect((await tratar({ id: 9, tipo: "plano", entrada: null }, s))!.onze.map((o) => o.jogador)).toEqual(p.onze.map((o) => o.jogador));
    const volta = await tratar({ id: 10, tipo: "guardarPlano", entrada: { tatica: novo.tatica, onze: null } }, s);
    expect(volta.automatico).toBe(true);
  }, 60000);
});
