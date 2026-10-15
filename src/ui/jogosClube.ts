import type { CompetitionPage } from "@/engine/api/contratos";

export type LinhaJogo = { id: string; round: number; date: string; home: boolean; opponent: string; opponentName: string; result: string; bye: boolean };

/** Todos os jogos de um clube numa liga, na ordem do calendário. */
export function jogosDoClube(page: CompetitionPage, clube: string): LinhaJogo[] {
  const out: LinhaJogo[] = [];
  for (const r of page.rounds) {
    if (r.bye === clube) out.push({ id: `${r.number}-bye`, round: r.number, date: r.date, home: true, opponent: "", opponentName: "", result: "", bye: true });
    for (const m of r.matches) {
      if (m.home !== clube && m.away !== clube) continue;
      const home = m.home === clube;
      out.push({
        id: m.id, round: r.number, date: r.date, home,
        opponent: home ? m.away : m.home, opponentName: home ? m.awayName : m.homeName,
        result: m.homeGoals === undefined || m.awayGoals === undefined ? "" : `${m.homeGoals}–${m.awayGoals}`,
        bye: false,
      });
    }
  }
  return out;
}
