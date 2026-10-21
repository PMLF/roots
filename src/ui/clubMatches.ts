import type { CompetitionPage, CupView } from "@/engine/api/contracts";
import type { RoundTag } from "@/engine/competition/cup";

export type MatchLine = { id: string; round: number; date: string; home: boolean; opponent: string; opponentName: string; result: string; bye: boolean; competition: string; /** Do ponto de vista do clube; vazio se ainda não se jogou. */ outcome?: "win" | "draw" | "loss"; /** Taças: a ronda («Meias-finais · 1.ª mão») em vez da jornada. */ cupRound?: RoundTag };

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

/** Os jogos de um clube numa taça a eliminar, por ronda (prolongamento e penáltis ficam no resultado). */
export function clubCupMatches(cup: CupView, club: string): MatchLine[] {
  const out: MatchLine[] = [];
  for (const r of cup.rounds) {
    for (const m of r.matches) {
      if (m.home !== club && m.away !== club) continue;
      const home = m.home === club;
      const played = m.homeGoals !== undefined && m.awayGoals !== undefined;
      const mine = home ? m.homeGoals ?? 0 : m.awayGoals ?? 0;
      const theirs = home ? m.awayGoals ?? 0 : m.homeGoals ?? 0;
      const shootout = m.shootout ? (home ? m.shootout.home - m.shootout.away : m.shootout.away - m.shootout.home) : 0;
      const diff = mine - theirs !== 0 ? mine - theirs : shootout;
      out.push({
        id: m.id, round: r.n * 10 + (r.leg ?? 0), date: r.date, home, opponent: home ? m.away : m.home, opponentName: home ? m.awayName : m.homeName,
        result: played ? `${m.homeGoals}–${m.awayGoals}${m.shootout ? ` (${m.shootout.home}–${m.shootout.away} g.p.)` : m.extraTime ? " (a.p.)" : ""}` : "",
        bye: false, competition: cup.competition, cupRound: { key: r.key, n: r.n, ...(r.leg ? { leg: r.leg } : {}) },
        ...(played ? { outcome: diff > 0 ? "win" as const : diff < 0 ? "loss" as const : "draw" as const } : {}),
      });
    }
  }
  return out;
}
