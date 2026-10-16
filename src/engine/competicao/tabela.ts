/** Ligação ao repositório: a tabela classificativa final de uma competição e o seu estado de jornadas (RZ-110). */
import type { Params } from "../config/parametros";
import type { Repository } from "../persistencia/repositorio";
import type { IsoDate } from "../persistencia/tipos";
import { sortStandings, type SortedLine } from "./classificacao";
import { competitionState, type CompetitionState } from "./jornadas";

export type CompetitionType = "league" | "promotion";

/** Classificação ordenada com os desempates da competição. Inclui clubes do calendário que ainda não jogaram. */
export function competitionTable(
  repo: Repository,
  competition: string,
  season: number,
  type: CompetitionType,
  params: Params,
  ctx: { seed: string; reputation?: ReadonlyMap<string, number> },
): SortedLine[] {
  const cal = repo.calendar(competition, season);
  const clubs = [...new Set([...cal.matches.flatMap((j) => [j.home, j.away]), ...cal.byes.map((f) => f.club)])];
  return sortStandings(repo.standings(competition, season), repo.competitionMatches(competition, season), params.tiebreak[type === "league" ? "league" : "promotion"], {
    winPoints: params.standings.winPoints,
    drawPoints: params.standings.drawPoints,
    seed: ctx.seed,
    competition,
    season,
    clubs,
    ...(ctx.reputation ? { reputation: ctx.reputation } : {}),
  });
}

/** Estado das jornadas de uma competição na data `hoje`. */
export function competitionStatus(repo: Repository, competition: string, season: number, today: IsoDate): CompetitionState {
  const played = new Set(repo.competitionMatches(competition, season).map((j) => j.id));
  return competitionState(competition, season, repo.calendar(competition, season).matches, played, today);
}
