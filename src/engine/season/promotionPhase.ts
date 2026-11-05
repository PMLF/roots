/**
 * Fase de Promoção (RZ-125; docs/DESIGN_RULES.md §1): os 20 campeões distritais jogam em 4 grupos de 5 (os das séries
 * A-D do CP), todos contra todos a uma volta; os 2 primeiros de cada grupo sobem ao CP, para a série do grupo.
 * Puro: o calendário usa o motor de todos-contra-todos e a classificação os desempates `promocao`.
 */
import { Rng } from "../random/rng";
import { allAgainstAll, type Round } from "../calendar/roundRobin";
import type { Params } from "../config/parameters";
import type { ClubId, DistrictId, CpSeries } from "../data/types";
import { sortStandings, type ResultMatch } from "../competition/standings";
import type { StandingsLine } from "../persistence/types";
import { SERIES } from "./movements";

export type PromotionGroup = { series: CpSeries; clubs: ClubId[] };

/** Agrupa os campeões distritais pela série do CP do seu distrito. */
export function buildGroups(champions: readonly { club: ClubId; district: DistrictId }[], districtSeries: (d: DistrictId) => CpSeries, params: Params): { groups: PromotionGroup[]; warnings: string[] } {
  const warnings: string[] = [];
  const groups = SERIES.map((series): PromotionGroup => ({ series, clubs: champions.filter((c) => districtSeries(c.district) === series).map((c) => c.club) }));
  for (const g of groups) if (g.clubs.length !== params.pyramid.promotion.championsPerGroup) warnings.push(`grupo ${g.series} da Fase de Promoção tem ${g.clubs.length} clubes (esperado ${params.pyramid.promotion.championsPerGroup})`);
  return { groups, warnings };
}

/** Jornadas de um grupo (uma volta, mando alternado). Com 5 clubes há folga em cada ronda. */
export function groupCalendar(g: PromotionGroup, season: number, seed: string, params: Params): Round[] {
  return allAgainstAll(g.clubs, params.pyramid.promotion.legs, new Rng(seed, `promocao/${season}/${g.series}`));
}

/** Classificação final de um grupo a partir dos jogos disputados. */
export function rankGroup(g: PromotionGroup, matches: readonly ResultMatch[], season: number, seed: string, params: Params, reputation: ReadonlyMap<ClubId, number>): ClubId[] {
  const { winPoints, drawPoints } = params.standings;
  const lines = new Map<ClubId, StandingsLine>(g.clubs.map((c) => [c, { club: c, matches: 0, wins: 0, draws: 0, losses: 0, scoredGoals: 0, concededGoals: 0, matchesPoints: 0, adjustment: 0, points: 0 }]));
  for (const j of matches) {
    const home = lines.get(j.home);
    const away = lines.get(j.away);
    if (!home || !away) continue;
    for (const [l, gm, gs] of [[home, j.homeGoals, j.awayGoals], [away, j.awayGoals, j.homeGoals]] as const) {
      l.matches++; l.scoredGoals += gm; l.concededGoals += gs;
      if (gm > gs) { l.wins++; l.matchesPoints += winPoints; } else if (gm === gs) { l.draws++; l.matchesPoints += drawPoints; } else l.losses++;
      l.points = l.matchesPoints + l.adjustment;
    }
  }
  return sortStandings([...lines.values()], matches, params.tiebreak.promotion, { winPoints, drawPoints, seed, competition: `promocao-${g.series}`, season, reputation, clubs: g.clubs }).map((l) => l.club);
}

/** Os promovidos de um grupo, já com a série para onde sobem. */
export const groupPromoted = (g: PromotionGroup, standings: readonly ClubId[], params: Params) =>
  standings.slice(0, params.pyramid.promotion.promotedPerGroup).map((club) => ({ club, series: g.series }));
