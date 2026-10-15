import { describe, expect, it } from "vitest";
import { PARAMETROS_PADRAO as P, validarParametros } from "../config/parametros";
import { ATRIBUTOS, POSICOES, type Atributos } from "../mundo/tipos";
import type { Personalidade } from "../personalidade/gerar";
import type { CandidatoOnze } from "./equipa";
import { FORMACAO_IDS, FORMACOES, TATICA_PADRAO, fadigaEm, linhasDaFormacao, modificadoresTatica, multiplicadorFaltas } from "./formacoes";
import { SimuladorJogo, simularJogo } from "./simulador";
import { escolherEquipa, perfilTreinador } from "./tatica";
import { equipaSintetica } from "./teste-util";
import type { EquipaJogo, Tatica } from "./tipos";

/** Equipa sintética com a formação e a tática dadas (todos os jogadores com o mesmo nível). */
function equipa(clube: string, nivel: number, t: Partial<Tatica> = {}): EquipaJogo {
  const base = equipaSintetica(clube, nivel);
  const tatica = { ...TATICA_PADRAO, ...t };
  return { clube, tatica, onze: FORMACOES[tatica.formacao].map((posicao, i) => ({ ...(base.onze[0] as EquipaJogo["onze"][0]), id: `${clube}-${i}`, posicao })) };
}

type Medida = { vit: number; emp: number; pontos: number; posse: number; faltas: number; oportunidades: number };
function medir(a: EquipaJogo, b: EquipaJogo, n: number, prefixo: string): Medida {
  const m: Medida = { vit: 0, emp: 0, pontos: 0, posse: 0, faltas: 0, oportunidades: 0 };
  for (let i = 0; i < n; i++) {
    const { resumo } = simularJogo({ seed: "tat", id: `${prefixo}${i}`, casa: a, fora: b }, P);
    if (resumo.casa.golos > resumo.fora.golos) { m.vit++; m.pontos += 3; } else if (resumo.casa.golos === resumo.fora.golos) { m.emp++; m.pontos += 1; }
    m.posse += resumo.posseCasa;
    m.faltas += resumo.casa.faltas;
    m.oportunidades += resumo.casa.oportunidades;
  }
  return { vit: m.vit / n, emp: m.emp / n, pontos: m.pontos / n, posse: m.posse / n, faltas: m.faltas / n, oportunidades: m.oportunidades / n };
}

describe("formações", () => {
  it("são 8, com onze jogadores, um guarda-redes e posições válidas", () => {
    expect(FORMACAO_IDS).toHaveLength(8);
    for (const f of FORMACAO_IDS) {
      const pos = FORMACOES[f];
      expect(pos, f).toHaveLength(11);
      expect(pos.filter((p) => p === "GK"), f).toHaveLength(1);
      for (const p of pos) expect(POSICOES).toContain(p);
      const n = f.split("-").map(Number).reduce((s, x) => s + x, 0);
      expect(n, f).toBe(10);
    }
  });

  it("cada formação tem um perfil próprio e o 4-3-3 é neutro", () => {
    const perfis = FORMACAO_IDS.map((f) => modificadoresTatica(FORMACOES[f], TATICA_PADRAO, P.tatica));
    expect(perfis[0]).toEqual({ ataque: 0, controlo: 0, defesa: 0 });
    for (let i = 0; i < perfis.length; i++)
      for (let j = i + 1; j < perfis.length; j++) {
        const a = perfis[i]!, b = perfis[j]!;
        expect(Math.abs(a.ataque - b.ataque) + Math.abs(a.controlo - b.controlo) + Math.abs(a.defesa - b.defesa), `${FORMACAO_IDS[i]} vs ${FORMACAO_IDS[j]}`).toBeGreaterThan(0.05);
      }
  });

  it("formações defensivas defendem mais e atacam menos; as ofensivas ao contrário", () => {
    const m = (f: keyof typeof FORMACOES) => modificadoresTatica(FORMACOES[f], { ...TATICA_PADRAO, formacao: f }, P.tatica);
    expect(m("5-3-2").defesa).toBeGreaterThan(m("4-3-3").defesa);
    expect(m("5-3-2").ataque).toBeLessThan(m("4-3-3").ataque);
    expect(m("4-4-2").ataque).toBeGreaterThan(m("4-3-3").ataque);
    expect(m("4-4-2").controlo).toBeLessThan(m("4-3-3").controlo);
    expect(m("4-2-3-1").defesa).toBeGreaterThan(m("4-3-3").defesa);
    // as linhas somam sempre 10 jogadores de campo
    for (const f of FORMACAO_IDS) {
      const l = linhasDaFormacao(FORMACOES[f]);
      expect(l.defesa + l.meio + l.ataque, f).toBeCloseTo(10, 6);
    }
  });

  it("os parâmetros de tática são válidos", () => {
    expect(validarParametros(P)).toEqual([]);
  });
});

