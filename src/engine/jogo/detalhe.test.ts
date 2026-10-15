import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PARAMETROS_PADRAO as P } from "../config/parametros";
import { importarDados } from "../dados/importar";
import { gerarMundo } from "../mundo/gerarMundo";
import { importarPaises } from "../mundo/paises";
import { RepositorioMemoria } from "../persistencia/repositorioMemoria";
import { jogarJogo, nivelDoJogo, type JogoResolvido } from "./detalhe";
import { equipaDe, type CandidatoOnze } from "./equipa";
import { historiasDoJogo } from "./historias";
import { equipaSintetica } from "./teste-util";
import type { EntradaJogo, EquipaJogo, Lado } from "./tipos";

const meta = (id: string) => ({ id, competicao: "PL", epoca: 1, jornada: 1, data: "2026-09-05" });
const entrada = (id: string): EntradaJogo => ({ seed: "det", id, casa: equipaSintetica("A", 10), fora: equipaSintetica("B", 10) });

describe("nível de detalhe", () => {
  it("0 para os jogos do clube do gamer, 1 para os outros", () => {
    expect(nivelDoJogo("A", "B", "A")).toBe(0);
    expect(nivelDoJogo("A", "B", "B")).toBe(0);
    expect(nivelDoJogo("A", "B", "C")).toBe(1);
    expect(nivelDoJogo("A", "B")).toBe(1);
  });

  it("o mesmo jogo dá o mesmo resultado, golos e cartões nos dois níveis; só muda o que se guarda", () => {
    for (let i = 0; i < 60; i++) {
      const e = entrada(`n${i}`);
      const a = jogarJogo(e, 0, meta(e.id), P) as Extract<JogoResolvido, { nivel: 0 }>;
      const b = jogarJogo(e, 1, meta(e.id), P) as Extract<JogoResolvido, { nivel: 1 }>;
      expect(b.resumo).toEqual(a.resumo);
      expect(b.registo.jogo).toEqual(a.registo.jogo);
      expect(b.registo.factos).toEqual(a.registo.factos);
      expect(b.registo.lesoes).toEqual(a.registo.lesoes);
      expect(b.historias).toEqual(a.historias);
      expect(b.relatorio.golos).toEqual(a.relatorio.golos);
      expect(b.relatorio.cartoes).toEqual(a.relatorio.cartoes);
      expect(b.relatorio.lesoes).toEqual(a.relatorio.lesoes);
      expect(b.relatorio.homemDoJogo.id).toBe(a.relatorio.homemDoJogo);
      expect(a.eventos.length).toBeGreaterThan(0);
      expect("eventos" in b).toBe(false);
      expect("jogadores" in b.relatorio).toBe(false);
      // notas: todas no nível 0, só a do homem do jogo no nível 1
      expect(a.registo.participacoes.every((p) => p.nota !== undefined)).toBe(true);
      const comNota = b.registo.participacoes.filter((p) => p.nota !== undefined);
      expect(comNota.map((p) => p.jogador)).toEqual([b.relatorio.homemDoJogo.id]);
      expect(comNota[0]?.nota).toBe(b.relatorio.homemDoJogo.nota);
      // o nível 1 só tem momentos públicos
      expect(b.relatorio.momentos.every((m) => ["golo", "expulsao", "lesao"].includes(m.tipo))).toBe(true);
      // sobrevivem as mesmas participações (minutos incluídos)
      expect(b.registo.participacoes.map((p) => [p.jogador, p.minutos, p.titular])).toEqual(a.registo.participacoes.map((p) => [p.jogador, p.minutos, p.titular]));
    }
  });
});

