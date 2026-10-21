import type { BaseData } from "../data/types";
import type { Params } from "../config/parameters";
import type { Repository } from "../persistence/repository";
import type { IsoDate } from "../persistence/types";

const SEEN = "celebration.seen";

/** O campeão de uma liga já é matematicamente certo? Com a regra dos pontos (sem desempates): líder à frente de quem tem mais pontos possíveis. */
export function clinchedChampion(repo: Repository, params: Params, competition: string, season: number): string | undefined {
  const lines = repo.standings(competition, season);
  if (lines.length < 2) return undefined;
  const total = new Map<string, number>();
  for (const m of repo.calendar(competition, season).matches) for (const c of [m.home, m.away]) total.set(c, (total.get(c) ?? 0) + 1);
  const win = params.standings.winPoints;
  const potential = (club: string, points: number, played: number) => points + Math.max(0, (total.get(club) ?? played) - played) * win;
  const sorted = [...lines].sort((a, b) => b.points - a.points);
  const leader = sorted[0]!;
  if ((total.get(leader.club) ?? 0) === 0) return undefined;
  for (const o of sorted.slice(1)) if (potential(o.club, o.points, o.matches) >= leader.points) return undefined;
  return leader.club;
}

/**
 * Depois de cada dia de jogos: se a liga do clube do gamer ficou decidida, regista o título (uma vez por época),
 * que sai como notícia e como celebração se o campeão for o clube do gamer.
 */
export function clinchTitles(repo: Repository, data: BaseData, params: Params, season: number, today: IsoDate): void {
  const gamer = repo.meta("gamer.club");
  const club = gamer ? data.clubs.find((c) => c.id === gamer) : undefined;
  if (!club) return;
  const competition = club.league;
  if (repo.eventsOf({ k: "competition", id: competition }, { type: "CHAMPION", seasonSince: season, untilSeason: season, limit: 1 }).length > 0) return;
  const champion = clinchedChampion(repo, params, competition, season);
  if (!champion) return;
  repo.appendEvent({ type: "CHAMPION", date: today, season, visibility: "exposed", origin: "match", entities: [{ k: "club", id: champion, roleKind: "champion" }, { k: "competition", id: competition }], data: { league: competition, clinched: true } });
}

/** A celebração por mostrar: o último título do clube do gamer que ainda não foi visto. */
export function pendingCelebration(repo: Repository): { event: number; competition: string; season: number; cup: boolean; clinched: boolean } | undefined {
  const gamer = repo.meta("gamer.club");
  if (!gamer) return undefined;
  const seen = Number(repo.meta(SEEN) ?? 0);
  const e = repo.eventsOf({ k: "club", id: gamer }, { type: "CHAMPION", afterOf: seen, limit: 1 })[0];
  if (!e) return undefined;
  const d = e.data as { league?: string; cup?: boolean; clinched?: boolean };
  return { event: e.id, competition: d.league ?? "", season: e.season, cup: d.cup === true, clinched: d.clinched === true };
}

export function dismissCelebration(repo: Repository): void {
  const gamer = repo.meta("gamer.club");
  const e = gamer ? repo.eventsOf({ k: "club", id: gamer }, { type: "CHAMPION", limit: 1 })[0] : undefined;
  if (e) repo.setMeta(SEEN, String(e.id));
}
