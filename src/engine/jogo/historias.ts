/**
 * O que é notícia num jogo (RZ-109; docs/HISTORICO_EVENTOS.md §4): hat-tricks, vermelhos, goleadas, reviravoltas e golos
 * nos descontos. Sai do relatório do jogo, por isso aparece com o mesmo critério em todos os níveis de detalhe.
 * As lesões têm os seus próprios eventos (`registoDoJogo`).
 */
import type { Params } from "../config/parametros";
import type { NewEvent } from "../persistencia/tipos";
import type { MatchMeta } from "./registo";
import type { PublicReport } from "./detalhe";
import type { Side } from "./tipos";

export type MatchClubs = { home: string; away: string };

export function matchStories(meta: MatchMeta, clubs: MatchClubs, report: Pick<PublicReport, "duration" | "homeGoals" | "awayGoals" | "goals" | "cards">, params: Params): NewEvent[] {
  const h = params.stories;
  const base = { date: meta.date, season: meta.season, round: meta.round, visibility: "exposed" as const, origin: "match" as const };
  const out: NewEvent[] = [];
  const club = (l: Side) => clubs[l];

  // hat-tricks
  const byScorer = new Map<string, { side: Side; goals: number; minutes: number[] }>();
  for (const g of report.goals) {
    const m = byScorer.get(g.player) ?? { side: g.side, goals: 0, minutes: [] };
    m.goals++;
    m.minutes.push(g.minute);
    byScorer.set(g.player, m);
  }
  for (const [player, m] of byScorer)
    if (m.goals >= h.hattrick)
      out.push({ ...base, type: "HATTRICK", entities: [{ k: "person", id: player, roleKind: "scorer" }, { k: "club", id: club(m.side) }, { k: "match", id: meta.id }], data: { goals: m.goals, minutes: m.minutes } });

  // vermelhos
  for (const c of report.cards)
    if (c.colour === "red")
      out.push({ ...base, type: "CARTAO_VERMELHO", entities: [{ k: "person", id: c.player, roleKind: "sentOff" }, { k: "club", id: club(c.side) }, { k: "match", id: meta.id }], data: { minute: c.minute, secondYellow: !!c.secondYellow } });

  const diff = report.homeGoals - report.awayGoals;
  const winner: Side | undefined = diff > 0 ? "home" : diff < 0 ? "away" : undefined;

  // goleada
  if (Math.abs(diff) >= h.rout && winner) {
    const loser: Side = winner === "home" ? "away" : "home";
    out.push({ ...base, type: "GOLEADA", entities: [{ k: "club", id: club(winner), roleKind: "winner" }, { k: "club", id: club(loser), roleKind: "beaten" }, { k: "match", id: meta.id }], data: { winnerGoals: Math.max(report.homeGoals, report.awayGoals), beatenGoals: Math.min(report.homeGoals, report.awayGoals) } });
  }

  // golos notáveis: reviravolta e golo nos descontos que decide ou salva o resultado
  const notable: { goal: (typeof report.goals)[number]; reason: "turnaround" | "discounts" }[] = [];
  const last = report.goals.at(-1);
  if (winner) {
    const behind = (g: { homeGoals: number; awayGoals: number }) => (winner === "home" ? g.awayGoals - g.homeGoals : g.homeGoals - g.awayGoals);
    const worst = report.goals.reduce((a, g) => Math.max(a, behind(g)), 0);
    if (worst >= h.turnaround) {
      // o golo com que o vencedor passa para a frente pela última vez
      let prev = { homeGoals: 0, awayGoals: 0 };
      let turnaround: (typeof report.goals)[number] | undefined;
      for (const g of report.goals) {
        if (g.side === winner && behind(g) < 0 && behind(prev) >= 0) turnaround = g;
        prev = g;
      }
      if (turnaround) notable.push({ goal: turnaround, reason: "turnaround" });
    }
  }
  if (last && last.minute > report.duration - h.discounts && !notable.some((n) => n.goal === last)) {
    // decide a vitória por um golo, ou salva o empate
    const decide = !winner || (winner === last.side && Math.abs(diff) === 1);
    if (decide) notable.push({ goal: last, reason: "discounts" });
  }
  for (const { goal, reason } of notable)
    out.push({
      ...base,
      type: "GOLO_NOTAVEL",
      entities: [{ k: "person", id: goal.player, roleKind: "scorer" }, { k: "club", id: club(goal.side) }, { k: "match", id: meta.id }],
      data: { reason, minute: goal.minute, homeGoals: goal.homeGoals, awayGoals: goal.awayGoals },
    });
  return out;
}
