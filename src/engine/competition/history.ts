/**
 * Histórico de uma competição (RZ-244): pódios por época, clubes com mais títulos, melhores marcadores e assistentes de sempre,
 * recordes de pontos, ataque e defesa numa época, maiores goleadas… Soma o que já está guardado (classificações, estatísticas e
 * jogos de cada época); só conta épocas completas. Vale para ligas e taças (nas taças não há pontos nem pódio de três).
 * Código novo em inglês (CLAUDE.md).
 */
import type { Params } from "../config/parameters";
import type { BaseData } from "../data/types";
import type { Repository } from "../persistence/repository";
import { readRun } from "../season/competitions";
import { seasonName } from "../season/saveYear";
import { currentSeason } from "../season/seasonPyramid";

type HistoryClub = { club: string; name: string };
type HistoryPlayer = { player: string; name: string; club: string; clubName: string; value: number };
type HistorySeasonRecord<T> = T & { season: number; label: string; value: number };

export type CompetitionHistory = {
  competition: string;
  cup: boolean;
  /** Épocas completas, da mais recente à mais antiga: campeão, 2.º e 3.º (taças: vencedor e finalista). */
  seasons: { season: number; label: string; podium: (HistoryClub & { points?: number })[] }[];
  titles: (HistoryClub & { value: number })[];
  podiums: (HistoryClub & { value: number })[];
  /** Só ligas. */
  totalPoints: (HistoryClub & { value: number; seasons: number })[];
  scorers: HistoryPlayer[];
  assisters: HistoryPlayer[];
  appearances: HistoryPlayer[];
  yellows: HistoryPlayer[];
  reds: HistoryPlayer[];
  records: {
    bestPoints?: HistorySeasonRecord<HistoryClub>;
    bestAttack?: HistorySeasonRecord<HistoryClub>;
    bestDefence?: HistorySeasonRecord<HistoryClub>;
    topScorerSeason?: HistorySeasonRecord<{ player: string; name: string; club: string; clubName: string }>;
    biggestWin?: { season: number; label: string; id: string; home: string; away: string; homeName: string; awayName: string; homeGoals: number; awayGoals: number };
    mostGoalsMatch?: { season: number; label: string; id: string; home: string; away: string; homeName: string; awayName: string; homeGoals: number; awayGoals: number };
  };
  seasonCount: number;
};

const TOP = 10;

