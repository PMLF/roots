import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { VERSAO_ESQUEMA, VERSAO_MOTOR, tratar, type Servicos } from "./handler";
import { PARAMETROS_PADRAO } from "../config/parametros";
import { RepositorioMemoria } from "../persistencia/repositorioMemoria";

function servicosDeTeste(): Servicos {
  const repositorio = new RepositorioMemoria();
  const ler = (f: string) => readFileSync(`data/${f}.csv`, "utf8");
  return {
    abrirRepositorio: async () => ({ repositorio, backend: "memoria", versaoSqlite: "teste" }),
    carregarDados: async () => ({ clubes: ler("clubes"), cidades: ler("cidades"), localidades: ler("localidades"), rivalidades: ler("rivalidades"), distritos: ler("distritos"), paises: ler("paises") }),
  };
}

describe("handler do motor", () => {
  const s = servicosDeTeste();
  it("responde ao ping com o mesmo eco", async () => {
    const r = await tratar({ id: 1, tipo: "ping", entrada: { eco: "olá" } }, s);
    expect(r.eco).toBe("olá");
    expect(r.relogioMs).toBeGreaterThan(0);
  });
  it("devolve versão e parâmetros", async () => {
    expect(await tratar({ id: 2, tipo: "versao", entrada: null }, s)).toEqual({ motor: VERSAO_MOTOR, esquema: VERSAO_ESQUEMA });
    expect(await tratar({ id: 3, tipo: "parametros", entrada: null }, s)).toEqual(PARAMETROS_PADRAO);
  });
  it("autodiagnóstico da base de dados: cada abertura acrescenta um evento", async () => {
    const a = await tratar({ id: 4, tipo: "bd", entrada: null }, s);
    const b = await tratar({ id: 5, tipo: "bd", entrada: null }, s);
    expect(a).toMatchObject({ backend: "memoria", persistente: false, esquema: VERSAO_ESQUEMA, aberturas: 1, eventos: 1 });
    expect(b).toMatchObject({ aberturas: 2, eventos: 2 });
  });

  it("cria o mundo com progresso, depois reabre sem gerar outra vez, e o plantel vem pela Vista", async () => {
    const s2 = servicosDeTeste();
    expect(await tratar({ id: 5, tipo: "estadoMundo", entrada: null }, s2)).toBeNull(); // ver o estado não gera nada
    const fases = new Set<string>();
    const r = await tratar({ id: 6, tipo: "criarMundo", entrada: { seed: "abc" } }, s2, (p) => fases.add(p.fase));
    expect(r).toMatchObject({ seed: "abc", clubes: 298, jaExistia: false });
    expect(r.pessoas).toBeGreaterThan(12000);
    expect([...fases]).toEqual(expect.arrayContaining(["clubes", "livres", "validar", "guardar"]));
    expect(await tratar({ id: 10, tipo: "estadoMundo", entrada: null }, s2)).toMatchObject({ seed: "abc", jaExistia: true, pessoas: r.pessoas });
    const outra = await tratar({ id: 7, tipo: "criarMundo", entrada: { seed: "outra" } }, s2);
    expect(outra).toMatchObject({ seed: "abc", jaExistia: true, pessoas: r.pessoas, jogadores: r.jogadores });
    const clubes = await tratar({ id: 8, tipo: "clubes", entrada: null }, s2);
    const plantel = await tratar({ id: 9, tipo: "plantel", entrada: { clube: clubes[0]!.id } }, s2);
    expect(plantel.length).toBeGreaterThanOrEqual(20);
    expect(JSON.stringify(plantel)).not.toMatch(/potencial|atributos|personalidade/);
  });

  it("pesquisa e fichas: clubes e cidades antes de haver mundo; pessoas depois", async () => {
    const s3 = servicosDeTeste();
    const antes = await tratar({ id: 11, tipo: "pesquisar", entrada: { q: "almada" } }, s3);
    expect(antes.map((r) => r.k)).toEqual(expect.arrayContaining(["clube", "cidade"]));
    expect(antes.every((r) => r.k !== "pessoa")).toBe(true);
    await tratar({ id: 12, tipo: "criarMundo", entrada: { seed: "pesq" } }, s3);
    const clubes = await tratar({ id: 13, tipo: "clubes", entrada: null }, s3);
    const fc = (await tratar({ id: 14, tipo: "fichaClube", entrada: { id: clubes[0]!.id } }, s3))!;
    expect(fc.plantel.length).toBeGreaterThanOrEqual(20);
    expect(fc.cargos.map((c) => c.funcao)).toContain("presidente");
    expect(fc.cidade.k).toBe("cidade");
    const jog = fc.plantel[0]!;
    const achados = await tratar({ id: 15, tipo: "pesquisar", entrada: { q: jog.nomeDesportivo } }, s3);
    expect(achados.some((r) => r.k === "pessoa" && r.id === jog.id)).toBe(true);
    const fp = (await tratar({ id: 16, tipo: "fichaPessoa", entrada: { id: jog.id } }, s3))!;
    expect(fp.clube?.id).toBe(clubes[0]!.id);
    expect(fp.ficha.atributos).toBeUndefined(); // ninguém o observou
    expect(JSON.stringify(fp)).not.toMatch(/"potencial"|"personalidade"/);
    expect(await tratar({ id: 17, tipo: "fichaPessoa", entrada: { id: "nao-existe" } }, s3)).toBeNull();
    expect(await tratar({ id: 18, tipo: "fichaClube", entrada: { id: "nao-existe" } }, s3)).toBeNull();
  });

  it("localidades: o Matelense é de Matela (aldeia de Vimioso), com ficha e pesquisa próprias", async () => {
    const sl = servicosDeTeste();
    const clube = (await tratar({ id: 20, tipo: "fichaClube", entrada: { id: "cd-matelense" } }, sl))!;
    expect(clube.localidade).toMatchObject({ k: "localidade", id: "matela@vimioso", nome: "Matela", estatuto: "aldeia" });
    expect(clube.cidade.nome).toBe("Vimioso");
    const f = (await tratar({ id: 21, tipo: "fichaLocalidade", entrada: { id: "matela@vimioso" } }, sl))!;
    expect(f).toMatchObject({ nome: "Matela", estatuto: "aldeia", populacao: 150, sede: false, distrito: "Bragança", historico: [] });
    expect(f.clubes.map((c) => c.nome)).toEqual(["CD Matelense"]);
    const moita = (await tratar({ id: 22, tipo: "fichaLocalidade", entrada: { id: "moita-dos-ferreiros@lourinha" } }, sl))!;
    expect(moita).toMatchObject({ estatuto: "aldeia", cidade: { nome: "Lourinhã" } });
    expect(await tratar({ id: 23, tipo: "fichaLocalidade", entrada: { id: "nada" } }, sl)).toBeNull();
    const r = await tratar({ id: 24, tipo: "pesquisar", entrada: { q: "matela" } }, sl);
    expect(r.find((x) => x.k === "localidade")).toMatchObject({ id: "matela@vimioso", titulo: "Matela" });
  });

  it("depois do mundo, o estatuto vem do save e as mudanças aparecem na história da localidade", async () => {
    const sl = servicosDeTeste();
    await tratar({ id: 30, tipo: "criarMundo", entrada: { seed: "loc" } }, sl);
    const { repositorio } = await sl.abrirRepositorio();
    expect(repositorio.localidades().length).toBe(297);
    repositorio.atualizarLocalidade("matela@vimioso", { populacao: 1700, estatuto: "vila", data: "2031-06-30", epoca: 5 });
    const f = (await tratar({ id: 31, tipo: "fichaLocalidade", entrada: { id: "matela@vimioso" } }, sl))!;
    expect(f).toMatchObject({ estatuto: "vila", populacao: 1700, desde: "2031-06-30", historico: [{ de: "aldeia", para: "vila", populacao: 1700 }] });
    const c = (await tratar({ id: 32, tipo: "fichaClube", entrada: { id: "cd-matelense" } }, sl))!;
    expect(c.localidade.estatuto).toBe("vila");
  });

  it("reiniciarMundo apaga o save e gera outro mundo, com seed nova e pesquisa atualizada", async () => {
    const sl = servicosDeTeste();
    const a = await tratar({ id: 40, tipo: "criarMundo", entrada: { seed: "primeira" } }, sl);
    const antes = await tratar({ id: 41, tipo: "pesquisar", entrada: { q: "silva", limite: 50 } }, sl);
    const b = await tratar({ id: 42, tipo: "reiniciarMundo", entrada: { seed: "segunda" } }, sl);
    expect(b).toMatchObject({ seed: "segunda", jaExistia: false });
    expect(await tratar({ id: 43, tipo: "estadoMundo", entrada: null }, sl)).toMatchObject({ seed: "segunda", jaExistia: true });
    const depois = await tratar({ id: 44, tipo: "pesquisar", entrada: { q: "silva", limite: 50 } }, sl);
    // mesmos clubes e mesma quantidade de pessoas, mas pessoas diferentes: o índice não ficou preso ao mundo antigo
    expect(b.pessoas).toBe(a.pessoas);
    expect(depois.filter((x) => x.k === "pessoa").map((x) => x.id)).not.toEqual(antes.filter((x) => x.k === "pessoa").map((x) => x.id));
    const { repositorio } = await sl.abrirRepositorio();
    expect(repositorio.localidades().length).toBe(297);
    expect(repositorio.meta("seed")).toBe("segunda");
  });

  it("um save de antes das localidades (migração 4) recebe-as ao ser aberto", async () => {
    const sl = servicosDeTeste();
    const { repositorio } = await sl.abrirRepositorio();
    // simula um save antigo: tem pessoas mas nenhuma localidade
    repositorio.guardarMundo({ pessoas: [{ id: "p1", nome: "A B", nomeDesportivo: "A B", nascimento: "2000-01-01", nacionalidade: "pt", papeis: ["jogador"], personalidade: {}, arquetipo: "comum", lod: 2 }], jogadores: [], contratos: [], cargos: [] });
    expect(repositorio.localidades()).toEqual([]);
    expect(await tratar({ id: 50, tipo: "estadoMundo", entrada: null }, sl)).toMatchObject({ jaExistia: true });
    expect(repositorio.localidades().length).toBe(297);
    expect(await tratar({ id: 51, tipo: "estadoMundo", entrada: null }, sl)).toMatchObject({ jaExistia: true }); // idempotente
    expect(repositorio.localidades().length).toBe(297);
  });
});

