/**
 * Níveis de detalhe (RZ-109; docs/MOTOR_JOGO.md §10).
 *
 * Há um só motor de jogo: custa ≈ 0,4 ms por jogo, por isso uma época inteira de todo o mundo (≈ 4 500 jogos)
 * demora uns segundos e não compensa manter um segundo simulador «estatístico» que divergisse do primeiro. O nível
 * decide o que se **devolve e guarda**:
 *
 * - **0 — detalhe total:** jogos do clube do gamer. Todos os eventos (para o jogo ao vivo e o comentário), relatório
 *   completo com estatísticas e nota de cada jogador, todos os momentos-chave.
 * - **1 — resumido:** todos os outros jogos. Mesmo motor e mesmos resultados, mas só se guarda o que é público e conta
 *   histórias: golos com marcador e assistente, cartões, lesões, substituições, estatísticas das equipas e a nota do
 *   homem do jogo. As histórias (hat-tricks, vermelhos, goleadas, reviravoltas, golos nos descontos) saem com o mesmo
 *   critério nos dois níveis.
 *
 * Ligas estrangeiras e agregados («só números», lod 2-3 de `MODELO_DADOS`) chegam com RZ-403, com o seu próprio modelo.
 */
import type { Params } from "../config/parametros";
import type { NewEvent } from "../persistencia/tipos";
import { matchReport, type MatchCard, type MatchGoal, type MatchInjury, type MomentKey, type MatchReport } from "./estatisticas";
import { matchStories } from "./historias";
import { matchRecord, type MatchMeta } from "./registo";
import { simulateMatch } from "./simulador";
import type { MatchInput, MatchEvent, MatchSummary } from "./tipos";

export type DetailLevel = 0 | 1;

/** Nível de um jogo: 0 se envolve o clube do gamer, 1 nos restantes. */
export function matchLevel(home: string, away: string, gamerClub?: string): DetailLevel {
  return gamerClub !== undefined && (home === gamerClub || away === gamerClub) ? 0 : 1;
}

/** O que se sabe publicamente de um jogo de nível 1. */
export type PublicReport = Pick<MatchReport, "duration" | "homeGoals" | "awayGoals" | "halfTime" | "homePossession" | "home" | "away" | "goals" | "cards" | "injuries"> & {
  /** Só golos, expulsões e lesões. */
  moments: MomentKey[];
  matchMan: { id: string; rating: number };
};

type Common = {
  summary: MatchSummary;
  record: ReturnType<typeof matchRecord>;
  /** Eventos de notícia (hat-trick, vermelho, goleada, golo notável), para acrescentar a seguir ao `registarJogo`. */
  stories: NewEvent[];
};
export type ResolvedMatch =
  | (Common & { level: 0; events: MatchEvent[]; report: MatchReport })
  | (Common & { level: 1; report: PublicReport });

const PUBLIC_MOMENTS = new Set<MomentKey["type"]>(["goal", "expulsao", "injury"]);

function exposed(r: MatchReport): PublicReport {
  const best = r.players.find((j) => j.id === r.matchMan);
  return {
    duration: r.duration,
    homeGoals: r.homeGoals,
    awayGoals: r.awayGoals,
    halfTime: r.halfTime,
    homePossession: r.homePossession,
    home: r.home,
    away: r.away,
    goals: r.goals as MatchGoal[],
    cards: r.cards as MatchCard[],
    injuries: r.injuries as MatchInjury[],
    moments: r.moments.filter((m) => PUBLIC_MOMENTS.has(m.type)),
    matchMan: { id: r.matchMan, rating: best?.rating ?? 0 },
  };
}

/** Joga um jogo ao nível de detalhe indicado e devolve o que esse nível guarda. */
export function playMatch(input: MatchInput, level: DetailLevel, meta: MatchMeta, params: Params): ResolvedMatch {
  const { events, summary } = simulateMatch(input, params);
  return resolveMatch(input, events, summary, level, meta, params);
}

/** O que se guarda de um jogo já simulado (por inteiro, de uma vez ou aos poucos, com mudanças a meio). */
export function resolveMatch(input: MatchInput, events: MatchEvent[], summary: MatchSummary, level: DetailLevel, meta: MatchMeta, params: Params): ResolvedMatch {
  const full = matchReport(input, { home: input.home, away: input.away }, events, summary, params);
  const record = matchRecord(meta, input.home, input.away, events, summary, full);
  const stories = matchStories(meta, { home: input.home.club, away: input.away.club }, full, params);
  if (level === 0) return { level, summary, events, report: full, record, stories };
  // nível 1: só se guarda a nota do homem do jogo; as lesões de jogadores que entraram e saíram aparecem na mesma
  const report = exposed(full);
  const appearances = record.appearances.map((p) => (p.player === report.matchMan.id ? p : { player: p.player, club: p.club, starter: p.starter, minutes: p.minutes }));
  return { level, summary, report: report, record: { ...record, appearances }, stories };
}
