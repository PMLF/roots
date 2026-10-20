import { describe, expect, it, vi } from "vitest";
import { DEFAULT_PARAMETERS as P, validateParameters } from "../config/parameters";
import { ATTRIBUTES, POSITIONS, type Attributes } from "../world/types";
import type { Personality } from "../personality/generate";
import type { LineupCandidate } from "./team";
import { FORMATION_IDS, FORMATIONS, DEFAULT_TACTIC, fatigueIn, formationLines, tacticModifiers, foulsMultiplier, normalizeTactic } from "./formations";
import { areaEdge } from "./team";
import { MatchSimulator, simulateMatch } from "./simulator";
import { chooseTeam, coachProfile } from "./tactic";
import { syntheticTeam } from "./test-util";
import type { MatchTeam, Tactic } from "./types";

// simulações de milhares de jogos: com a máquina carregada passam dos 5 s por omissão
vi.setConfig({ testTimeout: 120000 });

/** Equipa sintética com a formação e a tática dadas (todos os jogadores com o mesmo nível). */
function team(club: string, level: number, t: Partial<Tactic> = {}): MatchTeam {
  const base = syntheticTeam(club, level);
  const tactic = { ...DEFAULT_TACTIC, ...t };
  return { club, tactic, lineup: FORMATIONS[tactic.formation].map((position, i) => ({ ...(base.lineup[0] as MatchTeam["lineup"][0]), id: `${club}-${i}`, position })) };
}

type Measure = { win: number; draw: number; points: number; possession: number; fouls: number; chances: number };
function measure(a: MatchTeam, b: MatchTeam, n: number, prefix: string): Measure {
  const m: Measure = { win: 0, draw: 0, points: 0, possession: 0, fouls: 0, chances: 0 };
  for (let i = 0; i < n; i++) {
    const { summary } = simulateMatch({ seed: "tactic", id: `${prefix}${i}`, home: a, away: b }, P);
    if (summary.home.goals > summary.away.goals) { m.win++; m.points += 3; } else if (summary.home.goals === summary.away.goals) { m.draw++; m.points += 1; }
    m.possession += summary.homePossession;
    m.fouls += summary.home.fouls;
    m.chances += summary.home.chances;
  }
  return { win: m.win / n, draw: m.draw / n, points: m.points / n, possession: m.possession / n, fouls: m.fouls / n, chances: m.chances / n };
}

describe("formações", () => {
  it("são 8, com onze jogadores, um guarda-redes e posições válidas", () => {
    expect(FORMATION_IDS).toHaveLength(8);
    for (const f of FORMATION_IDS) {
      const pos = FORMATIONS[f];
      expect(pos, f).toHaveLength(11);
      expect(pos.filter((p) => p === "GK"), f).toHaveLength(1);
      for (const p of pos) expect(POSITIONS).toContain(p);
      const n = f.split("-").map(Number).reduce((s, x) => s + x, 0);
      expect(n, f).toBe(10);
    }
  });

  it("cada formação tem um perfil próprio e o 4-3-3 é neutro", () => {
    const profiles = FORMATION_IDS.map((f) => tacticModifiers(FORMATIONS[f], DEFAULT_TACTIC, P.tactic));
    expect(profiles[0]).toEqual({ attack: 0, control: 0, defence: 0 });
    for (let i = 0; i < profiles.length; i++)
      for (let j = i + 1; j < profiles.length; j++) {
        const a = profiles[i]!, b = profiles[j]!;
        expect(Math.abs(a.attack - b.attack) + Math.abs(a.control - b.control) + Math.abs(a.defence - b.defence), `${FORMATION_IDS[i]} vs ${FORMATION_IDS[j]}`).toBeGreaterThan(0.05);
      }
  });

  it("formações defensivas defendem mais e atacam menos; as ofensivas ao contrário", () => {
    const m = (f: keyof typeof FORMATIONS) => tacticModifiers(FORMATIONS[f], { ...DEFAULT_TACTIC, formation: f }, P.tactic);
    expect(m("5-3-2").defence).toBeGreaterThan(m("4-3-3").defence);
    expect(m("5-3-2").attack).toBeLessThan(m("4-3-3").attack);
    expect(m("4-4-2").attack).toBeGreaterThan(m("4-3-3").attack);
    expect(m("4-4-2").control).toBeLessThan(m("4-3-3").control);
    expect(m("4-2-3-1").defence).toBeGreaterThan(m("4-3-3").defence);
    // as linhas somam sempre 10 jogadores de campo
    for (const f of FORMATION_IDS) {
      const l = formationLines(FORMATIONS[f]);
      expect(l.defence + l.middle + l.attack, f).toBeCloseTo(10, 6);
    }
  });

  it("os parâmetros de tática são válidos", () => {
    expect(validateParameters(P)).toEqual([]);
  });
});

