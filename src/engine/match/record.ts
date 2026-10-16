/** Do resultado do motor de jogo para o que a persistência guarda (RZ-104 → RZ-122). */
import type { FactMatch, NewMatch, Appearance } from "../persistence/types";
import { injuryEvent } from "../injuries/state";
import type { NewEvent } from "../persistence/types";
import type { MatchReport } from "./statistics";
import type { MatchTeam, MatchEvent, MatchSummary } from "./types";

export type MatchMeta = { id: string; competition: string; season: number; round: number; date: string; importance?: number; referee?: string; attendance?: number; revenue?: number; cause?: number };

/**
 * Converte o jogo simulado em `JogoNovo` + factos + participações, prontos para `Repositorio.registarJogo`.
 * Golos (G), assistências (A), penáltis falhados (P) e cartões (CA, CV; `extra` «2A» num vermelho por segundo amarelo) são factos; os onze jogam o jogo todo (substituições: RZ-215). Com o `relatorio` (RZ-105), as participações levam a nota.
 */
export function matchRecord(meta: MatchMeta, home: MatchTeam, away: MatchTeam, events: readonly MatchEvent[], summary: MatchSummary, report?: MatchReport): { match: NewMatch; facts: FactMatch[]; appearances: Appearance[]; /** Eventos `LESAO` a acrescentar com `Repositorio.acrescentarEvento` (a seguir ao `registarJogo`). */ injuries: NewEvent[] } {
  const club = { home: home.club, away: away.club };
  const facts: FactMatch[] = [];
  for (const e of events) {
    if (e.type === "card") {
      facts.push({ minute: e.minute, type: e.colour === "yellow" ? "CA" : "CV", player: e.player, club: club[e.side], ...(e.secondYellow ? { extra: "2A" } : {}) });
      continue;
    }
    if (e.type === "injury") {
      facts.push({ minute: e.minute, type: "L", player: e.player, club: club[e.side], extra: `gravidade:${e.injury.severity}` });
      continue;
    }
    if (e.type === "substitution") {
      facts.push({ minute: e.minute, type: "S", player: e.playerIn, club: club[e.side], extra: `sai:${e.playerOut}` });
      continue;
    }
    if (e.type !== "shot") continue;
    if (e.outcome === "goal") {
      facts.push({ minute: e.minute, type: "G", player: e.player, club: club[e.side], ...(e.origin !== "openPlay" ? { extra: e.origin } : {}) });
      if (e.assistant) facts.push({ minute: e.minute, type: "A", player: e.assistant, club: club[e.side] });
    } else if (e.origin === "penalty") facts.push({ minute: e.minute, type: "P", player: e.player, club: club[e.side] });
  }
  const round = (x: number) => Math.round(x * 100) / 100;
  const match: NewMatch = {
    id: meta.id, competition: meta.competition, season: meta.season, round: meta.round, date: meta.date,
    home: home.club, away: away.club, homeGoals: summary.home.goals, awayGoals: summary.away.goals,
    homeXg: round(summary.home.xg), awayXg: round(summary.away.xg), homePossession: round(summary.homePossession),
    ...(meta.attendance !== undefined ? { attendance: meta.attendance } : {}),
    ...(meta.revenue !== undefined ? { revenue: meta.revenue } : {}),
    ...(meta.importance !== undefined ? { importance: meta.importance } : {}),
    ...(meta.referee !== undefined ? { referee: meta.referee } : {}),
    ...(meta.cause !== undefined ? { cause: meta.cause } : {}),
  };
  const rating = (id: string) => report?.players.find((x) => x.id === id)?.rating;
  /** Minuto em que o jogador saiu (lesão, expulsão) ou entrou (substituição). */
  const output = (id: string) => events.find((e) => (e.type === "injury" && e.player === id) || (e.type === "card" && e.colour === "red" && e.player === id) || (e.type === "substitution" && e.playerOut === id))?.minute;
  const take = (eq: MatchTeam): Appearance[] => {
    const using = (id: string, starter: boolean, minutes: number): Appearance => {
      const n = rating(id);
      return { player: id, club: eq.club, starter, minutes, ...(n !== undefined ? { rating: n } : {}) };
    };
    const inputs = events.filter((e): e is Extract<MatchEvent, { type: "substitution" }> => e.type === "substitution" && (eq.bench ?? []).some((b) => b.id === e.playerIn));
    return [
      ...eq.lineup.map((j) => using(j.id, true, output(j.id) ?? summary.duration)),
      ...inputs.map((e) => using(e.playerIn, false, summary.duration - e.minute)),
    ];
  };
  const appearances: Appearance[] = [...take(home), ...take(away)];
  const injuries: NewEvent[] = events
    .filter((e): e is Extract<MatchEvent, { type: "injury" }> => e.type === "injury")
    .map((e) => injuryEvent({ player: e.player, club: club[e.side], date: meta.date, season: meta.season, round: meta.round, injury: e.injury, match: meta.id, minute: e.minute }));
  return { match, facts, appearances, injuries };
}
