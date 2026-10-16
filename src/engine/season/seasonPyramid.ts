/**
 * Composição da pirâmide por época (RZ-159). Na época 1 vem dos dados; a partir daí guarda-se no save (`pyramid.<época>`)
 * o que os movimentos de fim de época decidiram. `dadosDaEpoca` devolve os dados com a liga e o escalão **atuais** de cada
 * clube, para que todas as páginas mostrem sempre a liga em que o clube joga neste save (a de arranque só fica no
 * histórico de divisões).
 */
import { secondDistrictLeague } from "./districts";
import type { Tier } from "../config/parameters";
import type { ClubId, BaseData, CpSeries } from "../data/types";
import type { Repository } from "../persistence/repository";
import { SERIES, type Pyramid } from "./movements";

const rowKey = (season: number) => `pyramid.${season}`;

export const currentSeason = (repo: Repository): number => Number(repo.meta("season") ?? 1);

export function initialPyramid(data: BaseData): Pyramid {
  const ids = (e: Tier) => data.clubs.filter((c) => c.tier === e).map((c) => c.id);
  const districtLeagues: Record<string, ClubId[]> = {};
  for (const c of data.clubs) if (c.tier === "district") (districtLeagues[c.district] ??= []).push(c.id);
  return {
    first: ids("firstLeague"),
    second: ids("secondLeague"),
    third: ids("thirdLeague"),
    cp: Object.fromEntries(SERIES.map((s) => [s, data.clubs.filter((c) => c.tier === "cp" && c.league === `CP Série ${s}`).map((c) => c.id)])) as Record<CpSeries, ClubId[]>,
    districtLeagues,
  };
}

export function readPyramid(repo: Repository, data: BaseData, season: number): Pyramid {
  const raw = repo.meta(rowKey(season));
  if (raw) return JSON.parse(raw) as Pyramid;
  if (season === 1) return initialPyramid(data);
  throw new Error(`Não há pirâmide guardada para a época ${season}`);
}

export const savePyramid = (repo: Repository, season: number, p: Pyramid) => repo.setMeta(rowKey(season), JSON.stringify(p));

export type TierLeague = { league: string; tier: Tier };

/** A liga e o escalão de cada clube numa pirâmide. Os nomes das ligas vêm dos dados. */
export function pyramidLeagues(p: Pyramid, data: BaseData): Map<ClubId, TierLeague> {
  const tierName = (e: Tier) => data.clubs.find((c) => c.tier === e)?.league ?? e;
  const districtName = (district: string) => data.clubs.find((c) => c.tier === "district" && c.district === district)?.league ?? `Distrital ${district}`;
  const m = new Map<ClubId, TierLeague>();
  for (const [list, e] of [[p.first, "firstLeague"], [p.second, "secondLeague"], [p.third, "thirdLeague"]] as const) for (const c of list) m.set(c, { league: tierName(e), tier: e });
  for (const s of SERIES) for (const c of p.cp[s]) m.set(c, { league: `CP Série ${s}`, tier: "cp" });
  for (const [d, list] of Object.entries(p.districtLeagues)) for (const c of list) m.set(c, { league: districtName(d), tier: "district" });
  return m;
}

/** Os dados com a liga e o escalão de cada clube numa época do save. */
export function pyramidData(repo: Repository, data: BaseData, season: number): BaseData {
  const leagues = pyramidLeagues(readPyramid(repo, data, season), data);
  // quem não está na pirâmide está na SegundaDistrital distrital: não joga (RZ-113)
  return { ...data, clubs: data.clubs.map((c) => { const l = leagues.get(c.id); return l ? { ...c, league: l.league, tier: l.tier } : { ...c, league: secondDistrictLeague(c.district), tier: "district" as const }; }) };
}

/** Os dados com a liga e o escalão **atuais** de cada clube. Idempotente. */
export function seasonData(repo: Repository, data: BaseData): BaseData {
  const season = currentSeason(repo);
  if (season === 1 && repo.meta(rowKey(1)) === undefined) return data;
  return pyramidData(repo, data, season);
}

/** Ligas por onde o clube passou, época a época (o gráfico de divisões). */
export function divisionsHistory(repo: Repository, data: BaseData, club: ClubId): { season: number; tier: Tier; league: string }[] {
  const out: { season: number; tier: Tier; league: string }[] = [];
  for (let e = 1; e <= currentSeason(repo); e++) {
    const l = pyramidLeagues(readPyramid(repo, data, e), data).get(club);
    if (l) out.push({ season: e, ...l });
  }
  return out;
}