describe("efeitos da tática no jogo", () => {
  const N = 1500;
  const igual = (t: Partial<Tatica>, prefixo: string) => medir(equipa("A", 10, t), equipa("B", 10), N, prefixo);

  it("a tática padrão não muda nada: com ou sem ela o jogo é o mesmo", () => {
    const sem = equipaSintetica("A", 10);
    const com = equipa("A", 10);
    const b = equipaSintetica("B", 10);
    expect(simularJogo({ seed: "s", id: "g", casa: com, fora: b }, P)).toEqual(simularJogo({ seed: "s", id: "g", casa: { ...sem, tatica: TATICA_PADRAO }, fora: b }, P));
  });

  it("fair play: mais duro, mais faltas (e o contrário)", () => {
    const base = igual({}, "f3");
    const duro = igual({ fairPlay: 5 }, "f5");
    const limpo = igual({ fairPlay: 1 }, "f1");
    expect(duro.faltas).toBeGreaterThan(base.faltas * 1.3);
    expect(limpo.faltas).toBeLessThan(base.faltas * 0.8);
    expect(multiplicadorFaltas({ ...TATICA_PADRAO, fairPlay: 5 }, P.tatica)).toBeGreaterThan(multiplicadorFaltas({ ...TATICA_PADRAO, fairPlay: 1 }, P.tatica));
  });

  it("ritmo alto cria mais oportunidades; estilo bonito dá mais bola que o direto; intensidade mexe nas faltas", () => {
    expect(igual({ ritmo: 5 }, "r5").oportunidades).toBeGreaterThan(igual({ ritmo: 1 }, "r1").oportunidades * 1.05);
    expect(igual({ estilo: "bonito" }, "eb").posse).toBeGreaterThan(igual({ estilo: "direto" }, "ed").posse + 0.04);
    expect(igual({ intensidade: 5 }, "i5").faltas).toBeGreaterThan(igual({ intensidade: 1 }, "i1").faltas * 1.25);
  });

  it("nenhuma tática é uma bala de prata entre equipas iguais", { timeout: 60000 }, () => {
    const base = igual({}, "n0");
    const variantes: Partial<Tatica>[] = [{ estilo: "bonito" }, { estilo: "direto" }, { estilo: "contraAtaque" }, { intensidade: 5 }, { intensidade: 1 }, { linha: 5 }, { linha: 1 }, { ritmo: 5 }, { fairPlay: 5 }, { fairPlay: 1 }, { formacao: "4-4-2" }, { formacao: "5-3-2" }, { formacao: "3-4-3" }];
    for (const v of variantes) {
      const m = igual(v, `n${JSON.stringify(v)}`);
      expect(Math.abs(m.pontos - base.pontos), JSON.stringify(v)).toBeLessThan(0.3);
    }
  });

  it("o contra-ataque rende ao mais fraco; o jogo bonito rende ao mais forte", () => {
    const fraco = (t: Partial<Tatica>, p: string) => medir(equipa("A", 8, t), equipa("B", 11), 2500, p).pontos;
    const forte = (t: Partial<Tatica>, p: string) => medir(equipa("A", 11, t), equipa("B", 8), 2500, p).pontos;
    expect(fraco({ estilo: "contraAtaque" }, "cf")).toBeGreaterThan(fraco({}, "cf"));
    expect(forte({ estilo: "bonito" }, "bf")).toBeGreaterThan(forte({}, "bf"));
    expect(forte({ estilo: "contraAtaque" }, "cg")).toBeLessThan(forte({}, "cg"));
  });

  it("o jogo bonito não rende sem técnica", () => {
    const fraca = equipa("A", 6, { estilo: "bonito" });
    const m = modificadoresTatica(fraca.onze.map((j) => j.posicao), fraca.tatica as Tatica, P.tatica, 6);
    expect(m.controlo).toBeCloseTo(0, 6);
    expect(m.defesa).toBeLessThan(0);
  });

  it("a intensidade cansa: a força cai no fim, mais com intensidade e ritmo altos", () => {
    const alta = { ...TATICA_PADRAO, intensidade: 5 as const, ritmo: 5 as const };
    const baixa = { ...TATICA_PADRAO, intensidade: 1 as const, ritmo: 1 as const };
    expect(fadigaEm(20, 94, alta, P.tatica)).toBe(0);
    expect(fadigaEm(90, 94, alta, P.tatica)).toBeGreaterThan(fadigaEm(90, 94, TATICA_PADRAO, P.tatica));
    expect(fadigaEm(90, 94, baixa, P.tatica)).toBe(0);
    expect(fadigaEm(94, 94, alta, P.tatica)).toBeLessThanOrEqual(P.tatica.fadiga.max);
  });

  it("mudar a tática a meio só afeta os minutos seguintes", () => {
    const entrada = { seed: "s", id: "meio", casa: equipa("A", 10), fora: equipa("B", 10) };
    const a = new SimuladorJogo(entrada, P);
    const b = new SimuladorJogo(entrada, P);
    expect(b.simularAte(45)).toEqual(a.simularAte(45));
    b.alterarEquipa("casa", equipa("A", 10, { estilo: "direto", intensidade: 5, ritmo: 5, fairPlay: 5, formacao: "3-4-3" }));
    const depoisA = a.simularAte(94);
    const depoisB = b.simularAte(94);
    expect(depoisB).not.toEqual(depoisA);
    expect(depoisB.every((e) => e.minuto > 45)).toBe(true);
  });
});

