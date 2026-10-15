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
    carregarDados: async () => ({ clubes: ler("clubes"), cidades: ler("cidades"), rivalidades: ler("rivalidades"), distritos: ler("distritos"), paises: ler("paises") }),
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
});
