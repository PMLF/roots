import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS as P } from "../../config/parameters";
import { Rng } from "../../random/rng";
import { addDays } from "../../calendar/dates";
import { planKnockout } from "./knockoutPlan";
import { leaguePhaseEdges, colourEdges } from "./leaguePhase";
import { startRun, stepRun, type RunState } from "./run";
import { roundKey, type CompetitionDef, type Entrant, type Fixture, type Played, type RunContext, type StageEvent } from "./types";

const club = (i: number) => `c${String(i).padStart(3, "0")}`;
const entrants = (n: number, tier = 0, from = 0): Entrant[] => Array.from({ length: n }, (_, i) => ({ club: club(from + i), seed: from + i + 1, tier }));

function context(extra: Partial<RunContext> = {}): RunContext & { cursor: { date: string } } {
  const cursor = { date: "2026-09-02" };
  return {
    seed: "fmt", competition: "T", season: 1, params: P, idPrefix: "e1-t",
    allocateDates: (_stage, count) => Array.from({ length: count }, () => { const d = cursor.date; cursor.date = addDays(cursor.date, 7); return d; }),
    cursor,
    ...extra,
  };
}

/** Joga tudo com um modelo simples: golos Poisson-ish pelo seed; empates a eliminar vão a penáltis. */
function playAll(def: CompetitionDef, initial: Entrant[], ctx: RunContext) {
  const rng = new Rng("results");
  const strength = new Map<string, number>();
  const results = new Map<string, Played>();
  const fixtures: Fixture[] = [];
  const events: StageEvent[] = [];
  const goals = (club: string, boost: number) => { const s = strength.get(club) ?? 1; let g = 0; for (let k = 0; k < 5; k++) if (rng.float() < 0.17 * s * boost) g++; return g; };
  let step = startRun(def, initial, ctx);
  for (const e of Object.values(step.state.entrants)) strength.set(e.club, 1.6 - Math.min(1, e.seed / 400));
  const pending: Fixture[] = [...step.fixtures];
  fixtures.push(...step.fixtures);
  events.push(...step.events);
  let guard = 0;
  while (!step.state.done && guard++ < 200) {
    // joga a data mais cedo que falta
    pending.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.round - b.round));
    const day = pending[0]?.date;
    if (!day) throw new Error("competição parada sem jogos por jogar");
    for (const f of pending.filter((x) => x.date === day)) {
      let hg = goals(f.home, f.neutral ? 1 : 1.1);
      let ag = goals(f.away, 1);
      const p: Played = { home: f.home, away: f.away, homeGoals: hg, awayGoals: ag };
      if (f.knockout) {
        const first = f.firstLeg ? results.get(f.firstLeg) : undefined;
        const aggH = hg + (first ? first.awayGoals : 0);
        const aggA = ag + (first ? first.homeGoals : 0);
        if (aggH === aggA) { // prolongamento: 30' a mais
          hg += goals(f.home, 0.4); ag += goals(f.away, 0.4);
          p.homeGoals = hg; p.awayGoals = ag;
          if (hg + (first ? first.awayGoals : 0) === ag + (first ? first.homeGoals : 0)) { p.homePenalties = rng.integer(2, 5); p.awayPenalties = p.homePenalties + (rng.prob(0.5) ? 1 : -1); }
        }
      }
      results.set(f.id, p);
    }
    for (const f of pending.splice(0, pending.length, ...pending.filter((x) => x.date !== day))) void f;
    step = stepRun(def, step.state, (id) => results.get(id), ctx);
    fixtures.push(...step.fixtures);
    pending.push(...step.fixtures);
    events.push(...step.events);
  }
  return { state: step.state as RunState, fixtures, results, events };
}