// ---------- treinador

const pers = (extra: Partial<Personalidade> = {}): Personalidade => ({ ambicao: 10, lealdade: 10, vaidade: 10, paciencia: 10, integridade: 10, ganancia: 10, temperamento: 10, profissionalismo: 10, ...extra });
const media = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

describe("treinador", () => {
  it("o perfil é estável e tem três favoritas diferentes", () => {
    const a = perfilTreinador("s", "t1", pers(), 12, P);
    expect(perfilTreinador("s", "t1", pers(), 12, P)).toEqual(a);
    expect(a.formacoes).toHaveLength(P.tatica.treinador.favoritas);
    expect(new Set(a.formacoes).size).toBe(a.formacoes.length);
    expect(perfilTreinador("s", "t2", pers(), 12, P)).not.toEqual(a);
    for (const k of ["intensidade", "linha", "ritmo", "fairPlay"] as const) {
      expect(a[k]).toBeGreaterThanOrEqual(1);
      expect(a[k]).toBeLessThanOrEqual(5);
    }
  });

  it("a personalidade empurra as preferências", () => {
    const perfis = (p: Personalidade, q = 12) => Array.from({ length: 300 }, (_, i) => perfilTreinador("s", `x${i}`, p, q, P));
    const ofensivo = perfis(pers({ ambicao: 19, vaidade: 18 }));
    const modesto = perfis(pers({ ambicao: 3, vaidade: 3 }));
    const ataque = (ps: ReturnType<typeof perfis>) => media(ps.map((x) => modificadoresTatica(FORMACOES[x.formacoes[0]!], { ...TATICA_PADRAO, formacao: x.formacoes[0]! }, P.tatica).ataque));
    expect(ataque(ofensivo)).toBeGreaterThan(ataque(modesto));
    expect(media(ofensivo.map((x) => x.linha))).toBeGreaterThan(media(modesto.map((x) => x.linha)) + 0.8);
    expect(media(ofensivo.map((x) => x.intensidade))).toBeGreaterThan(media(modesto.map((x) => x.intensidade)) + 0.5);
    expect(ofensivo.filter((x) => x.estilo === "bonito").length).toBeGreaterThan(modesto.filter((x) => x.estilo === "bonito").length);
    expect(modesto.filter((x) => x.estilo === "contraAtaque").length).toBeGreaterThan(ofensivo.filter((x) => x.estilo === "contraAtaque").length);
    const pavio = perfis(pers({ temperamento: 19, integridade: 6 }));
    const calmo = perfis(pers({ temperamento: 3, integridade: 16 }));
    expect(media(pavio.map((x) => x.fairPlay))).toBeGreaterThan(media(calmo.map((x) => x.fairPlay)) + 1.2);
    expect(media(perfis(pers({ vaidade: 3 }), 18).map((x) => x.flexibilidade))).toBeGreaterThan(media(perfis(pers({ vaidade: 18 }), 6).map((x) => x.flexibilidade)) + 0.4);
  });

  // plantel sem extremos: o 4-3-3 obriga a pôr gente fora de posição
  const atr = (n: number): Atributos => Object.fromEntries(ATRIBUTOS.map((k) => [k, n])) as Atributos;
  const cand = (pessoa: string, pos: string, nivel = 14): CandidatoOnze => ({ pessoa, posicoes: [{ pos, aptidao: 20 }], atributos: atr(nivel), alturaCm: 180 });
  const semExtremos: CandidatoOnze[] = [
    cand("gr1", "GK"), cand("gr2", "GK", 9),
    cand("rb", "RB"), cand("lb", "LB"), ...["cb1", "cb2", "cb3", "cb4"].map((id) => cand(id, "CB")),
    ...["mdc1", "mdc2"].map((id) => cand(id, "DM")),
    ...["mc1", "mc2", "mc3", "mc4"].map((id) => cand(id, "CM")),
    cand("mo1", "AM"),
    ...["pl1", "pl2", "pl3"].map((id) => cand(id, "ST")),
  ];

  it("um treinador flexível adapta a formação ao plantel; um teimoso insiste nas favoritas", () => {
    const base = perfilTreinador("s", "t1", pers(), 12, P);
    const teimoso = escolherEquipa("A", semExtremos, { ...base, formacoes: ["4-3-3", "4-4-2", "3-4-3"], flexibilidade: 0 }, P);
    const flexivel = escolherEquipa("A", semExtremos, { ...base, formacoes: ["4-3-3", "4-4-2", "3-4-3"], flexibilidade: 1 }, P);
    expect(teimoso.tatica?.formacao).toBe("4-3-3");
    expect(flexivel.tatica?.formacao).not.toBe("4-3-3");
    expect(["4-3-3", "4-4-2", "3-4-3"]).not.toContain(flexivel.tatica?.formacao);
    for (const e of [teimoso, flexivel]) {
      expect(e.onze).toHaveLength(11);
      expect(new Set(e.onze.map((j) => j.id)).size).toBe(11);
      expect(e.onze.map((j) => j.posicao)).toEqual([...FORMACOES[e.tatica!.formacao]].sort((a, b) => (a === "GK" ? -1 : b === "GK" ? 1 : 0)));
    }
    // o resto da tática vem do perfil
    expect(teimoso.tatica).toMatchObject({ estilo: base.estilo, intensidade: base.intensidade, linha: base.linha, ritmo: base.ritmo, fairPlay: base.fairPlay });
  });

  it("com um plantel equilibrado, o teimoso fica na favorita e escolhe-se de forma determinística", () => {
    const completo: CandidatoOnze[] = [...semExtremos, cand("ed1", "RW"), cand("ee1", "LW"), cand("ed2", "RW"), cand("ee2", "LW")];
    const perfil = { ...perfilTreinador("s", "t9", pers(), 12, P), formacoes: ["4-4-2", "4-3-3", "3-5-2"] as Tatica["formacao"][], flexibilidade: 0.1 };
    const e = escolherEquipa("A", completo, perfil, P);
    expect(e.tatica?.formacao).toBe("4-4-2");
    expect(escolherEquipa("A", completo, perfil, P)).toEqual(e);
  });
});
