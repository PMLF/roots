/**
 * Percurso de uma competição por fases (RZ-140): `startRun` marca os primeiros jogos e `stepRun` — chamado sempre que
 * há resultados novos — resolve o que ficou decidido e devolve os jogos seguintes. O estado é JSON simples, para viver
 * no save; os jogos devolvidos são para o chamador agendar (`Repository.saveCalendar`).
 */
import { groupsDone, groupsOutcome, startGroups, type GroupsState } from "./groups";
import { knockoutOutcome, startKnockout, stepKnockout, type KnockoutState } from "./knockout";
import { leaguePhaseDone, leaguePhaseOutcome, startLeaguePhase, type LeaguePhaseState } from "./leaguePhase";
import type { ClubId, CompetitionDef, Entrant, Fixture, Results, RunContext, StageEvent, StageOutcome } from "./types";

export type StageState = KnockoutState | GroupsState | LeaguePhaseState;
export type RunState = {
  v: 1;
  id: string;
  season: number;
  stage: number;
  state: StageState;
  outcomes: StageOutcome[];
  /** Todos os que entraram, por clube (para as qualificações reaproveitarem seed e escalão). */
  entrants: Record<ClubId, Entrant>;
  done: boolean;
  /** Jornadas já usadas por fases anteriores: as rondas de cada fase continuam a numeração da competição (nunca se repetem). */
  roundBase?: number;
  lastRound?: number;
  winner?: ClubId;
  runnerUp?: ClubId;
};

export type Step = { state: RunState; fixtures: Fixture[]; events: StageEvent[] };

function startStage(def: CompetitionDef, stage: number, entrants: readonly Entrant[], ctx: RunContext, lateWaves?: readonly (readonly Entrant[])[]): { state: StageState; fixtures: Fixture[]; events: StageEvent[] } {
  const s = def.stages[stage];
  if (!s) throw new Error(`${def.id}: stage ${stage} does not exist`);
  if (s.kind === "knockout") return startKnockout(s, stage, entrants, ctx, lateWaves);
  if (s.kind === "groups") return startGroups(s, stage, entrants, ctx);
  return startLeaguePhase(s, stage, entrants, ctx);
}

/** Passa as rondas dos jogos a continuar a numeração da competição inteira. */
function offset(state: RunState, fixtures: Fixture[]): Fixture[] {
  const base = state.roundBase ?? 0;
  const out = base === 0 ? fixtures : fixtures.map((f) => ({ ...f, round: f.round + base }));
  for (const f of out) state.lastRound = Math.max(state.lastRound ?? 0, f.round);
  return out;
}

export function startRun(def: CompetitionDef, entrants: readonly Entrant[], ctx: RunContext): Step {
  const first = startStage(def, 0, entrants, ctx);
  const all: Record<ClubId, Entrant> = {};
  for (const e of entrants) all[e.club] = e;
  for (const s of def.stages) if (s.kind === "knockout") for (const w of s.lateWaves ?? []) for (const e of w) all[e.club] = e;
  const state: RunState = { v: 1, id: def.id, season: ctx.season, stage: 0, state: first.state, outcomes: [], entrants: all, done: false };
  const step: Step = { state, fixtures: offset(state, first.fixtures), events: first.events };
  // uma fase pode ficar decidida logo à partida (um só clube, p. ex.)
  const next = stepRun(def, state, () => undefined, ctx);
  return { state: next.state, fixtures: [...step.fixtures, ...next.fixtures], events: [...step.events, ...next.events] };
}

/** Avança o que os resultados permitirem; pode atravessar várias fases de seguida. */
export function stepRun(def: CompetitionDef, run: RunState, results: Results, ctx: RunContext): Step {
  const fixtures: Fixture[] = [];
  const events: StageEvent[] = [];
  const state: RunState = run;
  while (!state.done) {
    const stageDef = def.stages[state.stage];
    if (!stageDef) break;
    let outcome: StageOutcome | undefined;
    if (stageDef.kind === "knockout" && state.state.kind === "knockout") {
      const r = stepKnockout(stageDef, state.state, results, ctx);
      fixtures.push(...offset(state, r.fixtures));
      events.push(...r.events);
      if (r.done) outcome = knockoutOutcome(state.state);
    } else if (stageDef.kind === "groups" && state.state.kind === "groups") {
      if (groupsDone(state.state, results)) outcome = groupsOutcome(stageDef, state.state, results, ctx);
    } else if (stageDef.kind === "leaguePhase" && state.state.kind === "leaguePhase") {
      if (leaguePhaseDone(state.state, results)) outcome = leaguePhaseOutcome(state.state, results, ctx);
    }
    if (!outcome) break;
    state.outcomes.push(outcome);
    events.push({ type: "stageDone", stage: state.stage, outcome });
    const lastStage = state.stage + 1 >= def.stages.length;
    if (lastStage) {
      state.done = true;
      if (outcome.winner !== undefined) state.winner = outcome.winner;
      else if (outcome.ranking[0] !== undefined) state.winner = outcome.ranking[0];
      if (outcome.runnerUp !== undefined) state.runnerUp = outcome.runnerUp;
      else if (outcome.ranking[1] !== undefined) state.runnerUp = outcome.ranking[1];
      events.push({ type: "competitionDone", ...(state.winner !== undefined ? { winner: state.winner } : {}), ...(state.runnerUp !== undefined ? { runnerUp: state.runnerUp } : {}) });
      break;
    }
    const next = state.stage + 1;
    const q = def.qualify ? def.qualify(next, state.outcomes, new Map(Object.entries(state.entrants))) : outcome.ranking.map((c) => state.entrants[c] as Entrant);
    const entrants = Array.isArray(q) ? q : q.entrants;
    const lateWaves = Array.isArray(q) ? undefined : q.lateWaves;
    for (const e of [...entrants, ...(lateWaves ?? []).flat()]) state.entrants[e.club] = e;
    const started = startStage(def, next, entrants, ctx, lateWaves);
    state.stage = next;
    state.state = started.state;
    state.roundBase = state.lastRound ?? 0;
    fixtures.push(...offset(state, started.fixtures));
    events.push(...started.events);
  }
  return { state, fixtures, events };
}
