/**
 * Competições europeias vistas de fora (RZ-246/902): tabela da fase de liga com as zonas (oitavos, play-off, fora) e as rondas
 * a eliminar já sorteadas. Lê o repositório e o estado da competição; não escreve nada.
 */
import type { Params } from "../config/parameters";
import type { BaseData } from "../data/types";
import type { Repository } from "../persistence/repository";
import { readRun } from "../season/competitions";
import { seasonName } from "../season/saveYear";
import { currentSeason } from "../season/seasonPyramid";
import { foreignClubList } from "../squad/foreign";
import { europeKind } from "./europe";
import type { CupMatchView, CupRoundView } from "../competition/cup";

type EuropeZone = "direct" | "playoff" | "out";
type EuropeRow = { club: string; name: string; country?: string; played: number; won: number; drawn: number; lost: number; goalsFor: number; goalsAgainst: number; points: number; zone: EuropeZone };
export type EuropeView = {
  competition: string;
  season: number;
  seasonLabel: string;
  done: boolean;
  winner?: { club: string; name: string };
  runnerUp?: { club: string; name: string };
  /** Tabela única da fase de liga (já ordenada). */
  table: EuropeRow[];
  /** Jornadas da fase de liga já disputadas / total. */
  matchdays: { played: number; total: number };
  /** Play-off, oitavos, quartos, meias e final (só as rondas já sorteadas). */
  rounds: CupRoundView[];
};

const KNOCKOUT_LABELS: readonly { key: CupRoundView["key"]; n: number; leg?: 1 | 2 }[] = [
  { key: "playoff", n: 1, leg: 1 }, { key: "playoff", n: 1, leg: 2 },
  { key: "round16", n: 2, leg: 1 }, { key: "round16", n: 2, leg: 2 },
  { key: "quarter", n: 3, leg: 1 }, { key: "quarter", n: 3, leg: 2 },
  { key: "semi", n: 4, leg: 1 }, { key: "semi", n: 4, leg: 2 },
  { key: "final", n: 5 },
];

export function europeView(repo: Repository, data: BaseData, params: Params, competition: string, season = currentSeason(repo)): EuropeView | undefined {
  const kind = europeKind(competition);
  const run = readRun(repo, season, competition);
  if (!kind || !run) return undefined;
  const foreign = new Map(foreignClubList(repo).map((c) => [c.id, c] as const));
  const local = new Map(data.clubs.map((c) => [c.id, c.name] as const));
  const name = (id: string) => local.get(id) ?? foreign.get(id)?.name ?? id;
  const scheduled = repo.calendar(competition, season).matches;
  const played = new Map(repo.competitionMatches(competition, season).map((m) => [m.id, m] as const));
  const isLeaguePhase = (id: string) => id.includes("-lp-");

  const rows = new Map<string, EuropeRow>();
  const lpClubs = run.state.kind === "leaguePhase" ? run.state.clubs : (run.outcomes[0]?.ranking ?? []);
  for (const club of lpClubs) rows.set(club, { club, name: name(club), ...(foreign.get(club) ? { country: foreign.get(club)!.country } : {}), played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0, zone: "playoff" });
  let lpRounds = 0;
  const doneRounds = new Set<number>();
  for (const g of scheduled) {
    if (!isLeaguePhase(g.id)) continue;
    lpRounds = Math.max(lpRounds, g.round);
    const m = played.get(g.id);
    if (!m) continue;
    doneRounds.add(g.round);
    const h = rows.get(g.home), a = rows.get(g.away);
    if (!h || !a) continue;
    h.played++; a.played++;
    h.goalsFor += m.homeGoals; h.goalsAgainst += m.awayGoals;
    a.goalsFor += m.awayGoals; a.goalsAgainst += m.homeGoals;
    if (m.homeGoals > m.awayGoals) { h.won++; h.points += 3; a.lost++; }
    else if (m.homeGoals < m.awayGoals) { a.won++; a.points += 3; h.lost++; }
    else { h.drawn++; a.drawn++; h.points++; a.points++; }
  }
  const final = run.outcomes[0]?.ranking;
  const table = [...rows.values()].sort((x, y) => {
    if (final) return final.indexOf(x.club) - final.indexOf(y.club);
    return y.points - x.points || (y.goalsFor - y.goalsAgainst) - (x.goalsFor - x.goalsAgainst) || y.goalsFor - x.goalsFor || (x.club < y.club ? -1 : 1);
  });
  table.forEach((r, i) => { r.zone = i < 8 ? "direct" : i < 24 ? "playoff" : "out"; });

  const byRound = new Map<number, typeof scheduled>();
  for (const g of scheduled) if (!isLeaguePhase(g.id)) (byRound.get(g.round) ?? byRound.set(g.round, []).get(g.round)!).push(g);
  const rounds: CupRoundView[] = [...byRound.keys()].sort((a, b) => a - b).map((r) => {
    const label = KNOCKOUT_LABELS[Math.max(0, r - lpRounds - 1)] ?? { key: "round" as const, n: r };
    const games = byRound.get(r) ?? [];
    return {
      ...label, date: games[0]?.date ?? "",
      matches: games.map((g): CupMatchView => {
        const m = played.get(g.id);
        return {
          id: g.id, home: g.home, away: g.away, homeName: name(g.home), awayName: name(g.away),
          ...(m ? { homeGoals: m.homeGoals, awayGoals: m.awayGoals, ...(m.extraTime ? { extraTime: true } : {}), ...(m.homePenalties !== undefined && m.awayPenalties !== undefined ? { shootout: { home: m.homePenalties, away: m.awayPenalties } } : {}) } : {}),
        };
      }),
    };
  });
  void kind;
  return {
    competition, season, seasonLabel: seasonName(season, params.calendar.initialYear), done: run.done,
    ...(run.winner ? { winner: { club: run.winner, name: name(run.winner) } } : {}),
    ...(run.runnerUp ? { runnerUp: { club: run.runnerUp, name: name(run.runnerUp) } } : {}),
    table, matchdays: { played: doneRounds.size, total: lpRounds }, rounds,
  };
}