describe("histórias do jogo", () => {
  const golo = (minuto: number, lado: Lado, golosCasa: number, golosFora: number, jogador = lado === "casa" ? "c1" : "f1") => ({ minuto, lado, jogador, origem: "jogada" as const, golosCasa, golosFora });
  const hist = (golos: ReturnType<typeof golo>[], cartoes: { minuto: number; lado: Lado; jogador: string; cor: "amarelo" | "vermelho"; segundoAmarelo?: true }[] = []) => {
    const ult = golos.at(-1);
    return historiasDoJogo(meta("j"), { casa: "A", fora: "B" }, { duracao: 94, golosCasa: ult?.golosCasa ?? 0, golosFora: ult?.golosFora ?? 0, golos, cartoes }, P);
  };
  const tipos = (e: ReturnType<typeof hist>) => e.map((x) => x.tipo);

  it("um 1-0 a meio do jogo não é notícia", () => {
    expect(hist([golo(30, "casa", 1, 0)])).toEqual([]);
    expect(hist([])).toEqual([]);
  });
  it("hat-trick", () => {
    const e = hist([golo(10, "casa", 1, 0, "x"), golo(40, "casa", 2, 0, "x"), golo(70, "casa", 3, 0, "x")]);
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ tipo: "HATTRICK", vis: "publico", dados: { golos: 3, minutos: [10, 40, 70] } });
    expect(e[0]?.entidades).toEqual([{ k: "pessoa", id: "x", papel: "marcador" }, { k: "clube", id: "A" }, { k: "jogo", id: "j" }]);
    expect(tipos(hist([golo(10, "casa", 1, 0, "x"), golo(40, "casa", 2, 0, "x")]))).toEqual([]);
  });
  it("goleada: 4 ou mais de diferença", () => {
    const g = [golo(5, "fora", 0, 1), golo(20, "fora", 0, 2), golo(50, "fora", 0, 3, "f2"), golo(60, "fora", 0, 4, "f3")];
    const e = hist(g);
    expect(tipos(e)).toEqual(["GOLEADA"]);
    expect(e[0]?.entidades.map((x) => `${x.papel}:${x.id}`).slice(0, 2)).toEqual(["vencedor:B", "vencido:A"]);
    expect(tipos(hist(g.slice(0, 3)))).toEqual([]);
  });
  it("reviravolta: o vencedor chegou a perder por dois", () => {
    const e = hist([golo(10, "fora", 0, 1), golo(20, "fora", 0, 2), golo(50, "casa", 1, 2), golo(60, "casa", 2, 2), golo(75, "casa", 3, 2, "herói")]);
    expect(tipos(e)).toEqual(["GOLO_NOTAVEL"]);
    expect(e[0]).toMatchObject({ dados: { motivo: "reviravolta", minuto: 75, golosCasa: 3, golosFora: 2 } });
    // perder por um e virar não chega
    expect(tipos(hist([golo(10, "fora", 0, 1), golo(50, "casa", 1, 1), golo(60, "casa", 2, 1)]))).toEqual([]);
  });
  it("golo nos descontos que decide ou salva o empate", () => {
    expect(hist([golo(30, "fora", 0, 1), golo(93, "casa", 1, 1)])[0]).toMatchObject({ tipo: "GOLO_NOTAVEL", dados: { motivo: "descontos" } });
    expect(hist([golo(92, "casa", 1, 0)])[0]).toMatchObject({ dados: { motivo: "descontos" } });
    // já estava decidido
    expect(hist([golo(10, "casa", 1, 0, "a"), golo(40, "casa", 2, 0, "b"), golo(93, "casa", 3, 0, "c")])).toEqual([]);
    // fora dos últimos minutos
    expect(hist([golo(85, "casa", 1, 0)])).toEqual([]);
  });
  it("vermelhos", () => {
    const e = hist([], [{ minuto: 20, lado: "fora", jogador: "p", cor: "amarelo" }, { minuto: 60, lado: "fora", jogador: "p", cor: "vermelho", segundoAmarelo: true }]);
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ tipo: "CARTAO_VERMELHO", dados: { minuto: 60, segundoAmarelo: true } });
  });
  it("com muitos jogos, as histórias aparecem em frequências razoáveis", () => {
    const N = 4000;
    const c: Record<string, number> = {};
    for (let i = 0; i < N; i++) for (const h of jogarJogo(entrada(`h${i}`), 1, meta(`h${i}`), P).historias) c[h.tipo] = (c[h.tipo] ?? 0) + 1;
    console.log("histórias por jogo", Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Math.round((v / N) * 1000) / 1000])));
    expect((c.HATTRICK ?? 0) / N).toBeGreaterThan(0.002);
    expect((c.HATTRICK ?? 0) / N).toBeLessThan(0.05);
    expect((c.GOLEADA ?? 0) / N).toBeGreaterThan(0.005);
    expect((c.GOLEADA ?? 0) / N).toBeLessThan(0.08);
    expect((c.CARTAO_VERMELHO ?? 0) / N).toBeGreaterThan(0.08);
    expect((c.GOLO_NOTAVEL ?? 0) / N).toBeGreaterThan(0.01);
    expect((c.GOLO_NOTAVEL ?? 0) / N).toBeLessThan(0.2);
  });
});

