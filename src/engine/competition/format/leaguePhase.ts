/**
 * Fase de liga «suíça» (modelo da Liga dos Campeões desde 2024/25): todos os clubes numa só tabela, mas cada um joga só
 * `perPot` adversários de cada pote (inclusive o seu), metade em casa e metade fora; nunca se repete um adversário.
 *
 * Construção: potes de igual tamanho `n`, clubes embaralhados dentro de cada pote. Entre dois potes diferentes, o clube
 * `a` do pote `i` joga com os clubes `a + s` do pote `j` para `perPot` deslocamentos `s` distintos (metade em casa, metade
 * fora). Dentro do mesmo pote, `a` joga em casa com `a + s` e fora com `a − s` para `perPot/2` deslocamentos. Isto garante
 * graus e casa/fora equilibrados. As jornadas saem de uma coloração das arestas (tentativas ao acaso, com jornadas extra se
 * for preciso).
 */
import { Rng } from "../../random/rng";
import type { IsoDate } from "../../persistence/types";
import { tableOf } from "./tableOf";
import type { ClubId, Entrant, Fixture, LeaguePhaseStage, Played, Results, RunContext, StageEvent, StageOutcome } from "./types";

export type LeaguePhaseState = { kind: "leaguePhase"; stage: number; clubs: ClubId[]; fixtures: string[]; dates: IsoDate[] };

type Edge = { home: ClubId; away: ClubId };

export function leaguePhaseEdges(def: LeaguePhaseStage, entrants: readonly Entrant[], rng: Rng): Edge[] {
  const P = def.pots;
  const n = entrants.length / P;
  if (!Number.isInteger(n) || n < 2) throw new Error(`League phase: ${entrants.length} clubs do not split into ${P} pots`);
  if (def.perPot % 2 !== 0 || def.perPot < 2) throw new Error("League phase: perPot must be even and ≥ 2");
  if (def.perPot > n) throw new Error(`League phase: perPot ${def.perPot} is too many for pots of ${n} clubs`);
  if (def.perPot / 2 > Math.floor((n - 1) / 2)) throw new Error(`League phase: perPot ${def.perPot} is too many to play inside a pot of ${n} clubs`);
  const sorted = [...entrants].sort((a, b) => a.seed - b.seed || (a.club < b.club ? -1 : 1));
  const pots = Array.from({ length: P }, (_, i) => rng.derive(`pot${i}`).shuffle(sorted.slice(i * n, (i + 1) * n)).map((e) => e.club));
  const edges: Edge[] = [];
  const half = def.perPot / 2;
  for (let i = 0; i < P; i++) {
    // dentro do pote: deslocamentos 1..floor((n-1)/2), distintos, em casa contra a+s (e fora contra a−s)
    const inner = rng.derive(`in${i}`).shuffle(Array.from({ length: Math.floor((n - 1) / 2) }, (_, k) => k + 1)).slice(0, half);
    for (let a = 0; a < n; a++) for (const s of inner) edges.push({ home: pots[i]![a]!, away: pots[i]![(a + s) % n]! });
    for (let j = i + 1; j < P; j++) {
      // entre potes: perPot deslocamentos distintos; os primeiros `half` com o pote i em casa, os outros fora
      const shifts = rng.derive(`x${i}-${j}`).shuffle(Array.from({ length: n }, (_, k) => k)).slice(0, def.perPot);
      for (let a = 0; a < n; a++) shifts.forEach((s, k) => {
        const x = pots[i]![a]!;
        const y = pots[j]![(a + s) % n]!;
        edges.push(k < half ? { home: x, away: y } : { home: y, away: x });
      });
    }
  }
  return edges;
}

