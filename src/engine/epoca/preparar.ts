/** Calendários e pendências de uma época (RZ-119, RZ-159): partilhado entre avançar no tempo e o fim de época. */
import { Rng } from "../aleatorio/rng";
import { createDate } from "../calendario/datas";
import { generateSeasonCalendars, forRepository, type LeagueDefinition } from "../calendario/calendario";
import type { Tier, Params } from "../config/parametros";
import type { BaseData } from "../dados/tipos";
import type { Repository } from "../persistencia/repositorio";
import type { IsoDate, ScheduledMatch } from "../persistencia/tipos";
import { isInSecondDistrict } from "./distritais";
import { CP_FINAL_PHASE_COMPETITIONS } from "./faseFinalCp";
import { saveParameters } from "./anoDoSave";
import { currentSeason, savePyramid, initialPyramid } from "./piramideEpoca";

export const promotionGroupName = (series: string) => `Fase de Promoção ${series}`;

export const worldLeagues = (data: BaseData): LeagueDefinition[] => {
  const m = new Map<string, LeagueDefinition>();
  for (const c of data.clubs) if (!isInSecondDistrict(c.league)) (m.get(c.league) ?? m.set(c.league, { competition: c.league, tier: c.tier as Tier, clubs: [] }).get(c.league)!).clubs.push(c.id);
  return [...m.values()];
};

/** Garante que a época tem a pirâmide e os calendários gravados e que o save tem data. Idempotente. `dados` já traz as ligas da época. */
export function prepareSeason(repo: Repository, data: BaseData, paramsBase: Params): { today: IsoDate; season: number } {
  const params = saveParameters(repo, paramsBase);
  const season = currentSeason(repo);
  if (repo.meta(`piramide.${season}`) === undefined) savePyramid(repo, season, initialPyramid(data));
  const leagues = worldLeagues(data).filter((l) => l.clubs.length >= 2);
  const first = leagues[0];
  if (first && repo.calendar(first.competition, season).matches.length === 0) {
    const seed = repo.meta("seed") ?? "?";
    repo.transaction(() => {
      for (const cal of generateSeasonCalendars(leagues, season, params.calendar, new Rng(`${seed}|cal`))) {
        const { matches, byes } = forRepository(cal);
        repo.saveCalendar(matches, byes);
      }
    });
  }
  if (repo.meta("data.hoje") === undefined) repo.setMeta("data.hoje", createDate(params.calendar.initialYear + season - 1, params.calendar.seasonStartMonth, 1));
  repo.setMeta("season", String(season));
  return { today: repo.meta("data.hoje") as IsoDate, season };
}

/** Os grupos da Fase de Promoção desta época, se já foram gerados. */
export function promotionGroups(repo: Repository, season: number): { series: "A" | "B" | "C" | "D"; clubs: string[] }[] | undefined {
  const raw = repo.meta(`promocao.${season}`);
  return raw ? (JSON.parse(raw) as { series: "A" | "B" | "C" | "D"; clubs: string[] }[]) : undefined;
}

/** Todos os jogos marcados e por jogar na época (ligas e Fase de Promoção). */
export function matchesPerPlay(repo: Repository, data: BaseData, season: number): ScheduledMatch[] {
  const competitions = [...worldLeagues(data).filter((l) => l.clubs.length >= 2).map((l) => l.competition), ...CP_FINAL_PHASE_COMPETITIONS, ...(promotionGroups(repo, season) ?? []).map((g) => promotionGroupName(g.series))];
  const out: ScheduledMatch[] = [];
  for (const c of competitions) {
    const played = new Set(repo.competitionMatches(c, season).map((j) => j.id));
    for (const j of repo.calendar(c, season).matches) if (!played.has(j.id)) out.push(j);
  }
  return out;
}