describe("efeitos da tática no jogo", () => {
  const N = 1500;
  const equal = (t: Partial<Tactic>, prefix: string) => measure(team("A", 10, t), team("B", 10), N, prefix);

  it("a tática padrão não muda nada: com ou sem ela o jogo é o mesmo", () => {
    const without = syntheticTeam("A", 10);
    const using = team("A", 10);
    const b = syntheticTeam("B", 10);
    expect(simulateMatch({ seed: "s", id: "g", home: using, away: b }, P)).toEqual(simulateMatch({ seed: "s", id: "g", home: { ...without, tactic: DEFAULT_TACTIC }, away: b }, P));
  });

  it("fair play: mais duro, mais faltas (e o contrário)", () => {
    const base = equal({}, "f3");
    const hard = equal({ fairPlay: 1 }, "f5");
    const clean = equal({ fairPlay: 5 }, "f1");
    expect(hard.fouls).toBeGreaterThan(base.fouls * 1.3);
    expect(clean.fouls).toBeLessThan(base.fouls * 0.8);
    expect(foulsMultiplier({ ...DEFAULT_TACTIC, fairPlay: 1 }, P.tactic)).toBeGreaterThan(foulsMultiplier({ ...DEFAULT_TACTIC, fairPlay: 5 }, P.tactic));
  });

  it("ritmo alto cria mais oportunidades; estilo bonito dá mais bola que o direto; intensidade mexe nas faltas", () => {
    expect(equal({ intensity: 5 }, "r5").chances).toBeGreaterThan(equal({ intensity: 1 }, "r1").chances * 1.05);
    expect(equal({ directness: 1 }, "eb").possession).toBeGreaterThan(equal({ directness: 5 }, "ed").possession + 0.04);
    expect(equal({ intensity: 5 }, "i5").fouls).toBeGreaterThan(equal({ intensity: 1 }, "i1").fouls * 1.25);
  });

  it("nenhuma tática é uma bala de prata entre equipas iguais", { timeout: 60000 }, () => {
    const base = equal({}, "n0");
    const variants: Partial<Tactic>[] = [{ directness: 1 }, { directness: 5 }, { mentality: 1, directness: 5 }, { intensity: 5 }, { intensity: 1 }, { line: 5 }, { line: 1 }, { mentality: 5 }, { mentality: 1 }, { shooting: 5 }, { shooting: 1 }, { timeWasting: 1 }, { timeWasting: 5 }, { area: "wings" }, { area: "centre" }, { fairPlay: 5 }, { fairPlay: 1 }, { formation: "4-4-2" }, { formation: "5-3-2" }, { formation: "3-4-3" }];
    for (const v of variants) {
      const m = equal(v, `n${JSON.stringify(v)}`);
      expect(Math.abs(m.points - base.points), JSON.stringify(v)).toBeLessThan(0.3);
    }
  });

  it("o contra-ataque rende ao mais fraco; o jogo bonito rende ao mais forte", () => {
    const weak = (t: Partial<Tactic>, p: string) => measure(team("A", 8, t), team("B", 11), 2500, p).points;
    const strong = (t: Partial<Tactic>, p: string) => measure(team("A", 11, t), team("B", 8), 2500, p).points;
    expect(weak({ mentality: 1, directness: 5 }, "cf2")).toBeGreaterThan(weak({}, "cf2"));
    expect(strong({ directness: 1 }, "bf2")).toBeGreaterThan(strong({}, "bf2"));
    expect(strong({ mentality: 1, directness: 5 }, "cg2")).toBeLessThan(strong({}, "cg2"));
  });

  it("o jogo bonito não rende sem técnica", () => {
    const weak = team("A", 6, { directness: 1 });
    const m = tacticModifiers(weak.lineup.map((j) => j.position), weak.tactic as Tactic, P.tactic, 6);
    expect(m.control).toBeCloseTo(0, 6);
    expect(m.defence).toBeLessThan(0);
  });

  it("a intensidade cansa: a força cai no fim, mais com intensidade e ritmo altos", () => {
    const high = { ...DEFAULT_TACTIC, intensity: 5 as const };
    const low = { ...DEFAULT_TACTIC, intensity: 1 as const };
    expect(fatigueIn(20, 94, high, P.tactic)).toBe(0);
    expect(fatigueIn(90, 94, high, P.tactic)).toBeGreaterThan(fatigueIn(90, 94, DEFAULT_TACTIC, P.tactic));
    expect(fatigueIn(90, 94, low, P.tactic)).toBe(0);
    expect(fatigueIn(94, 94, high, P.tactic)).toBeLessThanOrEqual(P.tactic.fatigue.max);
  });

  it("mudar a tática a meio só afeta os minutos seguintes", () => {
    const input = { seed: "s", id: "middle", home: team("A", 10), away: team("B", 10) };
    const a = new MatchSimulator(input, P);
    const b = new MatchSimulator(input, P);
    expect(b.simulateUntil(45)).toEqual(a.simulateUntil(45));
    b.changeTeam("home", team("A", 10, { directness: 5, intensity: 5, fairPlay: 1, formation: "3-4-3" }));
    const aAfter = a.simulateUntil(94);
    const bAfter = b.simulateUntil(94);
    expect(bAfter).not.toEqual(aAfter);
    expect(bAfter.every((e) => e.minute > 45)).toBe(true);
  });
});

