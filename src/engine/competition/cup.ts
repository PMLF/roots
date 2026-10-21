/**
 * Taças vistas de fora (RZ-244): as rondas já sorteadas com resultados (prolongamento e penáltis incluídos), a fase em que cada
 * clube está e o histórico de vencedores. Lê o repositório e o estado da competição; não escreve nada.
 * Código novo em inglês (CLAUDE.md).
 */
import type { Params } from "../config/parameters";
import type { BaseData } from "../data/types";
import type { Repository } from "../persistence/repository";
import { matchWinner, type Match, type ScheduledMatch } from "../persistence/types";
import { isEuropean } from "../europe/europe";
import { europeView } from "../europe/view";
import { activeCompetitions, readRun, CUP, SUPERCUP, cupKind } from "../season/competitions";
import { seasonName } from "../season/saveYear";
import { currentSeason, pyramidData } from "../season/seasonPyramid";
import type { KnockoutState } from "./format/knockout";

/** `final`, `semi`, `quarter`, `round16`, `round32` ou `round` (com `n` = número da ronda). */
type CupRoundKey = "final" | "playoff" | "semi" | "quarter" | "round16" | "round32" | "round";
export type RoundTag = { key: CupRoundKey; n: number; leg?: 1 | 2 };
export type CupMatchView = { id: string; home: string; away: string; homeName: string; awayName: string; homeTier?: string; awayTier?: string; homeGoals?: number; awayGoals?: number; extraTime?: boolean; shootout?: { home: number; away: number } };
export type CupRoundView = { key: CupRoundKey; n: number; /** Meias-finais a duas mãos: 1.ª ou 2.ª mão. */ leg?: 1 | 2; date: string; matches: CupMatchView[] };
export type CupView = {
  competition: string;
  season: number;
  seasonLabel: string;
  done: boolean;
  winner?: { club: string; name: string };
  runnerUp?: { club: string; name: string };
  rounds: CupRoundView[];
};

const keyOf = (fromEnd: number): CupRoundKey => (fromEnd === 0 ? "final" : fromEnd === 1 ? "semi" : fromEnd === 2 ? "quarter" : fromEnd === 3 ? "round16" : fromEnd === 4 ? "round32" : "round");

/** Mãos de cada ronda da Taça de Portugal: só as meias-finais a duas mãos (`cupDef`). */
const legsOfRound = (competition: string, fromEnd: number, rounds: number): 1 | 2 => (competition === CUP && fromEnd === 1 && rounds >= 3 ? 2 : 1);

/** Rótulos das rondas (por número de ronda do calendário) a partir do plano guardado. */
function roundLabels(competition: string, state: KnockoutState): Map<number, { key: CupRoundKey; n: number; leg?: 1 | 2 }> {
  const out = new Map<number, { key: CupRoundKey; n: number; leg?: 1 | 2 }>();
  let slot = 1;
  state.plan.forEach((p, r) => {
    const legs = legsOfRound(competition, p.fromEnd, state.plan.length);
    for (let l = 1; l <= legs; l++) out.set(slot++, { key: keyOf(p.fromEnd), n: r + 1, ...(legs === 2 ? { leg: l as 1 | 2 } : {}) });
  });
  return out;
}

/** Ronda de uma taça (a eliminar, sem as europeias) a que pertence o jogo da `round`-ésima data do calendário; `undefined` nas ligas. */
export function cupRoundTag(repo: Repository, competition: string, season: number, round: number): RoundTag | undefined {
  if (isEuropean(competition) || !cupKind(competition)) return undefined;
  const run = readRun(repo, season, competition);
  if (!run || run.state.kind !== "knockout") return undefined;
  return roundLabels(competition, run.state).get(round);
}

export function cupView(repo: Repository, data: BaseData, params: Params, competition: string, season = currentSeason(repo)): CupView | undefined {
  const run = readRun(repo, season, competition);
  if (!run || run.state.kind !== "knockout" || isEuropean(competition)) return undefined;
  const clubs = new Map(pyramidData(repo, data, season).clubs.map((c) => [c.id, c] as const));
  const name = (id: string) => clubs.get(id)?.name ?? id;
  const scheduled = repo.calendar(competition, season).matches;
  const played = new Map(repo.competitionMatches(competition, season).map((m) => [m.id, m] as const));
  const labels = roundLabels(competition, run.state);
  const byRound = new Map<number, ScheduledMatch[]>();
  for (const g of scheduled) (byRound.get(g.round) ?? byRound.set(g.round, []).get(g.round)!).push(g);
  const rounds: CupRoundView[] = [...byRound.keys()].sort((a, b) => a - b).map((r) => {
    const label = labels.get(r) ?? { key: "round" as const, n: r };
    const games = byRound.get(r) ?? [];
    return {
      ...label, date: games[0]?.date ?? "",
      matches: games.map((g): CupMatchView => {
        const m = played.get(g.id);
        const tier = (id: string) => clubs.get(id)?.tier;
        return {
          id: g.id, home: g.home, away: g.away, homeName: name(g.home), awayName: name(g.away),
          ...(tier(g.home) ? { homeTier: tier(g.home) as string } : {}), ...(tier(g.away) ? { awayTier: tier(g.away) as string } : {}),
          ...(m ? { homeGoals: m.homeGoals, awayGoals: m.awayGoals, ...(m.extraTime ? { extraTime: true } : {}), ...(m.homePenalties !== undefined && m.awayPenalties !== undefined ? { shootout: { home: m.homePenalties, away: m.awayPenalties } } : {}) } : {}),
        };
      }),
    };
  });
  return {
    competition, season, seasonLabel: seasonName(season, params.calendar.initialYear), done: run.done,
    ...(run.winner ? { winner: { club: run.winner, name: name(run.winner) } } : {}),
    ...(run.runnerUp ? { runnerUp: { club: run.runnerUp, name: name(run.runnerUp) } } : {}),
    rounds,
  };
}

