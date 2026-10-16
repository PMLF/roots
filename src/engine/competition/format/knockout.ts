/** Fase a eliminar: planeia, sorteia ronda a ronda e resolve as eliminatórias (uma ou duas mãos). */
import { Rng } from "../../random/rng";
import type { IsoDate } from "../../persistence/types";
import { pairUp, pickByes } from "./draw";
import { planKnockout, type RoundPlan } from "./knockoutPlan";
import type { ClubId, Entrant, Fixture, KnockoutStage, Played, Results, RunContext, StageEvent, StageOutcome, TieResult } from "./types";

export type KnockoutState = {
  kind: "knockout";
  stage: number;
  plan: RoundPlan[];
  waves: Entrant[][];
  /** Clubes ainda em prova antes do sorteio da ronda `round` (sem os que ainda não entraram). */
  alive: Entrant[];
  /** Índice da ronda em jogo; `plan.length` quando acabou. */
  round: number;
  /** Uma data por mão de cada ronda, por ordem. */
  dates: IsoDate[];
  /** Ronda em jogo à espera de resultados. */
  current?: { ties: { a: ClubId; b: ClubId; fixtures: string[] }[]; byes: ClubId[] };
  /** Clubes que saíram, por ronda de saída (a mais tardia primeiro), para o ranking final. */
  out: ClubId[][];
  winner?: ClubId;
  runnerUp?: ClubId;
};

const legsOf = (def: KnockoutStage, r: number, rounds: number): 1 | 2 => (r === rounds - 1 ? def.finalLegs ?? def.legs : def.legs);

export function startKnockout(def: KnockoutStage, stage: number, entrants: readonly Entrant[], ctx: RunContext, lateWaves: readonly (readonly Entrant[])[] = def.lateWaves ?? []): { state: KnockoutState; fixtures: Fixture[]; events: StageEvent[] } {
  const waves = [[...entrants], ...lateWaves.map((w) => [...w])];
  const plan = planKnockout(waves.map((w) => w.length));
  if (plan.length === 0) {
    const only = entrants[0];
    const state: KnockoutState = { kind: "knockout", stage, plan, waves, alive: [...entrants], round: 0, dates: [], out: [], ...(only ? { winner: only.club } : {}) };
    return { state, fixtures: [], events: [] };
  }
  const legsPerRound = plan.map((_, r) => legsOf(def, r, plan.length));
  const dates = ctx.allocateDates(stage, legsPerRound.reduce((a: number, b) => a + b, 0), { kind: "knockout", legsPerRound });
  const state: KnockoutState = { kind: "knockout", stage, plan, waves, alive: [], round: 0, dates, out: [] };
  return { state, fixtures: drawRound(def, state, ctx), events: [] };
}

/** Sorteia a ronda `state.round`: entram as vagas, escolhem-se as folgas e emparelha-se. Muda o estado. */
function drawRound(def: KnockoutStage, state: KnockoutState, ctx: RunContext): Fixture[] {
  const r = state.round;
  const plan = state.plan[r] as RoundPlan;
  for (const w of plan.waves) state.alive.push(...(state.waves[w] ?? []));
  const rng = new Rng(ctx.seed, `${ctx.idPrefix}/s${state.stage}/r${r}`);
  const { playing, byes } = pickByes(state.alive, state.alive.length - 2 * plan.ties, rng.derive("byes"));
  const pairs = pairUp(playing, def.rules, rng.derive("pairs"));
  const legs = legsOf(def, r, state.plan.length);
  const slot0 = state.plan.slice(0, r).reduce((n, _, i) => n + legsOf(def, i, state.plan.length), 0);
  const isFinal = r === state.plan.length - 1;
  const neutral = isFinal && !!def.finalNeutral;
  const fixtures: Fixture[] = [];
  const ties: NonNullable<KnockoutState["current"]>["ties"] = [];
  pairs.forEach((p, k) => {
    const id1 = `${ctx.idPrefix}-r${r + 1}-t${k + 1}-1`;
    const tie = { a: p.advantage.club, b: p.other.club, fixtures: [id1] };
    const base = { stage: state.stage, knockout: true as const };
    const venue = neutral ? ctx.neutralVenue?.(p.advantage.club, p.other.club) : undefined;
    const neutralFlags = neutral ? { neutral: true as const, ...(venue ? { venue } : {}) } : {};
    if (legs === 1) {
      fixtures.push({ id: id1, ...base, round: slot0 + 1, date: state.dates[slot0] as IsoDate, home: p.advantage.club, away: p.other.club, ...neutralFlags });
    } else {
      const id2 = `${ctx.idPrefix}-r${r + 1}-t${k + 1}-2`;
      tie.fixtures.push(id2);
      fixtures.push({ id: id1, ...base, round: slot0 + 1, date: state.dates[slot0] as IsoDate, home: p.other.club, away: p.advantage.club });
      fixtures.push({ id: id2, ...base, round: slot0 + 2, date: state.dates[slot0 + 1] as IsoDate, home: p.advantage.club, away: p.other.club, firstLeg: id1 });
    }
    ties.push(tie);
  });
  state.current = { ties, byes: byes.map((b) => b.club) };
  return fixtures;
}