// ---------- treinador

const personality = (extra: Partial<Personality> = {}): Personality => ({ ambition: 10, loyalty: 10, vanity: 10, patience: 10, integrity: 10, greed: 10, temperament: 10, professionalism: 10, ...extra });
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

describe("coach", () => {
  it("o perfil é estável e tem três favoritas diferentes", () => {
    const a = coachProfile("s", "t1", personality(), 12, P);
    expect(coachProfile("s", "t1", personality(), 12, P)).toEqual(a);
    expect(a.formations).toHaveLength(P.tactic.coach.favourite);
    expect(new Set(a.formations).size).toBe(a.formations.length);
    expect(coachProfile("s", "t2", personality(), 12, P)).not.toEqual(a);
    for (const k of ["intensity", "mentality", "line", "timeWasting", "directness", "shooting", "fairPlay"] as const) {
      expect(a[k]).toBeGreaterThanOrEqual(1);
      expect(a[k]).toBeLessThanOrEqual(5);
    }
  });

  it("a personalidade empurra as preferências", () => {
    const profiles = (p: Personality, q = 12) => Array.from({ length: 300 }, (_, i) => coachProfile("s", `x${i}`, p, q, P));
    const attacking = profiles(personality({ ambition: 19, vanity: 18 }));
    const modest = profiles(personality({ ambition: 3, vanity: 3 }));
    const attack = (ps: ReturnType<typeof profiles>) => mean(ps.map((x) => tacticModifiers(FORMATIONS[x.formations[0]!], { ...DEFAULT_TACTIC, formation: x.formations[0]! }, P.tactic).attack));
    expect(attack(attacking)).toBeGreaterThan(attack(modest));
    expect(mean(attacking.map((x) => x.line))).toBeGreaterThan(mean(modest.map((x) => x.line)) + 0.8);
    expect(mean(attacking.map((x) => x.intensity))).toBeGreaterThan(mean(modest.map((x) => x.intensity)) + 0.5);
    expect(mean(attacking.map((x) => x.mentality))).toBeGreaterThan(mean(modest.map((x) => x.mentality)) + 0.5);
    expect(mean(modest.map((x) => x.mentality))).toBeLessThan(mean(attacking.map((x) => x.mentality)));
    const fuse = profiles(personality({ temperament: 19, integrity: 6 }));
    const calm = profiles(personality({ temperament: 3, integrity: 16 }));
    expect(mean(fuse.map((x) => x.fairPlay))).toBeLessThan(mean(calm.map((x) => x.fairPlay)) - 1.2);
    expect(mean(profiles(personality({ vanity: 3 }), 18).map((x) => x.flexibility))).toBeGreaterThan(mean(profiles(personality({ vanity: 18 }), 6).map((x) => x.flexibility)) + 0.4);
  });

  // plantel sem extremos: o 4-3-3 obriga a pôr gente fora de posição
  const attr = (n: number): Attributes => Object.fromEntries(ATTRIBUTES.map((k) => [k, n])) as Attributes;
  const cand = (person: string, pos: string, level = 14): LineupCandidate => ({ person, positions: [{ pos, aptitude: 20 }], attributes: attr(level), heightCm: 180 });
  const withoutWingers: LineupCandidate[] = [
    cand("gr1", "GK"), cand("gr2", "GK", 9),
    cand("rb", "RB"), cand("lb", "LB"), ...["cb1", "cb2", "cb3", "cb4"].map((id) => cand(id, "CB")),
    ...["mdc1", "mdc2"].map((id) => cand(id, "DM")),
    ...["mc1", "mc2", "mc3", "mc4"].map((id) => cand(id, "CM")),
    cand("mo1", "AM"),
    ...["pl1", "pl2", "pl3"].map((id) => cand(id, "ST")),
  ];

  it("um treinador flexível adapta a formação ao plantel; um teimoso insiste nas favoritas", () => {
    const base = coachProfile("s", "t1", personality(), 12, P);
    const stubborn = chooseTeam("A", withoutWingers, { ...base, formations: ["4-3-3", "4-4-2", "3-4-3"], flexibility: 0 }, P);
    const flexible = chooseTeam("A", withoutWingers, { ...base, formations: ["4-3-3", "4-4-2", "3-4-3"], flexibility: 1 }, P);
    expect(stubborn.tactic?.formation).toBe("4-3-3");
    expect(flexible.tactic?.formation).not.toBe("4-3-3");
    expect(["4-3-3", "4-4-2", "3-4-3"]).not.toContain(flexible.tactic?.formation);
    for (const e of [stubborn, flexible]) {
      expect(e.lineup).toHaveLength(11);
      expect(new Set(e.lineup.map((j) => j.id)).size).toBe(11);
      expect(e.lineup.map((j) => j.position)).toEqual([...FORMATIONS[e.tactic!.formation]].sort((a, b) => (a === "GK" ? -1 : b === "GK" ? 1 : 0)));
    }
    // o resto da tática vem do perfil
    expect(stubborn.tactic).toMatchObject({ intensity: base.intensity, mentality: base.mentality, line: base.line, timeWasting: base.timeWasting, directness: base.directness, shooting: base.shooting, area: base.area, fairPlay: base.fairPlay });
  });

  it("com um plantel equilibrado, o teimoso fica na favorita e escolhe-se de forma determinística", () => {
    const full: LineupCandidate[] = [...withoutWingers, cand("ed1", "RW"), cand("ee1", "LW"), cand("ed2", "RW"), cand("ee2", "LW")];
    const profile = { ...coachProfile("s", "t9", personality(), 12, P), formations: ["4-4-2", "4-3-3", "3-5-2"] as Tactic["formation"][], flexibility: 0.1 };
    const e = chooseTeam("A", full, profile, P);
    expect(e.tactic?.formation).toBe("4-4-2");
    expect(chooseTeam("A", full, profile, P)).toEqual(e);
  });
});

