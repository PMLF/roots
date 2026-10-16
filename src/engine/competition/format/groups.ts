/** Fase de grupos: potes por seed, um clube de cada pote em cada grupo, todos contra todos; os primeiros de cada grupo passam. */
import { Rng } from "../../random/rng";
import type { IsoDate } from "../../persistence/types";
import { allAgainstAll } from "../../calendar/roundRobin";
import { tableOf } from "./tableOf";
import type { ClubId, Entrant, Fixture, GroupsStage, Played, Results, RunContext, StageEvent, StageOutcome } from "./types";

export type GroupsState = {
  kind: "groups";
  stage: number;
  groups: { id: string; clubs: ClubId[] }[];
  fixtures: string[];
  /** Cada grupo, por ordem das jornadas: ids dos jogos (para ler os resultados por grupo). */
  byGroup: Record<string, string[]>;
  dates: IsoDate[];
};

const letter = (i: number) => String.fromCharCode(65 + i);

export function startGroups(def: GroupsStage, stage: number, entrants: readonly Entrant[], ctx: RunContext): { state: GroupsState; fixtures: Fixture[]; events: StageEvent[] } {
  const n = entrants.length;
  if (def.groups < 1 || n % def.groups !== 0 || n / def.groups < 2) throw new Error(`Fase de grupos: ${n} clubes não dividem por ${def.groups} grupos de pelo menos 2`);
  const size = n / def.groups;
  const rng = new Rng(ctx.seed, `${ctx.idPrefix}/s${stage}/groups`);
  const sorted = [...entrants].sort((a, b) => a.seed - b.seed || (a.club < b.club ? -1 : 1));
  const groups = Array.from({ length: def.groups }, (_, g) => ({ id: letter(g), clubs: [] as ClubId[] }));
  for (let pot = 0; pot < size; pot++) {
    const members = rng.derive(`pot${pot}`).shuffle(sorted.slice(pot * def.groups, (pot + 1) * def.groups));
    members.forEach((e, g) => (groups[g] as { clubs: ClubId[] }).clubs.push(e.club));
  }
  const rounds = groups.map((g) => allAgainstAll(g.clubs, def.legs, rng.derive(`calendar${g.id}`)));
  const matchdays = Math.max(...rounds.map((r) => r.length));
  const dates = ctx.allocateDates(stage, matchdays, { kind: "groups" });
  const fixtures: Fixture[] = [];
  const byGroup: Record<string, string[]> = {};
  groups.forEach((g, gi) => {
    byGroup[g.id] = [];
    (rounds[gi] ?? []).forEach((r, i) =>
      r.matches.forEach((m) => {
        const id = `${ctx.idPrefix}-g${g.id}-j${i + 1}-${m.home}`;
        byGroup[g.id]?.push(id);
        fixtures.push({ id, stage, round: i + 1, date: dates[i] as IsoDate, home: m.home, away: m.away, knockout: false });
      }),
    );
  });
  return { state: { kind: "groups", stage, groups, fixtures: fixtures.map((f) => f.id), byGroup, dates }, fixtures, events: [] };
}

export function groupsDone(state: GroupsState, results: Results): boolean {
  return state.fixtures.every((id) => results(id) !== undefined);
}

export function groupsOutcome(def: GroupsStage, state: GroupsState, results: Results, ctx: RunContext): StageOutcome {
  const groups = state.groups.map((g) => {
    const played = (state.byGroup[g.id] ?? []).map((id) => results(id)).filter((p): p is Played => p !== undefined);
    return { id: g.id, table: tableOf(g.clubs, played, ctx, `${state.stage}-${g.id}`).map((l) => l.club) };
  });
  // ranking geral: primeiros de cada grupo, depois segundos… (a ordem entre grupos é a das letras)
  const ranking: ClubId[] = [];
  for (let p = 0; p < Math.max(...groups.map((g) => g.table.length)); p++) for (const g of groups) if (g.table[p]) ranking.push(g.table[p] as ClubId);
  void def;
  return { ranking, groups };
}