describe("planeamento das eliminatórias", () => {
  it("campo único: elimina um clube por eliminatória até haver um vencedor", () => {
    for (const n of [2, 3, 5, 10, 13, 16, 31, 64, 100]) {
      const plan = planKnockout([n]);
      expect(plan.reduce((t, r) => t + r.ties, 0), `n=${n}`).toBe(n - 1);
      expect(plan.at(-1)).toMatchObject({ ties: 1, field: 2, fromEnd: 0 });
      for (const r of plan) expect(r.field - 2 * r.ties).toBeGreaterThanOrEqual(0);
    }
    expect(planKnockout([10]).map((r) => r.ties)).toEqual([5, 2, 1, 1]);
    expect(planKnockout([16]).map((r) => [r.field, r.ties])).toEqual([[16, 8], [8, 4], [4, 2], [2, 1]]);
    expect(planKnockout([1])).toEqual([]);
  });

  it("entradas escalonadas: a última vaga entra num campo que é potência de 2", () => {
    const plan = planKnockout([260, 38, 18]);
    expect(plan).toHaveLength(11);
    const lastWave = plan.find((r) => r.waves.includes(2));
    expect(lastWave).toMatchObject({ field: 32, fromEnd: 4 });
    expect(plan.find((r) => r.waves.includes(1))?.field).toBe(56);
    expect(plan.reduce((t, r) => t + r.ties, 0)).toBe(260 + 38 + 18 - 1);
    // nenhuma ronda tem mais clubes de folga do que eliminatórias possíveis, e o campo nunca cresce sem entrar uma vaga
    let alive = 0;
    for (const r of plan) {
      alive += r.waves.reduce((t, w) => t + [260, 38, 18][w]!, 0);
      expect(alive).toBe(r.field);
      alive -= r.ties;
    }
    expect(alive).toBe(1);
  });

  it("vagas de tamanhos estranhos continuam a dar um vencedor", () => {
    for (const sizes of [[40, 30, 7], [1, 1, 1], [5, 1], [200, 40, 20, 18], [3, 100]]) {
      const plan = planKnockout(sizes);
      const total = sizes.reduce((a, b) => a + b, 0);
      expect(plan.reduce((t, r) => t + r.ties, 0), sizes.join()).toBe(total - 1);
    }
  });

  it("nomes estáveis das rondas", () => {
    expect([0, 1, 2, 3, 4].map((e) => roundKey({ fromEnd: e, field: 2 ** (e + 1) }))).toEqual(["final", "semi", "quarter", "r16", "r32"]);
    expect(roundKey({ fromEnd: 4, field: 28 })).toBe("round");
  });
});