describe("opções táticas de cinco níveis (RZ-249)", () => {
  const N = 2000;
  const stats = (a: MatchTeam, b: MatchTeam, prefix: string) => {
    const t = { goals: 0, against: 0, shots: 0, xg: 0, yellows: 0, chances: 0, chancesAgainst: 0, points: 0 };
    for (let i = 0; i < N; i++) {
      const { summary: x } = simulateMatch({ seed: "opcoes", id: `${prefix}${i}`, home: a, away: b }, P);
      t.goals += x.home.goals; t.against += x.away.goals; t.shots += x.home.shots; t.xg += x.home.xg; t.yellows += x.home.yellows;
      t.chances += x.home.chances; t.chancesAgainst += x.away.chances;
      t.points += x.home.goals > x.away.goals ? 3 : x.home.goals === x.away.goals ? 1 : 0;
    }
    return Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v / N])) as typeof t;
  };
  const equal = (t: Partial<Tactic>, prefix: string) => stats(team("A", 10, t), team("B", 10), prefix);

  it("o formato antigo converte-se (estilo, ritmo e fair play invertido) e o que falta fica neutro", () => {
    expect(normalizeTactic({ formation: "4-4-2", style: "beautiful", intensity: 4, line: 2, tempo: 5, fairPlay: 5 })).toEqual({ ...DEFAULT_TACTIC, formation: "4-4-2", directness: 1, intensity: 4, line: 2, fairPlay: 1 });
    expect(normalizeTactic({ style: "counterAttack" })).toMatchObject({ mentality: 2, directness: 4 });
    expect(normalizeTactic(undefined)).toEqual(DEFAULT_TACTIC);
    expect(normalizeTactic({ ...DEFAULT_TACTIC, area: "left", shooting: 9 })).toMatchObject({ area: "left", shooting: 5 });
  });

  it("todas as opções no 3 são neutras", () => {
    expect(tacticModifiers(FORMATIONS["4-3-3"], DEFAULT_TACTIC, P.tactic, 10, 1.4)).toEqual({ attack: 0, control: 0, defence: 0 });
  });

  it("mentalidade atacante: mais golos marcados e sofridos; defensiva: menos de ambos", () => {
    const [att, mid, def] = [equal({ mentality: 5 }, "m5"), equal({}, "m3"), equal({ mentality: 1 }, "m1")];
    expect(att.goals).toBeGreaterThan(mid.goals);
    expect(att.against).toBeGreaterThan(mid.against);
    expect(def.against).toBeLessThan(mid.against);
    expect(def.goals).toBeLessThan(mid.goals);
  });

  it("remate fácil dá menos remates de melhor qualidade; rematar de onde der, mais remates piores", () => {
    const [far, mid, easy] = [equal({ shooting: 5 }, "s5"), equal({}, "s3"), equal({ shooting: 1 }, "s1")];
    expect(far.shots).toBeGreaterThan(mid.shots * 1.1);
    expect(easy.shots).toBeLessThan(mid.shots * 0.9);
    expect(far.xg / far.shots).toBeLessThan(mid.xg / mid.shots);
    expect(easy.xg / easy.shots).toBeGreaterThan(mid.xg / mid.shots);
    // a opção não é uma bala de prata
    expect(Math.abs(far.points - mid.points)).toBeLessThan(0.3);
    expect(Math.abs(easy.points - mid.points)).toBeLessThan(0.3);
  });

  it("queimar tempo: quem ganha corta as oportunidades do jogo e leva mais cartões; aproveitar cada segundo, o contrário", () => {
    const strong = (t: Partial<Tactic>, prefix: string) => stats(team("A", 12, t), team("B", 8), prefix);
    const [burn, mid, hurry] = [strong({ timeWasting: 5 }, "u1"), strong({}, "u3"), strong({ timeWasting: 1 }, "u5")];
    expect(burn.chancesAgainst).toBeLessThan(mid.chancesAgainst);
    expect(burn.yellows).toBeGreaterThan(mid.yellows * 1.03);
    expect(hurry.chances).toBeGreaterThan(burn.chances);
    expect(burn.against).toBeLessThan(mid.against);
  });

  it("área a explorar: rende com bons alas contra laterais fracos e custa com maus alas contra bons laterais", () => {
    const wings = new Set(["RW", "LW", "RB", "LB"]);
    const tune = (t: MatchTeam, q: number, positions: Set<string>): MatchTeam => ({
      ...t,
      lineup: t.lineup.map((j) => (positions.has(j.position) ? { ...j, attributes: Object.fromEntries(Object.entries(j.attributes).map(([k, v]) => [k, ["speed", "dribble", "crossing", "technical", "tackling", "marking", "positioning"].includes(k) ? q : v])) as Attributes } : j)),
    });
    const withArea = (t: MatchTeam, area: Tactic["area"]): MatchTeam => ({ ...t, tactic: { ...(t.tactic as Tactic), area } });
    const good = tune(team("A", 10), 17, wings), poor = tune(team("A", 10), 3, wings);
    const weakB = tune(team("B", 10), 4, wings), strongB = tune(team("B", 10), 16, wings);
    expect(areaEdge(good.lineup, weakB.lineup, "wings")).toBeGreaterThan(5);
    expect(areaEdge(poor.lineup, strongB.lineup, "wings")).toBeLessThan(-5);
    expect(areaEdge(good.lineup, weakB.lineup, "any")).toBe(0);
    const up = stats(withArea(good, "wings"), weakB, "a1").points - stats(withArea(good, "any"), weakB, "a1").points;
    const down = stats(withArea(poor, "wings"), strongB, "a2").points - stats(withArea(poor, "any"), strongB, "a2").points;
    expect(up).toBeGreaterThan(0.02);
    expect(down).toBeLessThan(-0.02);
  });

  it("o contexto conta: as opções arrojadas rendem mais em casa, com o treinador certo e com a equipa em forma", () => {
    const bold = (extra: Partial<MatchTeam>, prefix: string) => stats({ ...team("A", 10, { mentality: 5, line: 5 }), ...extra }, team("B", 10), prefix);
    const home = bold({}, "c1"), skilled = bold({ coach: 19 }, "c1"), poor = bold({ coach: 2 }, "c1");
    expect(skilled.goals - skilled.against).toBeGreaterThan(home.goals - home.against);
    expect(poor.goals - poor.against).toBeLessThan(home.goals - home.against);
    // em campo neutro ou fora de casa o efeito é menor: o mesmo onze rende menos fora
    const away = stats(team("B", 10), team("A", 10, { mentality: 5, line: 5 }), "c2");
    expect(away.against - away.goals).toBeLessThan(home.goals - home.against + 0.5);
  });
});