describe("fichas ricas e «ver tudo»", () => {
  it("o gamer vê estimativas ou nada; o developer vê a verdade; a reputação vem em palavra", async () => {
    const s = servicosDeTeste();
    await tratar({ id: 60, tipo: "criarMundo", entrada: { seed: "ricas" } }, s);
    const clube = (await tratar({ id: 61, tipo: "fichaClube", entrada: { id: "sc-cascais" } }, s))!;
    expect(clube.nivelReputacao).toBe("continental");
    expect(clube.escalao).toBe("primeiraLiga");
    expect(clube.historicoDivisoes).toEqual([{ epoca: 1, escalao: "primeiraLiga", liga: "Primeira Liga" }]);
    expect(clube.verdade).toBeUndefined();
    expect(clube.estadioDetalhe.transportes).toBeGreaterThanOrEqual(0);
    const jogador = clube.plantel[0]!;
    expect(clube.plantelExtra[jogador.id]?.contratoFim).toBeTruthy();
    expect(clube.plantelExtra[jogador.id]?.nivel).toBeUndefined(); // ninguém o observou

    const ficha = (await tratar({ id: 62, tipo: "fichaPessoa", entrada: { id: jogador.id } }, s))!;
    expect(ficha.nivel).toBeUndefined();
    expect(ficha.verdade).toBeUndefined();
    expect(ficha.stats).toEqual([]);
    expect(ficha.contrato?.fim).toBeTruthy();

    const dev = (await tratar({ id: 63, tipo: "fichaPessoa", entrada: { id: jogador.id, verTudo: true } }, s))!;
    expect(Object.keys(dev.verdade?.atributos ?? {}).length).toBeGreaterThan(30);
    expect(dev.verdade?.potencial).toBeGreaterThan(0);
    expect(dev.verdade?.salarioMensal).toBeGreaterThan(0);
    expect(dev.nivel).toMatchObject({ exato: true });
    expect(dev.nivel!.valor).toBeGreaterThan(1);
    expect(dev.nivel!.valor).toBeLessThanOrEqual(20);

    const clubeDev = (await tratar({ id: 64, tipo: "fichaClube", entrada: { id: "sc-cascais", verTudo: true } }, s))!;
    expect(clubeDev.verdade?.reputacao).toBe(8300);
    expect(clubeDev.verdade?.plantelNivel).toBeGreaterThan(5);
    expect(Object.keys(clubeDev.verdade?.qualidadeStaff ?? {}).length).toBeGreaterThan(0);
    expect(clubeDev.plantelExtra[jogador.id]?.nivel?.exato).toBe(true);

    const presidente = clube.cargos.find((c) => c.funcao === "presidente")!;
    const devPres = (await tratar({ id: 65, tipo: "fichaPessoa", entrada: { id: presidente.id, verTudo: true } }, s))!;
    expect(devPres.verdade?.atributos).toBeUndefined();
    expect(Object.keys(devPres.verdade?.personalidade ?? {}).length).toBeGreaterThan(3);
  });
});

