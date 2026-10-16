/**
 * Controlo de jornadas (RZ-110): em que jornada está uma competição, o que falta jogar e o que está em atraso.
 * Puro: recebe o calendário e os ids dos jogos já jogados (um jogo jogado tem o mesmo id do jogo agendado).
 */
import { compare } from "../calendar/dates";
import type { IsoDate, ScheduledMatch } from "../persistence/types";

export type RoundState = {
  round: number;
  /** Data prevista (a do primeiro jogo). */
  date: IsoDate;
  matches: number;
  played: number;
  full: boolean;
  /** Jogos desta jornada com data já passada e ainda por jogar. */
  inDelay: number;
};

export type CompetitionState = {
  competition: string;
  season: number;
  rounds: RoundState[];
  /** A primeira jornada ainda incompleta; `undefined` se a competição terminou. */
  currentRound?: number;
  totalMatches: number;
  playedMatches: number;
  matchesPerPlay: number;
  finished: boolean;
  /** Data do próximo jogo por jogar (pode ser anterior a `hoje` se há atrasos). */
  nextDate?: IsoDate;
  inDelay: ScheduledMatch[];
};

export function competitionState(competition: string, season: number, calendar: readonly ScheduledMatch[], played: ReadonlySet<string>, today: IsoDate): CompetitionState {
  const matches = calendar.filter((j) => j.competition === competition && j.season === season);
  const byRound = new Map<number, ScheduledMatch[]>();
  for (const j of matches) (byRound.get(j.round) ?? byRound.set(j.round, []).get(j.round)!).push(j);
  const rounds: RoundState[] = [...byRound.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([round, js]) => {
      const done = js.filter((j) => played.has(j.id)).length;
      const delay = js.filter((j) => !played.has(j.id) && compare(j.date, today) < 0).length;
      const date = js.reduce((m, j) => (compare(j.date, m) < 0 ? j.date : m), (js[0] as ScheduledMatch).date);
      return { round, date, matches: js.length, played: done, full: done === js.length, inDelay: delay };
    });
  const byPlay = matches.filter((j) => !played.has(j.id));
  const current = rounds.find((j) => !j.full);
  const next = byPlay.reduce<IsoDate | undefined>((m, j) => (m === undefined || compare(j.date, m) < 0 ? j.date : m), undefined);
  return {
    competition,
    season,
    rounds,
    ...(current ? { currentRound: current.round } : {}),
    totalMatches: matches.length,
    playedMatches: matches.length - byPlay.length,
    matchesPerPlay: byPlay.length,
    finished: matches.length > 0 && byPlay.length === 0,
    ...(next ? { nextDate: next } : {}),
    inDelay: byPlay.filter((j) => compare(j.date, today) < 0).sort((a, b) => compare(a.date, b.date) || a.round - b.round || (a.id < b.id ? -1 : 1)),
  };
}

/** Os jogos por jogar com data até `hoje` (inclusive), os atrasados primeiro: o que o loop de dias tem de jogar. */
export function matchesForPlay(calendar: readonly ScheduledMatch[], played: ReadonlySet<string>, today: IsoDate): ScheduledMatch[] {
  return calendar
    .filter((j) => !played.has(j.id) && compare(j.date, today) <= 0)
    .sort((a, b) => compare(a.date, b.date) || a.competition.localeCompare(b.competition) || a.round - b.round || (a.id < b.id ? -1 : 1));
}