/** Quem passa numa eliminatória: o agregado (golos, prolongamento incluído) e, se continua empatado, os penáltis da última mão. */
export function tieWinner(a: ClubId, b: ClubId, played: readonly Played[]): { winner: ClubId; penalties: boolean; aggregate: { a: number; b: number } } | undefined {
  let ga = 0;
  let gb = 0;
  for (const p of played) {
    ga += p.home === a ? p.homeGoals : p.awayGoals;
    gb += p.home === b ? p.homeGoals : p.awayGoals;
  }
  if (ga !== gb) return { winner: ga > gb ? a : b, penalties: false, aggregate: { a: ga, b: gb } };
  const last = played[played.length - 1] as Played;
  if (last.homePenalties === undefined || last.awayPenalties === undefined || last.homePenalties === last.awayPenalties) return undefined;
  return { winner: last.homePenalties > last.awayPenalties ? last.home : last.away, penalties: true, aggregate: { a: ga, b: gb } };
}

export function stepKnockout(def: KnockoutStage, state: KnockoutState, results: Results, ctx: RunContext): { fixtures: Fixture[]; events: StageEvent[]; done: boolean } {
  const events: StageEvent[] = [];
  const fixtures: Fixture[] = [];
  while (state.current) {
    const played = new Map<string, Played[]>();
    for (const t of state.current.ties) {
      const rs = t.fixtures.map((f) => results(f));
      if (rs.some((x) => x === undefined)) return { fixtures, events, done: false };
      played.set(t.fixtures[0] as string, rs as Played[]);
    }
    const results2: TieResult[] = [];
    const survivors: ClubId[] = [...state.current.byes];
    const outThisRound: ClubId[] = [];
    for (const t of state.current.ties) {
      const rs = played.get(t.fixtures[0] as string) as Played[];
      const w = tieWinner(t.a, t.b, rs);
      if (!w) throw new Error(`Eliminatória sem vencedor: ${t.fixtures.join(", ")}`);
      const loser = w.winner === t.a ? t.b : t.a;
      survivors.push(w.winner);
      outThisRound.push(loser);
      results2.push({ winner: w.winner, loser, fixtures: t.fixtures, penalties: w.penalties, aggregate: { winner: w.winner === t.a ? w.aggregate.a : w.aggregate.b, loser: w.winner === t.a ? w.aggregate.b : w.aggregate.a } });
    }
    const plan = state.plan[state.round] as RoundPlan;
    state.out.unshift(outThisRound);
    events.push({ type: "roundPlayed", stage: state.stage, round: state.round + 1, label: { fromEnd: plan.fromEnd, field: plan.field }, ties: results2, byes: state.current.byes });
    const keep = new Set(survivors);
    state.alive = state.alive.filter((e) => keep.has(e.club));
    delete state.current;
    state.round++;
    if (state.round >= state.plan.length) {
      state.winner = survivors[0];
      state.runnerUp = outThisRound[0];
      return { fixtures, events, done: true };
    }
    fixtures.push(...drawRound(def, state, ctx));
  }
  return { fixtures, events, done: state.round >= state.plan.length };
}

export function knockoutOutcome(state: KnockoutState): StageOutcome {
  const ranking = [...(state.winner ? [state.winner] : []), ...state.out.flat()];
  return { ranking, ...(state.winner ? { winner: state.winner } : {}), ...(state.runnerUp ? { runnerUp: state.runnerUp } : {}) };
}