describe("competition page (RZ-145)", () => {
  it("lists clubs, previews the calendar, zero table with zones; unknown league gives null", async () => {
    const s = servicosDeTeste();
    await tratar({ id: 70, tipo: "criarMundo", entrada: { seed: "liga" } }, s);
    const lista = await tratar({ id: 71, tipo: "competicoes", entrada: null }, s);
    expect(lista.find((c) => c.escalao === "distrital")?.distrito).toBeTruthy();
    const d = (await tratar({ id: 72, tipo: "competitionPage", entrada: { league: "Primeira Liga" } }, s))!;
    expect(d.preview).toBe(true);
    expect(d.clubs).toHaveLength(20);
    expect(d.rounds).toHaveLength(38);
    expect(d.gamesTotal).toBe(380);
    expect(d.currentRound).toBe(0);
    expect(d.table).toHaveLength(20);
    expect(d.table.every((l) => l.points === 0 && l.played === 0)).toBe(true);
    expect(d.table.map((l) => l.zone)).toEqual(["champion", ...Array(16).fill(undefined), "relegation", "relegation", "relegation"]);
    expect(d.highlights.topScorers).toEqual([]);
    expect(d.highlights.bestAttack).toBeUndefined();
    const seg = (await tratar({ id: 74, tipo: "competitionPage", entrada: { league: "Segunda Liga" } }, s))!;
    expect(seg.table.map((l) => l.zone).filter(Boolean)).toEqual(["champion", "promotion", "promotion", "relegation", "relegation", "relegation"]);
    const dist = (await tratar({ id: 75, tipo: "competitionPage", entrada: { league: lista.find((c) => c.escalao === "distrital")!.liga } }, s))!;
    expect(dist.table.map((l) => l.zone).filter(Boolean)).toEqual(["champion"]);
    expect(await tratar({ id: 73, tipo: "competitionPage", entrada: { league: "Inexistente" } }, s)).toBeNull();
  });

  it("with matches played: table, current round and highlights", async () => {
    const s = servicosDeTeste();
    await tratar({ id: 80, tipo: "criarMundo", entrada: { seed: "liga2" } }, s);
    const { repositorio: r } = await s.abrirRepositorio();
    const pre = (await tratar({ id: 81, tipo: "competitionPage", entrada: { league: "Primeira Liga" } }, s))!;
    const [m1, m2] = [pre.rounds[0]!.matches[0]!, pre.rounds[1]!.matches[0]!];
    const jogo = (id: string, jornada: number, casa: string, fora: string, gc: number, gf: number) => {
      const pc = r.plantelPublico(casa).filter((p) => p.jogador?.posicao !== "GK").slice(0, 11);
      const pf = r.plantelPublico(fora).filter((p) => p.jogador?.posicao !== "GK").slice(0, 11);
      const factos = Array.from({ length: gc }, (_, i) => ({ minuto: 10 + i * 10, tipo: "G" as const, jogador: pc[0]!.id, clube: casa }))
        .concat(Array.from({ length: gf }, (_, i) => ({ minuto: 15 + i * 10, tipo: "G" as const, jogador: pf[0]!.id, clube: fora })));
      const cartoes = [{ minuto: 50, tipo: "CA" as const, jogador: pf[1]!.id, clube: fora }];
      const part = [...pc.map((p) => ({ jogador: p.id, clube: casa, titular: true, minutos: 90, nota: 7 })), ...pf.map((p) => ({ jogador: p.id, clube: fora, titular: true, minutos: 90, nota: 6 }))];
      r.registarJogo({ id, competicao: "Primeira Liga", epoca: 1, jornada, data: "2026-08-16", casa, fora, golosCasa: gc, golosFora: gf }, [...factos, ...cartoes], part);
    };
    jogo("t1", 1, m1.home, m1.away, 3, 0);
    jogo("t2", 2, m2.home, m2.away, 1, 1);
    const d = (await tratar({ id: 82, tipo: "competitionPage", entrada: { league: "Primeira Liga" } }, s))!;
    expect(d.gamesPlayed).toBe(2);
    expect(d.table[0]).toMatchObject({ points: 3, played: 1 });
    expect(d.highlights.topScorers[0]).toMatchObject({ value: 3 });
    expect(d.highlights.bestAttack).toMatchObject({ value: 3 });
    expect(d.highlights.mostYellow).toHaveLength(2);
    expect(d.highlights.bestRated).toEqual([]); // só 1 jogo com nota, mínimo é 3
  });
});
