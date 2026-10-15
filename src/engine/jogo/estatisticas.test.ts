import { describe, expect, it } from "vitest";
import { PARAMETROS_PADRAO as P } from "../config/parametros";
import { relatorioDoJogo } from "./estatisticas";
import { registoDoJogo } from "./registo";
import { simularJogo } from "./simulador";
import { equipaSintetica } from "./teste-util";
import type { EntradaJogo, EventoJogo } from "./tipos";

const entrada = (id: string, a = 10, b = 10): EntradaJogo => ({ seed: "s", id, casa: equipaSintetica("A", a), fora: equipaSintetica("B", b) });
function relatorio(e: EntradaJogo) {
  const { eventos, resumo } = simularJogo(e, P);
  return { eventos, resumo, r: relatorioDoJogo(e, { casa: e.casa, fora: e.fora }, eventos, resumo, P) };
}

describe("estatísticas pós-jogo", () => {
  it("é consistente com o resumo e com os eventos", () => {
    for (let i = 0; i < 80; i++) {
      const { eventos, resumo, r } = relatorio(entrada(`e${i}`));
      expect(r.golosCasa).toBe(resumo.casa.golos);
      expect(r.golosFora).toBe(resumo.fora.golos);
      expect(r.golos).toHaveLength(r.golosCasa + r.golosFora);
      const soma = (campo: "golos" | "remates" | "aBaliza" | "faltas", lado: "casa" | "fora") => r.jogadores.filter((j) => j.lado === lado).reduce((s, j) => s + j[campo], 0);
      for (const lado of ["casa", "fora"] as const) {
        expect(soma("golos", lado)).toBe(resumo[lado].golos);
        expect(soma("remates", lado)).toBe(resumo[lado].remates);
        expect(soma("aBaliza", lado)).toBe(resumo[lado].aBaliza);
        expect(soma("faltas", lado)).toBe(resumo[lado].faltas);
      }
      const assist = eventos.filter((e): e is Extract<EventoJogo, { tipo: "remate" }> => e.tipo === "remate" && e.resultado === "golo" && !!e.assistente).length;
      expect(r.jogadores.reduce((s, j) => s + j.assistencias, 0)).toBe(assist);
      // marcador corrente, ordem e intervalo
      let ultimo = 0;
      for (const g of r.golos) {
        expect(g.minuto).toBeGreaterThanOrEqual(ultimo);
        ultimo = g.minuto;
      }
      expect(r.golos.at(-1) ? [r.golos.at(-1)?.golosCasa, r.golos.at(-1)?.golosFora] : [0, 0]).toEqual([r.golosCasa, r.golosFora]);
      expect(r.intervalo.casa).toBeLessThanOrEqual(r.golosCasa);
      expect(r.intervalo.fora).toBeLessThanOrEqual(r.golosFora);
      expect(r.momentos.filter((m) => m.tipo === "golo")).toHaveLength(r.golos.length);
    }
  });

  it("é determinístico", () => {
    expect(relatorio(entrada("d1")).r).toEqual(relatorio(entrada("d1")).r);
  });

  it("as notas ficam entre os limites e o homem do jogo tem a melhor", () => {
    for (let i = 0; i < 60; i++) {
      const { r } = relatorio(entrada(`n${i}`));
      for (const j of r.jogadores) {
        expect(j.nota).toBeGreaterThanOrEqual(P.jogo.notas.min);
        expect(j.nota).toBeLessThanOrEqual(P.jogo.notas.max);
      }
      const melhor = Math.max(...r.jogadores.map((j) => j.nota));
      expect(r.jogadores.find((j) => j.id === r.homemDoJogo)?.nota).toBe(melhor);
    }
  });

  it("quem marca e a baliza a zero sobem a nota; sofrer golos desce-a", () => {
    let marcadores = 0, naoMarcadores = 0, nMarc = 0, nNao = 0, grZero = 0, nZero = 0, grSofre = 0, nSofre = 0, vencedores = 0, nV = 0, vencidos = 0, nVenc = 0;
    for (let i = 0; i < 400; i++) {
      const { r } = relatorio(entrada(`m${i}`));
      for (const j of r.jogadores) {
        if (j.posicao !== "GR" && j.posicao !== "DC") {
          if (j.golos > 0) { marcadores += j.nota; nMarc++; } else { naoMarcadores += j.nota; nNao++; }
        }
        if (j.posicao === "GR") {
          if (j.golosSofridos === 0) { grZero += j.nota; nZero++; } else { grSofre += j.nota; nSofre++; }
        }
        const meu = j.lado === "casa" ? r.golosCasa : r.golosFora;
        const dele = j.lado === "casa" ? r.golosFora : r.golosCasa;
        if (meu > dele) { vencedores += j.nota; nV++; } else if (meu < dele) { vencidos += j.nota; nVenc++; }
      }
    }
    expect(marcadores / nMarc).toBeGreaterThan(naoMarcadores / nNao + 0.7);
    expect(grZero / nZero).toBeGreaterThan(grSofre / nSofre + 0.5);
    expect(vencedores / nV).toBeGreaterThan(vencidos / nVenc + 0.4);
  });

  it("a nota média de um jogador anda perto do 6", () => {
    let soma = 0, n = 0;
    for (let i = 0; i < 200; i++) for (const j of relatorio(entrada(`b${i}`)).r.jogadores) { soma += j.nota; n++; }
    expect(soma / n).toBeGreaterThan(5.8);
    expect(soma / n).toBeLessThan(6.5);
  });

  it("os momentos-chave descrevem o que o marcador fez", () => {
    const contextos = new Set<string>();
    let penaltisFalhados = 0, defesas = 0, ocasioes = 0;
    for (let i = 0; i < 300; i++) {
      const { r } = relatorio(entrada(`k${i}`));
      const minutos = r.momentos.map((m) => m.minuto);
      expect([...minutos].sort((a, b) => a - b)).toEqual(minutos);
      for (const m of r.momentos) {
        if (m.tipo === "golo") contextos.add(m.contexto);
        else if (m.tipo === "penalti-falhado") penaltisFalhados++;
        else if (m.tipo === "grande-defesa") { defesas++; expect(m.xg).toBeGreaterThanOrEqual(P.jogo.momentos.xgGrande); }
        else { ocasioes++; expect(m.xg).toBeGreaterThanOrEqual(P.jogo.momentos.xgGrande); }
      }
      // o primeiro golo do jogo é sempre abertura
      const primeiro = r.momentos.find((m) => m.tipo === "golo");
      if (primeiro?.tipo === "golo") expect(primeiro.contexto).toBe("abertura");
    }
    for (const c of ["abertura", "empate", "vantagem", "reviravolta", "alargou"]) expect(contextos.has(c), c).toBe(true);
    expect(penaltisFalhados).toBeGreaterThan(0);
    expect(defesas).toBeGreaterThan(0);
    expect(ocasioes).toBeGreaterThan(0);
  });

  it("os momentos coincidem com um jogo escrito à mão: 0-0, 1-0, 1-1, 2-1", () => {
    const e = entrada("mao");
    const [a0, a1] = [e.casa.onze[10]!.id, e.casa.onze[9]!.id];
    const b0 = e.fora.onze[10]!.id;
    const eventos: EventoJogo[] = [
      { tipo: "remate", minuto: 10, lado: "casa", jogador: a0, assistente: a1, xg: 0.2, resultado: "golo", origem: "jogada" },
      { tipo: "remate", minuto: 30, lado: "fora", jogador: b0, xg: 0.1, resultado: "golo", origem: "jogada" },
      { tipo: "remate", minuto: 60, lado: "casa", jogador: a0, xg: 0.76, resultado: "golo", origem: "penalti" },
      { tipo: "remate", minuto: 70, lado: "fora", jogador: b0, xg: 0.76, resultado: "defendido", origem: "penalti", guardaRedes: e.casa.onze[0]!.id },
    ];
    const resumo = { ...simularJogo(e, P).resumo };
    const r = relatorioDoJogo(e, { casa: e.casa, fora: e.fora }, eventos, resumo, P);
    expect(r.golos.map((g) => [g.golosCasa, g.golosFora])).toEqual([[1, 0], [1, 1], [2, 1]]);
    expect(r.momentos.map((m) => (m.tipo === "golo" ? m.contexto : m.tipo))).toEqual(["abertura", "empate", "vantagem", "penalti-falhado"]);
    expect(r.intervalo).toEqual({ casa: 1, fora: 1 });
    expect(r.jogadores.find((j) => j.id === a0)).toMatchObject({ golos: 2, remates: 2, aBaliza: 2 });
    expect(r.jogadores.find((j) => j.id === a1)?.assistencias).toBe(1);
    expect(r.jogadores.find((j) => j.id === b0)).toMatchObject({ penaltisFalhados: 1 });
    expect(r.jogadores.find((j) => j.id === e.casa.onze[0]!.id)?.defesas).toBe(1);
    expect(r.homemDoJogo).toBe(a0);
  });

  it("um jogador desconhecido é um erro", () => {
    const e = entrada("x");
    const resumo = simularJogo(e, P).resumo;
    const ev: EventoJogo[] = [{ tipo: "falta", minuto: 5, lado: "casa", jogador: "ninguem", penalti: false }];
    expect(() => relatorioDoJogo(e, { casa: e.casa, fora: e.fora }, ev, resumo, P)).toThrow(/ninguem/);
  });

  it("as notas vão para as participações", () => {
    const e = entrada("p1");
    const { eventos, resumo, r } = relatorio(e);
    const { participacoes } = registoDoJogo({ id: "p1", competicao: "x", epoca: 2026, jornada: 1, data: "2026-09-01" as never }, e.casa, e.fora, eventos, resumo, r);
    expect(participacoes).toHaveLength(22);
    for (const p of participacoes) expect(p.nota).toBe(r.jogadores.find((j) => j.id === p.jogador)?.nota);
  });
});
