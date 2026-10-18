import type { CompetitionPage } from "@/engine/api/contracts";

export type MatchLine = { id: string; round: number; date: string; home: boolean; opponent: string; opponentName: string; result: string; bye: boolean; competition: string; /** Do ponto de vista do clube; vazio se ainda não se jogou. */ outcome?: "win" | "draw" | "loss" };

/** Todos os jogos de um clube numa liga, na ordem do calendário. */
export function clubMatches(page: CompetitionPage, club: string): MatchLine[] {
  const out: MatchLine[] = [];
  for (const r of page.rounds) {
    if (r.bye === club) out.push({ id: `${r.number}-bye`, round: r.number, date: r.date, home: true, opponent: "", opponentName: "", result: "", bye: true, competition: page.league });
    for (const m of r.matches) {
      if (m.home !== club && m.away !== club) continue;
      const home = m.home === club;
      out.push({
        id: m.id, round: r.number, date: r.date, home,
        opponent: home ? m.away : m.home, opponentName: home ? m.awayName : m.homeName,
        result: m.homeGoals === undefined || m.awayGoals === undefined ? "" : `${m.homeGoals}–${m.awayGoals}`,
        bye: false, competition: page.league,
        ...(m.homeGoals === undefined || m.awayGoals === undefined ? {} : { outcome: (home ? m.homeGoals - m.awayGoals : m.awayGoals - m.homeGoals) > 0 ? "win" as const : m.homeGoals === m.awayGoals ? "draw" as const : "loss" as const }),
      });
    }
  }
  return out;
}