describe("eliminatórias com sorteio", () => {
  const def: CompetitionDef = {
    id: "cup",
    stages: [{ kind: "knockout", name: "cup", legs: 1, finalNeutral: true, rules: { pairing: "random", advantage: "lowerTier" }, lateWaves: [entrants(38, 2, 260), entrants(18, 0, 298)] }],
  };
  const initial = entrants(260, 4, 0);

  it("uma taça de 316 clubes: todos jogam no máximo uma vez por ronda, sobe sempre o vencedor, os de cima entram tarde", () => {
    const ctx = context({ neutralVenue: () => "c299" });
    const r = playAll(def, initial, ctx);
    expect(r.state.done).toBe(true);
    expect(r.state.winner).toBeDefined();
    const byRound = new Map<number, Fixture[]>();
    for (const f of r.fixtures) byRound.set(f.round, [...(byRound.get(f.round) ?? []), f]);
    expect(byRound.size).toBe(11);
    let lastDate = "";
    for (const [round, fs] of [...byRound].sort((a, b) => a[0] - b[0])) {
      const clubs = fs.flatMap((f) => [f.home, f.away]);
      expect(new Set(clubs).size, `ronda ${round}`).toBe(clubs.length);
      expect(new Set(fs.map((f) => f.date)).size).toBe(1);
      expect(fs[0]!.date > lastDate).toBe(true);
      lastDate = fs[0]!.date;
      expect(fs.every((f) => f.knockout)).toBe(true);
    }
    // os clubes da primeira divisão (tier 0) só jogam a partir da ronda de entrada
    const first = r.fixtures.filter((f) => f.round <= 6).flatMap((f) => [f.home, f.away]).filter((c) => Number(c.slice(1)) >= 298);
    expect(first).toEqual([]);
    // o clube de escalão inferior joga em casa; a final é em campo neutro
    for (const f of r.fixtures.filter((x) => !x.neutral)) {
      const th = r.state.entrants[f.home]!.tier;
      const ta = r.state.entrants[f.away]!.tier;
      expect(th, `${f.id}`).toBeGreaterThanOrEqual(ta);
    }
    const final = r.fixtures.filter((f) => f.round === 11);
    expect(final).toHaveLength(1);
    expect(final[0]).toMatchObject({ neutral: true, venue: "c299" });
    // ranking: o vencedor primeiro e todos os clubes exactamente uma vez
    const outcome = r.state.outcomes[0]!;
    expect(outcome.ranking[0]).toBe(r.state.winner);
    expect(new Set(outcome.ranking).size).toBe(316);
    expect(outcome.runnerUp).toBe(final[0]!.home === r.state.winner ? final[0]!.away : final[0]!.home);
    // cada ronda reportada
    expect(r.events.filter((e) => e.type === "roundPlayed")).toHaveLength(11);
  });

  it("é determinístico", () => {
    const a = playAll(def, initial, context());
    const b = playAll(def, initial, context());
    expect(b.fixtures.map((f) => [f.id, f.home, f.away, f.date])).toEqual(a.fixtures.map((f) => [f.id, f.home, f.away, f.date]));
    expect(b.state.winner).toBe(a.state.winner);
  });

  it("folgas vão para os clubes de escalão mais alto e a ronda preliminar fica para os de baixo", () => {
    const r = startRun({ id: "x", stages: [{ kind: "knockout", name: "x", legs: 1, rules: { pairing: "random", advantage: "lowerTier" } }] }, [...entrants(3, 0, 0), ...entrants(4, 3, 3)], context());
    // 7 clubes: ronda 1 com 3 eliminatórias (6 jogam) e 1 de folga: o de escalão 0
    expect(r.fixtures).toHaveLength(3);
    const playing = r.fixtures.flatMap((f) => [f.home, f.away]);
    const bye = [...Object.keys(r.state.entrants)].filter((c) => !playing.includes(c));
    expect(bye).toHaveLength(1);
    expect(r.state.entrants[bye[0]!]!.tier).toBe(0);
  });
});

describe("duas mãos", () => {
  const def: CompetitionDef = { id: "two", stages: [{ kind: "knockout", name: "two", legs: 2, finalLegs: 1, finalNeutral: true, rules: { pairing: "seeded", advantage: "betterSeed" } }] };
  it("primeira mão em casa do mais fraco, segunda do melhor cabeça de série; o agregado decide e a final é a uma mão", () => {
    const r = playAll(def, entrants(16), context());
    expect(r.state.done).toBe(true);
    const seconds = r.fixtures.filter((f) => f.firstLeg);
    expect(seconds).toHaveLength(8 + 4 + 2);
    for (const s of seconds) {
      const first = r.fixtures.find((f) => f.id === s.firstLeg)!;
      expect([first.home, first.away]).toEqual([s.away, s.home]);
      expect(r.state.entrants[s.home]!.seed).toBeLessThan(r.state.entrants[s.away]!.seed + (s.round > 7 ? 99 : 0));
      expect(s.date > first.date).toBe(true);
      expect(first.round + 1).toBe(s.round);
    }
    const final = r.fixtures.at(-1)!;
    expect(final.firstLeg).toBeUndefined();
    expect(final.neutral).toBe(true);
    expect(new Set(r.fixtures.map((f) => f.id)).size).toBe(r.fixtures.length);
  });
});