/** Taças nacionais da época atual (as distritais são dezenas e vivem na ficha do distrito). */
export function nationalCups(repo: Repository, season = currentSeason(repo)): string[] {
  return activeCompetitions(repo, season).filter((c) => c === CUP || c === SUPERCUP);
}

type ClubCompetitionStatus = "alive" | "out" | "champion" | "runnerUp" | "waiting";
export type ClubCompetition = { competition: string; kind: "league" | "cup"; /** Liga: posição e nº de clubes. */ position?: number; of?: number; /** Taça: ronda atual ou em que saiu. */ round?: { key: CupRoundKey; n: number }; status?: ClubCompetitionStatus };

/** Onde o clube compete esta época: a liga (posição) e as taças em que entrou (fase e estado). */
export function clubCompetitions(repo: Repository, data: BaseData, params: Params, club: string, season = currentSeason(repo)): ClubCompetition[] {
  const seasonClubs = pyramidData(repo, data, season).clubs;
  const c = seasonClubs.find((x) => x.id === club);
  if (!c) return [];
  const out: ClubCompetition[] = [];
  const table = [...repo.standings(c.league, season)].sort((x, y) => y.points - x.points || (y.scoredGoals - y.concededGoals) - (x.scoredGoals - x.concededGoals) || y.scoredGoals - x.scoredGoals);
  const i = table.findIndex((l) => l.club === club);
  out.push({ competition: c.league, kind: "league", ...(i >= 0 ? { position: i + 1 } : {}), of: Math.max(table.length, seasonClubs.filter((x) => x.league === c.league).length) });
  for (const competition of activeCompetitions(repo, season)) {
    if (!cupKind(competition)) continue;
    const run = readRun(repo, season, competition);
    if (run && isEuropean(competition) && run.entrants[club]) {
      const eu = europeView(repo, data, params, competition, season);
      const i = eu ? eu.table.findIndex((r) => r.club === club) : -1;
      if (!eu || i < 0) continue;
      const zone = eu.table[i]!.zone;
      const leaguePhaseOver = run.outcomes.length > 0;
      const base = { competition, kind: "cup" as const, position: i + 1, of: eu.table.length };
      if (!leaguePhaseOver) { out.push({ ...base, status: "alive" }); continue; }
      if (zone === "out") { out.push({ ...base, status: "out" }); continue; }
      const r = knockoutStatus(repo, eu.rounds, club, run.done, run.winner, run.runnerUp);
      out.push({ ...base, ...(r.status === "waiting" || !r.round ? { status: "alive" as const, round: { key: "round16" as const, n: 2 } } : r) });
      continue;
    }
    if (!run || run.state.kind !== "knockout" || !run.entrants[club]) continue;
    const view = cupView(repo, data, params, competition, season);
    if (!view) continue;
    const r = knockoutStatus(repo, view.rounds, club, run.done, run.winner, run.runnerUp);
    out.push({ competition, kind: "cup", ...r });
  }
  return out;
}

/** Estado de um clube numa eliminatória: campeão, finalista vencido, à espera, em prova ou eliminado (e a ronda em causa). */
function knockoutStatus(repo: Repository, rounds: CupRoundView[], club: string, done: boolean, winner?: string, runnerUp?: string): { status: ClubCompetitionStatus; round?: { key: CupRoundKey; n: number } } {
  const mine = rounds.filter((r) => r.matches.some((m) => m.home === club || m.away === club));
  if (done && winner === club) return { status: "champion", round: { key: "final", n: rounds.length } };
  if (done && runnerUp === club) return { status: "runnerUp", round: { key: "final", n: rounds.length } };
  const last = mine[mine.length - 1];
  if (!last) return { status: done ? "out" : "waiting" };
  // eliminado se alguma ronda já decidida foi perdida; senão está em prova na última ronda em que joga
  const ties = new Map<string, Match[]>();
  for (const r of mine) for (const m of r.matches.filter((x) => x.home === club || x.away === club)) { const rec = repo.match(m.id); if (rec) (ties.get(r.n.toString()) ?? ties.set(r.n.toString(), []).get(r.n.toString())!).push(rec); }
  const lastTie = ties.get(last.n.toString()) ?? [];
  const legs = last.leg ? 2 : 1;
  let status: ClubCompetitionStatus = "alive";
  if (lastTie.length === legs) {
    let g = 0, a = 0;
    for (const m of lastTie) { g += m.home === club ? m.homeGoals : m.awayGoals; a += m.home === club ? m.awayGoals : m.homeGoals; }
    const lastLeg = lastTie[lastTie.length - 1] as Match;
    status = (g !== a ? g > a : matchWinner(lastLeg) === club) ? "alive" : "out";
  }
  return { status, round: { key: last.key, n: last.n } };
}
