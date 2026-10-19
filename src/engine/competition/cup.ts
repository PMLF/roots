/**
 * Taças vistas de fora (RZ-244): as rondas já sorteadas com resultados (prolongamento e penáltis incluídos), a fase em que cada
 * clube está e o histórico de vencedores. Lê o repositório e o estado da competição; não escreve nada.
 * Código novo em inglês (CLAUDE.md).
 */
import type { Params } from "../config/parameters";
import type { BaseData } from "../data/types";
import type { Repository } from "../persistence/repository";
import { matchWinner, type Match, type ScheduledMatch } from "../persistence/types";
import { activeCompetitions, readRun, CUP, SUPERCUP, cupKind } from "../season/competitions";
import { seasonName } from "../season/saveYear";
import { currentSeason, pyramidData } from "../season/seasonPyramid";
import type { KnockoutState } from "./format/knockout";

/** `final`, `semi`, `quarter`, `round16`, `round32` ou `round` (com `n` = número da ronda). */
export type CupRoundKey = "final" | "semi" | "quarter" | "round16" | "round32" | "round";
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

export function cupView(repo: Repository, data: BaseData, params: Params, competition: string, season = currentSeason(repo)): CupView | undefined {
  const run = readRun(repo, season, competition);
  if (!run || run.state.kind !== "knockout") return undefined;
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

export type ClubCompetitionStatus = "alive" | "out" | "champion" | "runnerUp" | "waiting";
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
    if (!run || run.state.kind !== "knockout" || !run.entrants[club]) continue;
    const view = cupView(repo, data, params, competition, season);
    if (!view) continue;
    const mine = view.rounds.filter((r) => r.matches.some((m) => m.home === club || m.away === club));
    if (run.done && run.winner === club) { out.push({ competition, kind: "cup", status: "champion", round: { key: "final", n: view.rounds.length } }); continue; }
    if (run.done && run.runnerUp === club) { out.push({ competition, kind: "cup", status: "runnerUp", round: { key: "final", n: view.rounds.length } }); continue; }
    const last = mine[mine.length - 1];
    if (!last) { out.push({ competition, kind: "cup", status: run.done ? "out" : "waiting" }); continue; }
    // eliminado se alguma ronda já decidida foi perdida; senão está em prova na última ronda em que joga
    const ties = new Map<string, Match[]>();
    for (const r of mine) for (const m of r.matches.filter((x) => x.home === club || x.away === club)) { const rec = repo.match(m.id); if (rec) (ties.get(r.n.toString()) ?? ties.set(r.n.toString(), []).get(r.n.toString())!).push(rec); }
    const lastTie = ties.get(last.n.toString()) ?? [];
    const legs = last.leg ? 2 : 1;
    const decided = lastTie.length === legs;
    let status: ClubCompetitionStatus = "alive";
    if (decided) {
      let g = 0, a = 0;
      for (const m of lastTie) { g += m.home === club ? m.homeGoals : m.awayGoals; a += m.home === club ? m.awayGoals : m.homeGoals; }
      const lastLeg = lastTie[lastTie.length - 1] as Match;
      const won = g !== a ? g > a : matchWinner(lastLeg) === club;
      status = won ? "alive" : "out";
    }
    out.push({ competition, kind: "cup", status, round: { key: last.key, n: last.n } });
  }
  return out;
}

/** Vencedores da taça por época (épocas já decididas), da mais recente para a mais antiga. */
export function cupWinners(repo: Repository, data: BaseData, params: Params, competition: string): { season: number; label: string; winner?: { club: string; name: string }; runnerUp?: { club: string; name: string } }[] {
  const out = [];
  for (let s = currentSeason(repo); s >= 1; s--) {
    const run = readRun(repo, s, competition);
    if (!run?.done) continue;
    const name = (id: string) => data.clubs.find((c) => c.id === id)?.name ?? id;
    out.push({ season: s, label: seasonName(s, params.calendar.initialYear), ...(run.winner ? { winner: { club: run.winner, name: name(run.winner) } } : {}), ...(run.runnerUp ? { runnerUp: { club: run.runnerUp, name: name(run.runnerUp) } } : {}) });
  }
  return out;
}
