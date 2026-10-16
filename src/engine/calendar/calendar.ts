/**
 * Calendário de uma liga e da época inteira (RZ-102).
 * As datas respeitam: início depois de `primeiraJornada`, pausas (seleções, Natal), fim antes de
 * `ultimaJornadaAte`, jornadas a meio da semana quando faltam fins de semana (p. ex. 38 jornadas da
 * Primeira Liga) e últimas jornadas em simultâneo. Tudo determinístico (seed) e dirigido por parâmetros.
 */
import type { Rng } from "../random/rng";
import type { Tier, Params } from "../config/parameters";
import type { IsoDate, ScheduledBye, ScheduledMatch } from "../persistence/types";
import { compare, createDate, weekDay, nextWeekday, addDays } from "./dates";
import { allAgainstAll } from "./roundRobin";

export type { ScheduledMatch };
export type Round = { number: number; date: IsoDate; matches: ScheduledMatch[]; bye?: string };
export type LeagueCalendar = { competition: string; season: number; tier: Tier; legs: 1 | 2; clubs: string[]; rounds: Round[] };

export type LeagueDefinition = { competition: string; tier: Tier; clubs: string[]; legs?: 1 | 2 };

type Schedule = Params["calendar"];

const slug = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** O ano civil de uma data (mês/dia) da época `epoca`: do mês de início da época a dezembro no ano em que começa, de janeiro ao mês anterior no seguinte. */
const yearOf = (season: number, month: number, c: Schedule) => (month >= c.seasonStartMonth ? c.initialYear + season - 1 : c.initialYear + season);
const seasonDate = (season: number, d: { month: number; day: number }, c: Schedule): IsoDate => createDate(yearOf(season, d.month, c), d.month, d.day);

type Slot = { date: IsoDate; weekend: boolean };

/** Sábados disponíveis na época (sem pausas e com o domingo ainda dentro do limite). */
export function seasonDaWeekEnds(season: number, c: Schedule, tier?: Tier): IsoDate[] {
  const start = nextWeekday(seasonDate(season, c.firstRound, c), 6);
  const end = seasonDate(season, (tier && c.lastRoundPerTier[tier]) || c.lastRoundUntil, c);
  const pauses = c.pauses.map((p) => ({ de: seasonDate(season, p.de, c), until: seasonDate(season, p.until, c) }));
  const inPause = (d: IsoDate) => pauses.some((p) => compare(d, p.de) >= 0 && compare(d, p.until) <= 0);
  const out: IsoDate[] = [];
  for (let s = start; compare(addDays(s, 1), end) <= 0; s = addDays(s, 7)) if (!inPause(s) && !inPause(addDays(s, 1))) out.push(s);
  return out;
}

/** `m` índices entre 0 e `total−1`, igualmente espaçados e crescentes. */
function split(total: number, m: number): number[] {
  if (m <= 0) return [];
  if (m === 1) return [0];
  return Array.from({ length: m }, (_, i) => Math.round((i * (total - 1)) / (m - 1)));
}

/** As `rondas` datas-base de uma liga: fins de semana espaçados e, se faltarem, quartas-feiras antes de um fim de semana. */
export function leagueSlots(pairings: number, season: number, c: Schedule, tier?: Tier): Slot[] {
  const W = seasonDaWeekEnds(season, c, tier);
  if (pairings <= W.length) return split(W.length, pairings).map((i) => ({ date: W[i] as IsoDate, weekend: true }));
  const pauses = c.pauses.map((p) => ({ de: seasonDate(season, p.de, c), until: seasonDate(season, p.until, c) }));
  const free = (d: IsoDate) => !pauses.some((p) => compare(d, p.de) >= 0 && compare(d, p.until) <= 0);
  const candidate = W.map((s, i) => ({ i, wednesday: addDays(s, -3) })).filter(({ i, wednesday }) => i > 0 && i < W.length - 1 && free(wednesday));
  const extra = pairings - W.length;
  if (extra > candidate.length) throw new Error(`Calendário impossível: ${pairings} jornadas, só cabem ${W.length + candidate.length}`);
  const means = split(candidate.length, extra).map((k) => (candidate[k] as { wednesday: IsoDate }).wednesday);
  return [...W.map((date) => ({ date, weekend: true })), ...means.map((date) => ({ date, weekend: false }))].sort((a, b) => compare(a.date, b.date));
}

/** Data de um jogo dentro de uma ranhura, repartindo os jogos pelos dias de jogo do escalão. */
function matchDate(slot: Slot, index: number, days: number[], simultaneous: boolean): IsoDate {
  if (!slot.weekend) return slot.date;
  const offset = (d: number) => (d === 6 ? 0 : d === 0 ? 1 : d === 5 ? -1 : d === 1 ? 2 : d === 4 ? -2 : d === 3 ? -3 : -4);
  const sorted = [...days].sort((a, b) => offset(a) - offset(b));
  const day = simultaneous ? (sorted[sorted.length - 1] as number) : (sorted[index % sorted.length] as number);
  return addDays(slot.date, offset(day));
}

