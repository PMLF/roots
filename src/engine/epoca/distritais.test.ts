import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { tratar, type Servicos } from "../api/handler";
import { RepositorioMemoria } from "../persistencia/repositorioMemoria";
import type { Piramide } from "./movimentos";
import { guardarPiramide } from "./piramideEpoca";
import { PARAMETROS_PADRAO as P } from "../config/parametros";
import { ajustarDistritais, campeaoPodeSubir, estaNaBolsa, ligaDaBolsa } from "./distritais";

const ids = (p: string, n: number) => Array.from({ length: n }, (_, i) => `${p}${String(i + 1).padStart(2, "0")}`);
const nenhum = new Set<string>();

describe("distritais de tamanho variável (RZ-113)", () => {
  it("p=r ou p=r=0: nada muda", () => {
    const l = ids("a", 10);
    const r = ajustarDistritais({ Braga: l }, { finais: { Braga: l }, protegidos: nenhum, bolsa: {}, epoca: 1 }, P);
    expect(r.distritais.Braga).toEqual(l);
    expect(r.ajustes).toEqual([]);
    expect(r.avisos).toEqual([]);
  });

  it("r > p: a liga cresce até DIST_MAX; o excedente, os piores, vai para a Bolsa, e os recém-chegados ficam protegidos", () => {
    const antigos = ids("a", 10);
    const chegados = ["c1", "c2", "c3", "c4", "c5", "c6"]; // seis despromovidos do CP: 16 clubes
    const r = ajustarDistritais({ Faro: [...antigos, ...chegados] }, { finais: { Faro: antigos }, protegidos: new Set(chegados), bolsa: {}, epoca: 3 }, P);
    expect(r.distritais.Faro).toHaveLength(14);
    expect(chegados.every((c) => r.distritais.Faro!.includes(c))).toBe(true);
    // saem os dois piores da classificação (a09 e a10)
    expect(r.bolsa.Faro!.map((e) => e.clube).sort()).toEqual(["a09", "a10"]);
    expect(r.bolsa.Faro!.every((e) => e.desde === 3)).toBe(true);
    expect(r.ajustes.filter((a) => a.tipo === "bolsa")).toHaveLength(2);
  });

  it("abaixo de DIST_MIN: completa com a Bolsa, primeiro quem desceu há menos tempo", () => {
    const l = ids("a", 7);
    const bolsa = { Beja: [{ clube: "velho", desde: 1 }, { clube: "recente", desde: 5 }, { clube: "medio", desde: 3 }] };
    const r = ajustarDistritais({ Beja: l }, { finais: { Beja: l }, protegidos: nenhum, bolsa, epoca: 6 }, P);
    expect(r.distritais.Beja).toEqual([...l, "recente"]);
    expect(r.bolsa.Beja!.map((e) => e.clube).sort()).toEqual(["medio", "velho"]);
    expect(r.ajustes).toEqual([{ clube: "recente", distrito: "Beja", tipo: "regresso" }]);
    expect(r.avisos).toEqual([]);
  });

  it("completa até DIST_MIN e não mais, mesmo com a Bolsa cheia", () => {
    const l = ids("a", 6);
    const bolsa = { Beja: ids("b", 5).map((clube, i) => ({ clube, desde: i })) };
    const r = ajustarDistritais({ Beja: l }, { finais: { Beja: l }, protegidos: nenhum, bolsa, epoca: 9 }, P);
    expect(r.distritais.Beja).toHaveLength(P.distritais.min);
    expect(r.bolsa.Beja).toHaveLength(3);
  });

  it("Bolsa vazia: a liga joga com menos clubes e avisa; abaixo do mínimo duro, avisa também", () => {
    const r = ajustarDistritais({ Corvo: ids("a", 7), Evora: ids("e", 5) }, { finais: {}, protegidos: nenhum, bolsa: {}, epoca: 2 }, P);
    expect(r.distritais.Corvo).toHaveLength(7);
    expect(r.avisos.some((a) => a.startsWith("Corvo") && /Bolsa está vazia/.test(a))).toBe(true);
    expect(r.avisos.some((a) => a.startsWith("Evora") && /mínimo duro/.test(a))).toBe(true);
  });

  it("quem desce à Bolsa e quem regressa na mesma passagem não se cruza, e o resultado é determinístico", () => {
    const entrada = { Braga: [...ids("a", 12), "c1", "c2", "c3"], Beja: ids("b", 6) };
    const ctx = { finais: { Braga: ids("a", 12) }, protegidos: new Set(["c1", "c2", "c3"]), bolsa: { Beja: [{ clube: "x", desde: 1 }, { clube: "y", desde: 2 }] }, epoca: 4 };
    const um = ajustarDistritais(entrada, ctx, P);
    expect(ajustarDistritais(entrada, ctx, P)).toEqual(um);
    expect(um.distritais.Braga).toHaveLength(14);
    expect(um.distritais.Beja).toEqual([...ids("b", 6), "y", "x"]);
  });

  it("o campeão só pode subir se a liga ficar com o mínimo duro", () => {
    expect(campeaoPodeSubir(7, P)).toBe(true);
    expect(campeaoPodeSubir(6, P)).toBe(false);
  });

  it("a liga da Bolsa reconhece-se pelo nome", () => {
    expect(estaNaBolsa(ligaDaBolsa("Braga"))).toBe(true);
    expect(estaNaBolsa("Distrital Braga")).toBe(false);
  });
});

describe("clubes na Bolsa nos dados da época", () => {
  it("quem não está na pirâmide fica com a liga «Bolsa …» e não aparece nas competições", async () => {
    const ler = (f: string) => readFileSync(`data/${f}.csv`, "utf8");
    const repositorio = new RepositorioMemoria();
    const s: Servicos = {
      agora: () => new Date(2026, 9, 15),
      abrirRepositorio: async () => ({ repositorio, backend: "memoria" as const, versaoSqlite: "teste" }),
      carregarDados: async () => ({ clubes: ler("clubes"), cidades: ler("cidades"), localidades: ler("localidades"), rivalidades: ler("rivalidades"), distritos: ler("distritos"), paises: ler("paises") }),
    };
    await tratar({ id: 1, tipo: "criarMundo", entrada: { seed: "bolsa" } }, s);
    await tratar({ id: 2, tipo: "estadoTempo", entrada: null }, s); // grava a pirâmide da época 1
    const pir = JSON.parse(repositorio.meta("piramide.1") as string) as Piramide;
    const [distrito, lista] = Object.entries(pir.distritais)[0]!;
    const fora = lista[lista.length - 1]!;
    guardarPiramide(repositorio, 1, { ...pir, distritais: { ...pir.distritais, [distrito]: lista.slice(0, -1) } });
    const ficha = await tratar({ id: 3, tipo: "fichaClube", entrada: { id: fora } }, s);
    expect(ficha?.liga).toBe(ligaDaBolsa(distrito));
    const comp = await tratar({ id: 4, tipo: "competicoes", entrada: null }, s);
    expect(comp.some((c) => estaNaBolsa(c.liga))).toBe(false);
    expect(comp.filter((c) => c.escalao === "distrital").every((c) => c.clubes >= 2)).toBe(true);
  }, 60000);
});