describe("datas em falta (saves antigos)", () => {
  it("com menos datas do que mãos, todos os jogos têm data e a final não passa antes das meias", () => {
    const def: CompetitionDef = { id: "old", stages: [{ kind: "knockout", name: "old", legs: 1, semiLegs: 2, finalLegs: 1, finalNeutral: true, rules: { pairing: "seeded", advantage: "betterSeed" } }] };
    const full = context();
    // as meias a duas mãos precisam de mais uma data: o save antigo só trouxe uma por ronda
    const ctx = context({ allocateDates: (stage, count, info) => full.allocateDates(stage, count - 1, info) });
    const r = playAll(def, entrants(16), ctx);
    expect(r.state.done).toBe(true);
    expect(r.fixtures.every((f) => typeof f.date === "string" && f.date.length === 10)).toBe(true);
    const final = r.fixtures.at(-1)!;
    const lastSemi = r.fixtures.filter((f) => f.id !== final.id).map((f) => f.date).sort().pop()!;
    expect(final.date >= lastSemi).toBe(true);
  });
});

describe("fase de grupos", () => {
  // formato antigo da Liga dos Campeões: 32 clubes em 8 grupos, 2 voltas; os dois primeiros passam; 1.º de um grupo contra 2.º de outro
  const old: CompetitionDef = {
    id: "ucl-old",
    stages: [
      { kind: "groups", name: "groups", groups: 8, legs: 2, qualify: 2 },
      { kind: "knockout", name: "ko", legs: 2, finalLegs: 1, finalNeutral: true, rules: { pairing: "seeded", advantage: "betterSeed", avoidSameOrigin: true } },
    ],
    qualify: (_stage, outcomes, all) => {
      const groups = outcomes[0]!.groups!;
      const tag = (club: string, g: string): Entrant => ({ ...all.get(club)!, origin: g, seed: groups.find((x) => x.id === g)!.table[0] === club ? 1 : 100 });
      return groups.flatMap((g) => [tag(g.table[0]!, g.id), tag(g.table[1]!, g.id)]);
    },
  };
  const res = playAll(old, entrants(32), context());

  it("cada grupo tem 4 clubes, um de cada pote, e joga 12 jogos em 6 jornadas", () => {
    const groupFixtures = res.fixtures.filter((f) => f.stage === 0);
    expect(groupFixtures).toHaveLength(8 * 12);
    expect(Math.max(...groupFixtures.map((f) => f.round))).toBe(6);
    const state = res.state.outcomes[0]!;
    for (const g of state.groups!) {
      expect(g.table).toHaveLength(4);
      const pots = g.table.map((c) => Math.floor(Number(c.slice(1)) / 8));
      expect([...new Set(pots)].sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
    }
  });
  it("passam 16 e os confrontos da fase a eliminar não repetem o grupo", () => {
    const stage1 = res.fixtures.filter((f) => f.stage === 1);
    const firstRound = Math.min(...stage1.map((f) => f.round));
    const first = stage1.filter((f) => f.round === firstRound);
    expect(first).toHaveLength(8);
    const origin = (c: string) => res.state.entrants[c]!.origin;
    for (const f of first) expect(origin(f.home)).not.toBe(origin(f.away));
    expect(res.state.winner).toBeDefined();
    expect(res.events.at(-1)).toMatchObject({ type: "competitionDone" });
  });
});

describe("fase de liga (suíça)", () => {
  const rng = new Rng("lp");
  const def36 = { kind: "leaguePhase" as const, name: "lp", pots: 4, perPot: 2 };

  it("36 clubes: cada um joga 8 jogos, 4 em casa, 2 de cada pote, sem repetir adversários", () => {
    const es = entrants(36);
    const edges = leaguePhaseEdges(def36, es, rng);
    expect(edges).toHaveLength(144);
    const pot = (c: string) => Math.floor((es.find((e) => e.club === c)!.seed - 1) / 9);
    for (const e of es) {
      const own = edges.filter((x) => x.home === e.club || x.away === e.club);
      expect(own).toHaveLength(8);
      expect(own.filter((x) => x.home === e.club)).toHaveLength(4);
      const opp = own.map((x) => (x.home === e.club ? x.away : x.home));
      expect(new Set(opp).size).toBe(8);
      expect(opp).not.toContain(e.club);
      for (let p = 0; p < 4; p++) expect(opp.filter((o) => pot(o) === p), `pote ${p}`).toHaveLength(2);
    }
  });
  it("as jornadas são poucas e ninguém joga duas vezes na mesma", () => {
    const es = entrants(36);
    const edges = leaguePhaseEdges(def36, es, new Rng("lp2"));
    const colour = colourEdges(edges, new Rng("lp3"));
    expect(Math.max(...colour) + 1).toBeLessThanOrEqual(9);
    for (let r = 0; r <= Math.max(...colour); r++) {
      const clubs = edges.flatMap((e, i) => (colour[i] === r ? [e.home, e.away] : []));
      expect(new Set(clubs).size).toBe(clubs.length);
    }
  });
  it("Liga Conferência: 6 potes de 6, um adversário de cada pote, 6 jogos, 3 em casa", () => {
    const es = entrants(36);
    const def = { kind: "leaguePhase" as const, name: "uecl", pots: 6, perPot: 1 };
    const edges = leaguePhaseEdges(def, es, new Rng("uecl"));
    expect(edges).toHaveLength(108);
    const pot = (c: string) => Math.floor((es.find((e) => e.club === c)!.seed - 1) / 6);
    for (const e of es) {
      const own = edges.filter((x) => x.home === e.club || x.away === e.club);
      expect(own).toHaveLength(6);
      expect(own.filter((x) => x.home === e.club)).toHaveLength(3);
      const opp = own.map((x) => (x.home === e.club ? x.away : x.home));
      expect(new Set(opp).size).toBe(6);
      for (let p = 0; p < 6; p++) expect(opp.filter((o) => pot(o) === p), `pote ${p}`).toHaveLength(1);
    }
    const colour = colourEdges(edges, new Rng("uecl2"));
    expect(Math.max(...colour) + 1).toBeLessThanOrEqual(7);
  });
  it("recusa potes que não batem certo", () => {
    expect(() => leaguePhaseEdges(def36, entrants(35), rng)).toThrow();
    expect(() => leaguePhaseEdges({ ...def36, perPot: 3 }, entrants(36), rng)).toThrow();
    expect(() => leaguePhaseEdges({ ...def36, perPot: 20 }, entrants(36), rng)).toThrow();
  });

  // formato novo da Liga dos Campeões: fase de liga; 1.º-8.º diretos aos oitavos; 9.º-24.º jogam um play-off a duas mãos
  const modern: CompetitionDef = {
    id: "ucl-new",
    stages: [
      def36,
      { kind: "knockout", name: "ko", legs: 2, finalLegs: 1, finalNeutral: true, rules: { pairing: "seeded", advantage: "betterSeed" } },
    ],
    qualify: (_s, outcomes, all) => {
      const r = outcomes[0]!.ranking;
      const e = (c: string, seed: number): Entrant => ({ ...all.get(c)!, seed });
      return { entrants: r.slice(8, 24).map((c, i) => e(c, 9 + i)), lateWaves: [r.slice(0, 8).map((c, i) => e(c, 1 + i))] };
    },
  };
  it("fase de liga → play-off → eliminatórias chega a um vencedor", () => {
    const res = playAll(modern, entrants(36), context());
    expect(res.state.done).toBe(true);
    const stage0 = res.fixtures.filter((f) => f.stage === 0);
    expect(stage0).toHaveLength(144);
    const ko = res.fixtures.filter((f) => f.stage === 1);
    // 1.ª ronda: play-off de 16 clubes = 8 eliminatórias a duas mãos; depois oitavos (16), quartos, meias e final
    const r1 = Math.min(...ko.map((f) => f.round));
    expect(ko.filter((f) => f.round === r1)).toHaveLength(8);
    expect(ko.filter((f) => f.firstLeg).length).toBe(8 + 8 + 4 + 2);
    const rounds = res.events.filter((e) => e.type === "roundPlayed");
    expect(rounds).toHaveLength(5);
    // os 8 primeiros só entram na segunda ronda
    const top8 = new Set(res.state.outcomes[0]!.ranking.slice(0, 8));
    expect(ko.filter((f) => f.round <= r1 + 1).flatMap((f) => [f.home, f.away]).filter((c) => top8.has(c))).toEqual([]);
  });
});
