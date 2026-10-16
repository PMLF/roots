import { describe, expect, it } from "vitest";
import { PARAMETROS_PADRAO } from "../config/parametros";
import { formaPorCarga } from "../epoca/formaFisica";
import { aptidaoNa, fatorAptidao, forcaEquipa, onzeAutomatico, type CandidatoOnze } from "./equipa";
import { simularJogo } from "./simulador";
import { equipaSintetica } from "./teste-util";
import type { EquipaJogo } from "./tipos";

const p = PARAMETROS_PADRAO;

describe("aptidão na posição (RZ-177)", () => {
  it("1 na posição natural, 0,82 numa secundária de 12, 0,62 sem registo; o guarda-redes fora do lugar é um desastre", () => {
    expect(fatorAptidao(20, "CB", p)).toBe(1);
    expect(fatorAptidao(undefined, "CB", p)).toBe(1);
    expect(fatorAptidao(12, "CB", p)).toBeCloseTo(0.82, 2);
    expect(fatorAptidao(aptidaoNa([], "CB", p), "CB", p)).toBeCloseTo(0.6175, 3);
    expect(fatorAptidao(aptidaoNa([], "GK", p), "GK", p)).toBeLessThan(0.25);
    expect(aptidaoNa([{ pos: "RB", aptidao: 14 }], "RB", p)).toBe(14);
  });
  it("a mesma equipa rende menos com jogadores fora de posição; sem parâmetros nada muda", () => {
    const base = equipaSintetica("A", 12);
    const fora: EquipaJogo = { ...base, onze: base.onze.map((j, i) => (i >= 1 && i <= 4 ? { ...j, aptidao: 3 } : { ...j, aptidao: 20 })) };
    const semParams = forcaEquipa(fora.onze);
    expect(semParams).toEqual(forcaEquipa(base.onze));
    const a = forcaEquipa(base.onze, undefined, p);
    const b = forcaEquipa(fora.onze, undefined, p);
    expect(b.defesa).toBeLessThan(a.defesa);
    expect(b.guardaRedes).toBe(a.guardaRedes);
  });
  it("o onze automático regista a aptidão de cada um na posição que ocupa", () => {
    const cand = (pessoa: string, pos: string, apt = 20): CandidatoOnze => ({ pessoa, posicoes: [{ pos, aptidao: apt }], atributos: Object.fromEntries(Object.keys(equipaSintetica("x", 10).onze[0]!.atributos).map((k) => [k, 10])), alturaCm: 180 });
    const plantel = [cand("gk", "GK"), ...["RB", "CB", "CB", "LB", "DM", "CM", "AM", "RW", "ST", "LW"].map((pos, i) => cand(`p${i}`, pos)), cand("extra", "CM", 20)];
    const onze = onzeAutomatico(plantel, undefined, p);
    expect(onze.every((j) => j.aptidao === 20)).toBe(true);
  });
  it("jogar com quatro jogadores sem registo da posição custa pontos a sério (≥ 0,2 pontos por jogo)", () => {
    const pontos = (casa: EquipaJogo, fora: EquipaJogo, n: number) => {
      let pts = 0;
      for (let i = 0; i < n; i++) {
        const { resumo } = simularJogo({ seed: `apt-${i}`, id: `j${i}`, casa, fora }, p);
        pts += resumo.casa.golos > resumo.fora.golos ? 3 : resumo.casa.golos === resumo.fora.golos ? 1 : 0;
      }
      return pts / n;
    };
    const b = equipaSintetica("B", 12);
    const natural = equipaSintetica("A", 12);
    const improvisada: EquipaJogo = { ...natural, onze: natural.onze.map((j, i) => (i === 0 || i >= 8 ? { ...j, aptidao: 20 } : i % 2 === 0 ? { ...j, aptidao: 3 } : { ...j, aptidao: 20 })) };
    const a = pontos({ ...natural, onze: natural.onze.map((j) => ({ ...j, aptidao: 20 })) }, b, 500);
    const c = pontos(improvisada, b, 500);
    expect(a - c).toBeGreaterThan(0.2);
  }, 120000);
});

describe("forma por cansaço (RZ-177)", () => {
  it("um jogo por semana é normal; dois e três na semana cansam; nunca passa de 1 nem desce do mínimo", () => {
    expect(formaPorCarga(0, p)).toBe(1);
    expect(formaPorCarga(90, p)).toBe(1);
    expect(formaPorCarga(180, p)).toBeCloseTo(0.97, 5);
    expect(formaPorCarga(270, p)).toBeCloseTo(0.94, 5);
    expect(formaPorCarga(5000, p)).toBe(p.jogo.forma.minimo);
  });
});
