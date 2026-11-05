/** Classificação de uma fase de grupos ou de liga a partir dos jogos disputados. */
import type { Criterion } from "../../config/parameters";
import type { StandingsLine } from "../../persistence/types";
import { sortStandings, type SortedLine } from "../standings";
import type { ClubId, Played, RunContext } from "./types";

export function tableOf(clubs: readonly ClubId[], played: readonly Played[], ctx: RunContext, name: string, criteria?: readonly Criterion[]): SortedLine[] {
  const { winPoints, drawPoints } = ctx.params.standings;
  const lines = new Map<ClubId, StandingsLine>(clubs.map((c) => [c, { club: c, matches: 0, wins: 0, draws: 0, losses: 0, scoredGoals: 0, concededGoals: 0, matchesPoints: 0, adjustment: 0, points: 0 }]));
  for (const j of played) {
    const home = lines.get(j.home);
    const away = lines.get(j.away);
    if (!home || !away) continue;
    for (const [l, gm, gs] of [[home, j.homeGoals, j.awayGoals], [away, j.awayGoals, j.homeGoals]] as const) {
      l.matches++; l.scoredGoals += gm; l.concededGoals += gs;
      if (gm > gs) { l.wins++; l.matchesPoints += winPoints; } else if (gm === gs) { l.draws++; l.matchesPoints += drawPoints; } else l.losses++;
      l.points = l.matchesPoints + l.adjustment;
    }
  }
  return sortStandings([...lines.values()], played, criteria ?? ctx.params.tiebreak.promotion, { winPoints, drawPoints, seed: ctx.seed, competition: `${ctx.competition}/${name}`, season: ctx.season, ...(ctx.reputation ? { reputation: ctx.reputation } : {}), clubs });
}