// ---------- com o mundo gerado

const ler = (f: string) => readFileSync(`data/${f}`, "utf8");

describe("época de jogos com o mundo gerado", () => {
  const d = importarDados({ clubes: ler("clubes.csv"), cidades: ler("cidades.csv"), localidades: ler("localidades.csv"), rivalidades: ler("rivalidades.csv"), distritos: ler("distritos.csv") });
  const pr = importarPaises(ler("paises.csv"));
  if (!d.ok || !pr.ok) throw new Error("dados inválidos");
  const lote = gerarMundo({ seed: "det-mundo", dados: d.dados, paises: pr.paises, params: P });
  const equipas = new Map<string, EquipaJogo>();
  const equipa = (clube: string): EquipaJogo => {
    let e = equipas.get(clube);
    if (!e) {
      const cs: CandidatoOnze[] = lote.jogadores.filter((j) => j.clube === clube && j.estado === "ativo").map((j) => ({ pessoa: j.pessoa, posicoes: j.posicoes, atributos: j.atributos, alturaCm: j.alturaCm }));
      e = equipaDe(clube, cs);
      equipas.set(clube, e);
    }
    return e;
  };

  it("simula milhares de jogos, o repositório aceita-os e o custo por jogo é baixo", () => {
    const clubes = d.dados.clubes.map((c) => c.id);
    const repo = new RepositorioMemoria();
    const N = 4500;
    const gamer = clubes[0] as string;
    let niv0 = 0;
    const t0 = performance.now();
    for (let i = 0; i < N; i++) {
      const casa = clubes[i % clubes.length] as string;
      const fora = clubes[(i * 7 + 1) % clubes.length] as string;
      if (casa === fora) continue;
      const nivel = nivelDoJogo(casa, fora, gamer);
      if (nivel === 0) niv0++;
      const id = `m${i}`;
      const r = jogarJogo({ seed: "det-mundo", id, casa: equipa(casa), fora: equipa(fora) }, nivel, { id, competicao: "X", epoca: 1, jornada: 1 + (i % 30), data: "2026-09-05" }, P);
      repo.registarJogo(r.registo.jogo, r.registo.factos, r.registo.participacoes);
      for (const ev of [...r.registo.lesoes, ...r.historias]) repo.acrescentarEvento(ev);
    }
    const ms = performance.now() - t0;
    console.log(`jogos: ${N}, nível 0: ${niv0}, ${(ms / N).toFixed(2)} ms/jogo, ${(ms / 1000).toFixed(1)} s no total (com o repositório em memória)`);
    expect(ms / N).toBeLessThan(15);
    expect(repo.contar("JOGO_JOGADO")).toBeGreaterThan(N - 20);
    expect(niv0).toBeGreaterThan(0);
  }, 120000);
});
