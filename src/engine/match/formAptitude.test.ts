import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS } from "../config/parameters";
import { playersForm, formInReturn, formPerWorkload } from "../season/fitness";
import { injuryEvent } from "../injuries/state";
import { MemoryRepository } from "../persistence/repositoryMemory";
import { aptitudeIn, aptitudeFactor, teamStrength, automaticLineup, type LineupCandidate } from "./team";
import { simulateMatch } from "./simulator";
import { syntheticTeam } from "./test-util";
import type { MatchTeam } from "./types";

const p = DEFAULT_PARAMETERS;

describe("aptidão na posição (RZ-177)", () => {
  it("1 na posição natural, 0,82 numa secundária de 12, 0,62 sem registo; o guarda-redes fora do lugar é um desastre", () => {
    expect(aptitudeFactor(20, "CB", p)).toBe(1);
    expect(aptitudeFactor(undefined, "CB", p)).toBe(1);
    expect(aptitudeFactor(12, "CB", p)).toBeCloseTo(0.82, 2);
    expect(aptitudeFactor(aptitudeIn([], "CB", p), "CB", p)).toBeCloseTo(0.6175, 3);
    expect(aptitudeFactor(aptitudeIn([], "GK", p), "GK", p)).toBeLessThan(0.25);
    expect(aptitudeIn([{ pos: "RB", aptitude: 14 }], "RB", p)).toBe(14);
  });
  it("a mesma equipa rende menos com jogadores fora de posição; sem parâmetros nada muda", () => {
    const base = syntheticTeam("A", 12);
    const away: MatchTeam = { ...base, lineup: base.lineup.map((j, i) => (i >= 1 && i <= 4 ? { ...j, aptitude: 3 } : { ...j, aptitude: 20 })) };
    const withoutParams = teamStrength(away.lineup);
    expect(withoutParams).toEqual(teamStrength(base.lineup));
    const a = teamStrength(base.lineup, undefined, p);
    const b = teamStrength(away.lineup, undefined, p);
    expect(b.defence).toBeLessThan(a.defence);
    expect(b.goalkeeper).toBe(a.goalkeeper);
  });
  it("o onze automático regista a aptidão de cada um na posição que ocupa", () => {
    const cand = (person: string, pos: string, apt = 20): LineupCandidate => ({ person, positions: [{ pos, aptitude: apt }], attributes: Object.fromEntries(Object.keys(syntheticTeam("x", 10).lineup[0]!.attributes).map((k) => [k, 10])), heightCm: 180 });
    const squad = [cand("gk", "GK"), ...["RB", "CB", "CB", "LB", "DM", "CM", "AM", "RW", "ST", "LW"].map((pos, i) => cand(`p${i}`, pos)), cand("extra", "CM", 20)];
    const lineup = automaticLineup(squad, undefined, p);
    expect(lineup.every((j) => j.aptitude === 20)).toBe(true);
  });
  it("jogar com quatro jogadores sem registo da posição custa pontos a sério (≥ 0,2 pontos por jogo)", () => {
    const points = (home: MatchTeam, away: MatchTeam, n: number) => {
      let pts = 0;
      for (let i = 0; i < n; i++) {
        const { summary } = simulateMatch({ seed: `apt-${i}`, id: `j${i}`, home, away }, p);
        pts += summary.home.goals > summary.away.goals ? 3 : summary.home.goals === summary.away.goals ? 1 : 0;
      }
      return pts / n;
    };
    const b = syntheticTeam("B", 12);
    const natural = syntheticTeam("A", 12);
    const improvised: MatchTeam = { ...natural, lineup: natural.lineup.map((j, i) => (i === 0 || i >= 8 ? { ...j, aptitude: 20 } : i % 2 === 0 ? { ...j, aptitude: 3 } : { ...j, aptitude: 20 })) };
    const a = points({ ...natural, lineup: natural.lineup.map((j) => ({ ...j, aptitude: 20 })) }, b, 500);
    const c = points(improvised, b, 500);
    expect(a - c).toBeGreaterThan(0.2);
  }, 120000);
});

describe("forma por cansaço (RZ-177)", () => {
  it("um jogo por semana é normal; dois e três na semana cansam; nunca passa de 1 nem desce do mínimo", () => {
    expect(formPerWorkload(0, p)).toBe(1);
    expect(formPerWorkload(90, p)).toBe(1);
    expect(formPerWorkload(180, p)).toBeCloseTo(0.97, 5);
    expect(formPerWorkload(270, p)).toBeCloseTo(0.94, 5);
    expect(formPerWorkload(5000, p)).toBe(p.match.form.min);
  });
});

describe("regresso de lesão: perda de ritmo (RZ-177)", () => {
  it("volta com forma baixa e recupera dia a dia até 1", () => {
    expect(formInReturn("2026-10-15", "2026-10-15", p)).toBeCloseTo(p.match.form.ret.initial, 6);
    expect(formInReturn("2026-10-20", "2026-10-15", p)).toBeCloseTo(p.match.form.ret.initial + 5 * p.match.form.ret.gainByDay, 6);
    expect(formInReturn("2026-12-01", "2026-10-15", p)).toBe(1);
  });
  it("só afeta quem regressou há pouco; lesionado ou sem lesão fica com a forma por carga", () => {
    const r = new MemoryRepository();
    r.appendEvent(injuryEvent({ player: "p1", club: "A", date: "2026-10-01", season: 1, injury: { type: "muscular", severity: 2, days: 14, relapse: false } }));
    const f = (today: string) => playersForm(r, ["p1", "p2"], today, p);
    expect(f("2026-10-15").get("p1")).toBeCloseTo(p.match.form.ret.initial, 6);
    expect(f("2026-10-15").get("p2")).toBe(1);
    expect(f("2026-10-18").get("p1")!).toBeGreaterThan(f("2026-10-15").get("p1")!);
    expect(f("2026-11-30").get("p1")).toBe(1);
  });
});