/** Tenta colorir as arestas com `K` cores (jornadas); troca cadeias de Kempe quando uma aresta não encontra cor livre. */
function tryColour(edges: readonly Edge[], K: number, order: readonly number[], rng: Rng): number[] | undefined {
  const at = new Map<ClubId, number[]>();
  const slot = (c: ClubId): number[] => {
    let s = at.get(c);
    if (!s) { s = new Array<number>(K).fill(-1); at.set(c, s); }
    return s;
  };
  const colour: number[] = new Array<number>(edges.length).fill(-1);
  const other = (e: Edge, x: ClubId) => (e.home === x ? e.away : e.home);
  const give = (i: number, c: number) => {
    const e = edges[i] as Edge;
    colour[i] = c;
    slot(e.home)[c] = i;
    slot(e.away)[c] = i;
  };
  for (const i of order) {
    const e = edges[i] as Edge;
    const U = slot(e.home);
    const V = slot(e.away);
    const free = (S: number[]) => S.map((x, c) => (x < 0 ? c : -1)).filter((c) => c >= 0);
    const common = free(U).filter((c) => V[c] === -1);
    if (common.length > 0) { give(i, common[Math.floor(rng.float() * common.length)] as number); continue; }
    const fu = free(U);
    const fv = free(V);
    let done = false;
    for (const c of rng.shuffle(fu)) {
      for (const d of rng.shuffle(fv)) {
        // cadeia que sai de e.away alternando c, d, c…; se não chegar a e.home, trocar as cores liberta c em e.away
        const path: number[] = [];
        const vertices = new Set<ClubId>([e.away]);
        let x = e.away;
        let want = c;
        for (;;) {
          const idx = slot(x)[want] as number;
          if (idx < 0) break;
          path.push(idx);
          x = other(edges[idx] as Edge, x);
          vertices.add(x);
          want = want === c ? d : c;
        }
        if (vertices.has(e.home)) continue;
        for (const p of path) { const q = edges[p] as Edge; slot(q.home)[colour[p] as number] = -1; slot(q.away)[colour[p] as number] = -1; }
        for (const p of path) give(p, colour[p] === c ? d : c);
        give(i, c);
        done = true;
        break;
      }
      if (done) break;
    }
    if (!done) return undefined;
  }
  return colour;
}

/** Atribui cada jogo a uma jornada sem que um clube jogue duas vezes na mesma; usa o mínimo (grau máximo) ou mais uma. */
export function colourEdges(edges: readonly Edge[], rng: Rng): number[] {
  const degree = new Map<ClubId, number>();
  for (const e of edges) for (const c of [e.home, e.away]) degree.set(c, (degree.get(c) ?? 0) + 1);
  const rounds = Math.max(...degree.values());
  for (let extra = 0; extra < 3; extra++)
    for (let attempt = 0; attempt < 60; attempt++) {
      const r = rng.derive(`c${extra}-${attempt}`);
      const result = tryColour(edges, rounds + extra, r.shuffle(edges.map((_, i) => i)), r.derive("k"));
      if (result) return result;
    }
  throw new Error("League phase: could not spread the matches over rounds");
}

export function startLeaguePhase(def: LeaguePhaseStage, stage: number, entrants: readonly Entrant[], ctx: RunContext): { state: LeaguePhaseState; fixtures: Fixture[]; events: StageEvent[] } {
  const rng = new Rng(ctx.seed, `${ctx.idPrefix}/s${stage}/leaguePhase`);
  const edges = leaguePhaseEdges(def, entrants, rng.derive("edges"));
  const colour = colourEdges(edges, rng.derive("rounds"));
  const used = [...new Set(colour)].sort((a, b) => a - b);
  const index = new Map(used.map((c, i) => [c, i] as const));
  const dates = ctx.allocateDates(stage, used.length, { kind: "leaguePhase" });
  const fixtures: Fixture[] = edges.map((e, i) => {
    const r = index.get(colour[i] as number) as number;
    return { id: `${ctx.idPrefix}-lp-j${r + 1}-${e.home}`, stage, round: r + 1, date: dates[r] as IsoDate, home: e.home, away: e.away, knockout: false };
  });
  fixtures.sort((a, b) => a.round - b.round || (a.id < b.id ? -1 : 1));
  return { state: { kind: "leaguePhase", stage, clubs: entrants.map((e) => e.club), fixtures: fixtures.map((f) => f.id), dates }, fixtures, events: [] };
}

export const leaguePhaseDone = (state: LeaguePhaseState, results: Results): boolean => state.fixtures.every((id) => results(id) !== undefined);

export function leaguePhaseOutcome(state: LeaguePhaseState, results: Results, ctx: RunContext): StageOutcome {
  const played = state.fixtures.map((id) => results(id)).filter((p): p is Played => p !== undefined);
  return { ranking: tableOf(state.clubs, played, ctx, `${state.stage}`).map((l) => l.club) };
}
