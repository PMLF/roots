/**
 * Estatísticas da época atual de um clube (RZ-175): números de cada jogador do plantel e os tops do clube.
 * Tudo sai dos factos já guardados (jogos, minutos, golos, assistências, cartões, notas); o xG por jogador não se guarda.
 */
import type { Params } from "../config/parametros";
import type { BaseData } from "../dados/tipos";
import { seasonName } from "../epoca/anoDoSave";
import { currentSeason } from "../epoca/piramideEpoca";
import type { Repository } from "../persistencia/repositorio";

export type SeasonPlayerStat = { games: number; minutes: number; goals: number; assists: number; yellow: number; red: number; rating?: number };
export type ClubTop = { player: string; name: string; value: number };

export type ClubSeason = {
  season: number;
  seasonLabel: string;
  league: string;
  /** Posição na tabela, jogos, vitórias, empates, derrotas, golos marcados e sofridos, pontos. */
  team: { position: number; played: number; won: number; drawn: number; lost: number; goalsFor: number; goalsAgainst: number; points: number } | undefined;
  players: Record<string, SeasonPlayerStat>;
  tops: { scorer?: ClubTop; assist?: ClubTop; rating?: ClubTop; minutes?: ClubTop; games?: ClubTop; yellow?: ClubTop; red?: ClubTop; goalsAndAssists?: ClubTop };
};

export function clubSeason(repo: Repository, data: BaseData, params: Params, club: string): ClubSeason | undefined {
  const c = data.clubs.find((x) => x.id === club);
  if (!c) return undefined;
  const season = currentSeason(repo);
  const stats = repo.playerStatsForCompetition(c.league, season).filter((s) => s.club === club);
  const minRated = params.competitionView.minRatedGames;
  const players: Record<string, SeasonPlayerStat> = {};
  for (const s of stats) {
    players[s.player] = { games: s.matches, minutes: s.minutes, goals: s.goals, assists: s.assists, yellow: s.yellows, red: s.reds, ...(s.avgRating !== undefined && s.ratedGames >= minRated ? { rating: Math.round(s.avgRating * 100) / 100 } : {}) };
  }
  const name = (id: string) => repo.publicPerson(id)?.sportingName ?? id;
  const top = (value: (id: string, e: SeasonPlayerStat) => number): ClubTop | undefined => {
    let best: ClubTop | undefined;
    for (const [id, e] of Object.entries(players)) {
      const v = value(id, e);
      if (v > 0 && (!best || v > best.value || (v === best.value && name(id) < best.name))) best = { player: id, name: name(id), value: v };
    }
    return best;
  };
  const table = [...repo.standings(c.league, season)].sort((x, y) => y.points - x.points || (y.scoredGoals - y.concededGoals) - (x.scoredGoals - x.concededGoals) || y.scoredGoals - x.scoredGoals);
  const i = table.findIndex((l) => l.club === club);
  const l = table[i];
  const rating = top((_, e) => (e.rating !== undefined ? e.rating : 0));
  const sc = top((_, e) => e.goals);
  const as = top((_, e) => e.assists);
  const mm = top((_, e) => e.minutes);
  const jg = top((_, e) => e.games);
  const am = top((_, e) => e.yellow);
  const vm = top((_, e) => e.red);
  const ga = top((_, e) => e.goals + e.assists);
  return {
    season, seasonLabel: seasonName(season, params.calendar.initialYear), league: c.league,
    team: l ? { position: i + 1, played: l.matches, won: l.wins, drawn: l.draws, lost: l.losses, goalsFor: l.scoredGoals, goalsAgainst: l.concededGoals, points: l.points } : undefined,
    players,
    tops: { ...(sc ? { scorer: sc } : {}), ...(as ? { assist: as } : {}), ...(ga ? { goalsAndAssists: ga } : {}), ...(rating ? { rating } : {}), ...(mm ? { minutes: mm } : {}), ...(jg ? { games: jg } : {}), ...(am ? { yellow: am } : {}), ...(vm ? { red: vm } : {}) },
  };
}