export function generateLeagueCalendar(def: LeagueDefinition, season: number, c: Schedule, rng: Rng): LeagueCalendar {
  const legs = def.legs ?? 2;
  const pairings = allAgainstAll(def.clubs, legs, rng.derive(`rondas/${def.competition}`));
  const slots = leagueSlots(pairings.length, season, c, def.tier);
  const days = c.matchDays[def.tier];
  const rounds: Round[] = pairings.map((r, i) => {
    const number = i + 1;
    const simultaneous = number > pairings.length - c.simultaneousFinalRounds;
    const slot = slots[i] as Slot;
    const matches: ScheduledMatch[] = r.matches.map((j, k) => ({
      id: `e${season}-${slug(def.competition)}-j${number}-${j.home}`,
      competition: def.competition,
      season,
      round: number,
      date: matchDate(slot, k, days, simultaneous),
      home: j.home,
      away: j.away,
    }));
    const dates = matches.map((j) => j.date).sort(compare);
    return { number, date: (dates[0] as IsoDate) ?? slot.date, matches, ...(r.bye !== undefined ? { bye: r.bye } : {}) };
  });
  return { competition: def.competition, season, tier: def.tier, legs, clubs: [...def.clubs], rounds };
}

/** Calendários de várias ligas da mesma época; cada liga tem o seu fluxo aleatório, por isso acrescentar uma não muda as outras. */
export function generateSeasonCalendars(leagues: readonly LeagueDefinition[], season: number, c: Schedule, rng: Rng): LeagueCalendar[] {
  return leagues.map((l) => generateLeagueCalendar(l, season, c, rng.derive(`epoca/${season}`)));
}

/** Verifica um calendário; devolve a lista de problemas (vazia se estiver certo). */
export function validateCalendar(cal: LeagueCalendar): string[] {
  const errors: string[] = [];
  const n = cal.clubs.length;
  const byLeg = n % 2 === 0 ? n - 1 : n;
  if (cal.rounds.length !== byLeg * cal.legs) errors.push(`${cal.rounds.length} jornadas (esperado ${byLeg * cal.legs})`);
  const meetings = new Map<string, number>();
  const clubs = new Set(cal.clubs);
  let previous: IsoDate = "0000-00-00";
  for (const j of cal.rounds) {
    const inRound = new Set<string>();
    for (const g of j.matches) {
      if (!clubs.has(g.home) || !clubs.has(g.away)) errors.push(`jornada ${j.number}: clube desconhecido`);
      for (const c of [g.home, g.away]) {
        if (inRound.has(c)) errors.push(`jornada ${j.number}: ${c} joga duas vezes`);
        inRound.add(c);
      }
      const k = `${g.home}>${g.away}`;
      meetings.set(k, (meetings.get(k) ?? 0) + 1);
    }
    const expected = n - (n % 2);
    if (inRound.size !== expected) errors.push(`jornada ${j.number}: ${inRound.size} clubes a jogar (esperado ${expected})`);
    if (n % 2 === 1 && (j.bye === undefined || inRound.has(j.bye))) errors.push(`jornada ${j.number}: folga inválida`);
    if (n % 2 === 0 && j.bye !== undefined) errors.push(`jornada ${j.number}: não devia haver folga`);
    if (compare(j.date, previous) < 0) errors.push(`jornada ${j.number}: data anterior à da jornada anterior`);
    previous = j.date;
  }
  for (const a of cal.clubs)
    for (const b of cal.clubs)
      if (a !== b) {
        const matches = meetings.get(`${a}>${b}`) ?? 0;
        if (matches !== (cal.legs === 2 ? 1 : 0) + (cal.legs === 1 && a < b ? 1 : 0) && cal.legs === 2 && matches !== 1) errors.push(`${a} x ${b} em casa de ${a}: ${matches} jogos (esperado 1)`);
        if (cal.legs === 1) {
          const total = matches + (meetings.get(`${b}>${a}`) ?? 0);
          if (total !== 1) errors.push(`${a} x ${b}: ${total} jogos (esperado 1)`);
        }
      }
  return errors;
}

export { weekDay };

/** Linhas a guardar no repositório para um calendário de liga. */
export function forRepository(cal: LeagueCalendar): { matches: ScheduledMatch[]; byes: ScheduledBye[] } {
  return {
    matches: cal.rounds.flatMap((j) => j.matches),
    byes: cal.rounds.flatMap((j) => (j.bye !== undefined ? [{ competition: cal.competition, season: cal.season, round: j.number, club: j.bye }] : [])),
  };
}