export function competitionHistory(repo: Repository, data: BaseData, params: Params, competition: string): CompetitionHistory {
  const clubName = (id: string) => data.clubs.find((c) => c.id === id)?.name ?? data.foreignClubs?.find((c) => c.id === id)?.name ?? id;
  const personName = (id: string) => repo.publicPerson(id)?.sportingName ?? id;
  const label = (s: number) => seasonName(s, params.calendar.initialYear);
  const current = currentSeason(repo);
  const out: CompetitionHistory = { competition, cup: false, seasons: [], titles: [], podiums: [], totalPoints: [], scorers: [], assisters: [], appearances: [], yellows: [], reds: [], records: {}, seasonCount: 0 };

  const titles = new Map<string, number>();
  const podiums = new Map<string, number>();
  const points = new Map<string, { value: number; seasons: number }>();
  const players = new Map<string, { goals: number; assists: number; games: number; yellows: number; reds: number; club: string }>();
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
  let biggest: { margin: number; goals: number; rec: NonNullable<CompetitionHistory["records"]["biggestWin"]> } | undefined;
  let mostGoals: { goals: number; rec: NonNullable<CompetitionHistory["records"]["mostGoalsMatch"]> } | undefined;
  const r = out.records;

  for (let s = current; s >= 1; s--) {
    const run = readRun(repo, s, competition);
    const isCup = run !== undefined;
    if (isCup) out.cup = true;
    const matches = repo.competitionMatches(competition, s);
    if (matches.length === 0) continue;
    // época completa: a taça acabou; a liga tem todos os jogos marcados disputados
    const scheduled = repo.calendar(competition, s).matches.length;
    const complete = isCup ? !!run?.done : scheduled > 0 && matches.length >= scheduled;
    if (!complete) continue;
    out.seasonCount++;
    if (isCup) {
      if (run?.winner) { bump(titles, run.winner); bump(podiums, run.winner); }
      if (run?.runnerUp) bump(podiums, run.runnerUp);
      out.seasons.push({ season: s, label: label(s), podium: [...(run?.winner ? [{ club: run.winner, name: clubName(run.winner) }] : []), ...(run?.runnerUp ? [{ club: run.runnerUp, name: clubName(run.runnerUp) }] : [])] });
    } else {
      const table = [...repo.standings(competition, s)].sort((a, b) => b.points - a.points || (b.scoredGoals - b.concededGoals) - (a.scoredGoals - a.concededGoals) || b.scoredGoals - a.scoredGoals);
      const top3 = table.slice(0, 3);
      out.seasons.push({ season: s, label: label(s), podium: top3.map((l) => ({ club: l.club, name: clubName(l.club), points: l.points })) });
      if (top3[0]) bump(titles, top3[0].club);
      for (const l of top3) bump(podiums, l.club);
      for (const l of table) {
        const p = points.get(l.club) ?? { value: 0, seasons: 0 };
        points.set(l.club, { value: p.value + l.points, seasons: p.seasons + 1 });
        if (!r.bestPoints || l.points > r.bestPoints.value) r.bestPoints = { club: l.club, name: clubName(l.club), season: s, label: label(s), value: l.points };
        if (!r.bestAttack || l.scoredGoals > r.bestAttack.value) r.bestAttack = { club: l.club, name: clubName(l.club), season: s, label: label(s), value: l.scoredGoals };
        // a melhor defesa só conta com épocas de jogos suficientes (a taxa por jogo evita premiar épocas curtas)
        if (l.matches >= 10 && (!r.bestDefence || l.concededGoals < r.bestDefence.value)) r.bestDefence = { club: l.club, name: clubName(l.club), season: s, label: label(s), value: l.concededGoals };
      }
    }
    for (const x of repo.playerStatsForCompetition(competition, s)) {
      const p = players.get(x.player) ?? { goals: 0, assists: 0, games: 0, yellows: 0, reds: 0, club: x.club };
      players.set(x.player, { goals: p.goals + x.goals, assists: p.assists + x.assists, games: p.games + x.matches, yellows: p.yellows + x.yellows, reds: p.reds + x.reds, club: s === current || p.club === x.club ? x.club : p.club });
      if (x.goals > 0 && (!r.topScorerSeason || x.goals > r.topScorerSeason.value)) r.topScorerSeason = { player: x.player, name: personName(x.player), club: x.club, clubName: clubName(x.club), season: s, label: label(s), value: x.goals };
    }
    for (const m of matches) {
      const margin = Math.abs(m.homeGoals - m.awayGoals);
      const goals = m.homeGoals + m.awayGoals;
      const rec = { season: s, label: label(s), id: m.id, home: m.home, away: m.away, homeName: clubName(m.home), awayName: clubName(m.away), homeGoals: m.homeGoals, awayGoals: m.awayGoals };
      if (!biggest || margin > biggest.margin || (margin === biggest.margin && goals > biggest.goals)) biggest = { margin, goals, rec };
      if (!mostGoals || goals > mostGoals.goals) mostGoals = { goals, rec };
    }
  }
  if (biggest && biggest.margin > 0) r.biggestWin = biggest.rec;
  if (mostGoals && mostGoals.goals > 0) r.mostGoalsMatch = mostGoals.rec;

  const clubs = (m: Map<string, number>) => [...m].map(([club, value]) => ({ club, name: clubName(club), value })).sort((a, b) => b.value - a.value || (a.name < b.name ? -1 : 1)).slice(0, TOP);
  out.titles = clubs(titles);
  out.podiums = clubs(podiums);
  out.totalPoints = [...points].map(([club, p]) => ({ club, name: clubName(club), value: p.value, seasons: p.seasons })).sort((a, b) => b.value - a.value || (a.name < b.name ? -1 : 1)).slice(0, TOP);
  const rank = (value: (p: { goals: number; assists: number; games: number; yellows: number; reds: number }) => number): HistoryPlayer[] =>
    [...players].map(([id, p]) => ({ player: id, name: personName(id), club: p.club, clubName: clubName(p.club), value: value(p) })).filter((x) => x.value > 0).sort((a, b) => b.value - a.value || (a.name < b.name ? -1 : 1)).slice(0, TOP);
  out.scorers = rank((p) => p.goals);
  out.assisters = rank((p) => p.assists);
  out.appearances = rank((p) => p.games);
  out.yellows = rank((p) => p.yellows);
  out.reds = rank((p) => p.reds);
  return out;
}
