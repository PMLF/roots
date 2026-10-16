/**
 * Fase final do Campeonato de Portugal: meias-finais e final, a jogo único, entre os campeões das quatro séries.
 * Joga-se em domingos, em duas competições («CP Meias-Finais» e «CP Final», porque cada calendário se grava de uma vez), depois de acabarem as séries e tem de acabar em maio. Os campeões das séries sobem à Terceira Liga
 * na mesma; a fase final decide só o campeão do CP. São jogos a eliminar: se acabam empatados há prolongamento e, se
 * continua, penáltis (o motor de jogo guarda-os; quem passa lê-se do resultado guardado).
 */
import { addDays, nextWeekday } from "../calendar/dates";
import type { Params } from "../config/parameters";
import type { ClubId, BaseData, CpSeries } from "../data/types";
import { competitionTable } from "../competition/table";
import type { Repository } from "../persistence/repository";
import { matchWinner, type IsoDate, type ScheduledMatch } from "../persistence/types";
import { SERIES } from "./movements";

export const CP_FINAL_SEMI_COMPETITION = "CP Meias-Finais";
export const CP_FINAL_COMPETITION = "CP Final";
export const CP_FINAL_PHASE_COMPETITIONS = [CP_FINAL_SEMI_COMPETITION, CP_FINAL_COMPETITION] as const;
export const finalPhaseMatchId = (season: number, round: "semi1" | "semi2" | "final") => `e${season}-cp-fase-final-${round}`;

export type SeriesChampion = { series: CpSeries; club: ClubId; matches: number; points: number; difference: number; scoredGoals: number; reputation: number };

/** Os campeões ordenados do melhor para o pior: pontos por jogo, diferença de golos, golos marcados, menor reputação, id. */
export function sortChampions(champions: readonly SeriesChampion[]): SeriesChampion[] {
  const ppg = (c: SeriesChampion) => (c.matches > 0 ? c.points / c.matches : 0);
  return [...champions].sort((a, b) => ppg(b) - ppg(a) || b.difference - a.difference || b.scoredGoals - a.scoredGoals || a.reputation - b.reputation || (a.club < b.club ? -1 : 1));
}

/** Meias-finais: o melhor com o pior e o segundo com o terceiro; joga em casa o melhor classificado. */
export function finalSemiPair(champions: readonly SeriesChampion[]): [{ home: ClubId; away: ClubId }, { home: ClubId; away: ClubId }] {
  const [a, b, c, d] = sortChampions(champions);
  if (!a || !b || !c || !d) throw new Error("A fase final do CP precisa dos campeões das quatro séries");
  return [{ home: a.club, away: d.club }, { home: b.club, away: c.club }];
}

/** Datas: meias-finais no primeiro domingo `diasAposSeries` depois do último jogo das séries; a final `diasEntreRondas` depois. */
export function finalPhaseDates(seriesLastMatch: IsoDate, params: Params): { finalSemi: IsoDate; final: IsoDate } {
  const c = params.calendar.cpFinalPhase;
  const finalSemi = nextWeekday(addDays(seriesLastMatch, c.seriesAfterDays), 0);
  return { finalSemi, final: nextWeekday(addDays(finalSemi, c.roundsBetweenDays), 0) };
}

const seriesNames = SERIES.map((s) => `CP Série ${s}`);

/** As séries do CP acabaram (nada por jogar) e ainda não há fase final: marca as meias-finais. */
export function generateCpFinalSemi(repo: Repository, data: BaseData, params: Params, season: number): boolean {
  if (repo.meta(`cpFinal.${season}`)) return false;
  const seed = repo.meta("seed") ?? "?";
  const rep = new Map(data.clubs.map((c) => [c.id, c.reputation] as const));
  let last: IsoDate = "";
  const champions: SeriesChampion[] = [];
  for (const [i, series] of SERIES.entries()) {
    const competition = seriesNames[i] as string;
    const cal = repo.calendar(competition, season).matches;
    const played = new Set(repo.competitionMatches(competition, season).map((j) => j.id));
    if (cal.length === 0 || cal.some((j) => !played.has(j.id))) return false;
    for (const j of cal) if (j.date > last) last = j.date;
    const line = competitionTable(repo, competition, season, "promotion", params, { seed, reputation: rep })[0];
    if (!line) return false;
    champions.push({ series, club: line.club, matches: line.matches, points: line.points, difference: line.difference, scoredGoals: line.scoredGoals, reputation: rep.get(line.club) ?? 0 });
  }
  const [m1, m2] = finalSemiPair(champions);
  const dates = finalPhaseDates(last, params);
  const match = (id: string, home: ClubId, away: ClubId, date: IsoDate): ScheduledMatch => ({ id, competition: CP_FINAL_SEMI_COMPETITION, season, round: 1, date, home, away, knockout: true });
  repo.transaction(() => {
    repo.saveCalendar([match(finalPhaseMatchId(season, "semi1"), m1.home, m1.away, dates.finalSemi), match(finalPhaseMatchId(season, "semi2"), m2.home, m2.away, dates.finalSemi)], []);
    repo.setMeta(`cpFinal.${season}`, JSON.stringify({ champions: sortChampions(champions).map((c) => c.club), final: dates.final }));
  });
  return true;
}

/** Quem passou em cada meia-final, se as duas já se jogaram. */
function finalists(repo: Repository, season: number): [ClubId, ClubId] | undefined {
  const out: ClubId[] = [];
  for (const r of ["semi1", "semi2"] as const) {
    const j = repo.match(finalPhaseMatchId(season, r));
    const winner = j && matchWinner(j);
    if (!winner) return undefined;
    out.push(winner);
  }
  return [out[0] as ClubId, out[1] as ClubId];
}

/** Jogadas as meias-finais, marca a final (joga em casa o melhor classificado nas séries). */
export function generateCpFinal(repo: Repository, season: number): boolean {
  const raw = repo.meta(`cpFinal.${season}`);
  if (!raw || repo.calendar(CP_FINAL_COMPETITION, season).matches.length > 0) return false;
  const pair = finalists(repo, season);
  if (!pair) return false;
  const { champions, final } = JSON.parse(raw) as { champions: ClubId[]; final: IsoDate };
  const [home, away] = champions.indexOf(pair[0]) <= champions.indexOf(pair[1]) ? pair : ([pair[1], pair[0]] as [ClubId, ClubId]);
  repo.saveCalendar([{ id: finalPhaseMatchId(season, "final"), competition: CP_FINAL_COMPETITION, season, round: 1, date: final, home, away, knockout: true }], []);
  return true;
}

/** O campeão do CP, depois da final. */
export function cpChampionOf(repo: Repository, season: number): ClubId | undefined {
  const j = repo.match(finalPhaseMatchId(season, "final"));
  return j ? matchWinner(j) : undefined;
}
