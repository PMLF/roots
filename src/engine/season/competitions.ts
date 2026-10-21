/**
 * Taças da época (RZ-140, RZ-141, RZ-142), como na vida real e sobre o motor genérico de competições (`competition/format`).
 *
 *  - **Taça de Portugal**: os clubes das ligas nacionais (Primeira Liga, Segunda Liga, Terceira Liga e CP) entram por vagas
 *    (`cups.cup.wave`); das distritais só entram o vencedor da taça de cada distrito e o campeão de cada liga distrital da
 *    época anterior (podem ser o mesmo clube, ou já ter subido de divisão). A jogo único; joga em casa o de escalão inferior.
 *    A final é no Estádio Nacional e é o último jogo interno da época.
 *  - **Supertaça**: campeão da Primeira Liga contra o vencedor da Taça (ou o finalista vencido, se o campeão ganhou a Taça),
 *    no Estádio Nacional antes de começarem as ligas.
 *  - **Taça Distrital** e **Supertaça Distrital** de cada distrito, com a mesma lógica: clubes das distritais desse distrito,
 *    finais num dos maiores estádios do distrito.
 *
 * As rondas jogam-se em fins de semana de taça (domingo) em que as ligas respetivas param: as datas fixam-se antes de gerar
 * os calendários (`planCups`). Cada taça é uma «corrida» (`RunState`) guardada no save; os jogos de cada ronda marcam-se quando
 * a anterior acaba. Outra competição (grupos, fase de liga…) é só uma `CompetitionDef` nova e um registo em `cupKind`.
 */
import { addDays, compare, createDate, nextWeekday } from "../calendar/dates";
import { seasonWeekends } from "../calendar/calendar";
import { planKnockout } from "../competition/format/knockoutPlan";
import { roundKey, type CompetitionDef, type DrawRules, type Entrant, type Fixture, type Played, type Results, type RunContext, type StageEvent } from "../competition/format/types";
import { startRun, stepRun, type RunState } from "../competition/format/run";
import { post } from "../club/finances";
import type { Params, Tier } from "../config/parameters";
import { Rng } from "../random/rng";
import type { BaseClub, BaseData } from "../data/types";
import type { Repository } from "../persistence/repository";
import type { IsoDate, ScheduledMatch } from "../persistence/types";
import { districtFactors, finalistValue, prizeValue, roundPrize } from "./competitionPrizes";
import { finalPhaseDates } from "./cpFinalPhase";
import { isInSecondDistrict } from "./districts";
import { districtVenue, NATIONAL_STADIUM } from "./venues";
import { computeSlots, europeSlots, saveSlots } from "../europe/access";
import { announceEurope } from "../europe/announce";
import { europeDates, europeDef, europeEntrants, europeKind, isEuropean, EUROPE_NAME, EUROPEAN, type EuropeKind } from "../europe/europe";

export const CUP = "Taça de Portugal";
export const SUPERCUP = "Supertaça";
const DISTRICT_CUP_PREFIX = "Taça Distrital ";
const DISTRICT_SUPERCUP_PREFIX = "Supertaça Distrital ";
export const districtCupName = (district: string) => `${DISTRICT_CUP_PREFIX}${district}`;
export const districtSupercupName = (district: string) => `${DISTRICT_SUPERCUP_PREFIX}${district}`;

export type CupKind = "cup" | "supercup" | "districtCup" | "districtSupercup" | "europe";
export const cupKind = (competition: string): CupKind | undefined =>
  competition === CUP ? "cup" : competition === SUPERCUP ? "supercup" : competition.startsWith(DISTRICT_CUP_PREFIX) ? "districtCup" : competition.startsWith(DISTRICT_SUPERCUP_PREFIX) ? "districtSupercup" : europeKind(competition) ? "europe" : undefined;
/** Taças a eliminar (nacionais e distritais) não têm tabela; a fase de liga europeia tem. */
export const hasNoTable = (competition: string): boolean => { const k = cupKind(competition); return k !== undefined && k !== "europe"; };
const districtOfCup = (competition: string): string => competition.slice((competition.startsWith(DISTRICT_CUP_PREFIX) ? DISTRICT_CUP_PREFIX : DISTRICT_SUPERCUP_PREFIX).length);

/** Número do escalão nos sorteios: 0 = Primeira Liga … 4 = distritais. */
const TIER_NUMBER: Record<Tier, number> = { firstLeague: 0, secondLeague: 1, thirdLeague: 2, cp: 3, district: 4 };

const DRAW: DrawRules = { pairing: "random", advantage: "lowerTier" };

/** A definição de cada tipo de taça: uma só fase a eliminar, a jogo único, com final em campo neutro. */
function cupDef(competition: string, lateWaves?: Entrant[][], params?: Params): CompetitionDef {
  const eu = europeKind(competition);
  if (eu) {
    if (!params) throw new Error(`${competition}: parameters needed`);
    return europeDef(eu, params);
  }
  // Taça de Portugal: meias-finais a duas mãos (com prolongamento e penáltis se o agregado ficar empatado); o resto a uma mão
  return { id: competition, stages: [{ kind: "knockout", name: competition, legs: 1, rules: DRAW, finalNeutral: true, ...(competition === CUP ? { semiLegs: 2 as const } : {}), ...(lateWaves ? { lateWaves } : {}) }] };
}

const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const runKey = (season: number, competition: string) => `cup.${season}.${competition}`;
const listKey = (season: number) => `cups.${season}`;
const planKey = (season: number) => `cupPlan.${season}`;
const blockedKey = (season: number) => `cupBlocked.${season}`;
const supercupKey = (season: number) => `supercup.${season}`;
const districtSupercupKey = (season: number) => `districtSupercup.${season}`;
const qualifiersKey = (season: number) => `cupQualifiers.${season}`;

/** As taças desta época, pela ordem em que foram criadas. */
export function activeCompetitions(repo: Repository, season: number): string[] {
  const raw = repo.meta(listKey(season));
  return raw ? (JSON.parse(raw) as string[]) : [];
}

export function readRun(repo: Repository, season: number, competition: string): RunState | undefined {
  const raw = repo.meta(runKey(season, competition));
  return raw ? (JSON.parse(raw) as RunState) : undefined;
}
const saveRun = (repo: Repository, run: RunState) => repo.setMeta(runKey(run.season, run.id), JSON.stringify(run));

/** Vencedor e finalista de uma taça da época, se já acabou. */
function cupResult(repo: Repository, season: number, competition: string): { winner?: string; runnerUp?: string; done: boolean } {
  const run = readRun(repo, season, competition);
  if (!run) return { done: false };
  return { done: run.done, ...(run.winner ? { winner: run.winner } : {}), ...(run.runnerUp ? { runnerUp: run.runnerUp } : {}) };
}

/** Os dois clubes da Supertaça de uma época, fixados no fecho da anterior. */
function supercupEntrants(repo: Repository, season: number): [string, string] | undefined {
  const raw = repo.meta(supercupKey(season));
  return raw ? (JSON.parse(raw) as [string, string]) : undefined;
}

/** Campeão contra vencedor da taça; se forem o mesmo clube, contra o finalista vencido. */
function supercupPair(champion: string | undefined, cup: { winner?: string; runnerUp?: string; done: boolean }): [string, string] | undefined {
  if (!champion || !cup.done || !cup.winner) return undefined;
  const other = cup.winner === champion ? cup.runnerUp : cup.winner;
  return other && other !== champion ? [champion, other] : undefined;
}

/**
 * Prepara a época seguinte a partir da que fecha (chamado no fecho de `season`): a Supertaça (campeão da Primeira Liga contra
 * o vencedor da Taça), as Supertaças Distritais (campeão de cada distrito contra o vencedor da taça do distrito) e quem entra
 * na Taça de Portugal vindo das distritais (o vencedor de cada taça distrital e o campeão de cada liga distrital).
 */
export function planNextSeasonCups(repo: Repository, season: number, firstLeagueChampion: string | undefined, districtChampions: Readonly<Record<string, string>>): void {
  const pair = supercupPair(firstLeagueChampion, cupResult(repo, season, CUP));
  if (pair) repo.setMeta(supercupKey(season + 1), JSON.stringify(pair));
  const supers: Record<string, [string, string]> = {};
  const qualifiers = new Set<string>(Object.values(districtChampions));
  for (const competition of activeCompetitions(repo, season)) {
    if (cupKind(competition) !== "districtCup") continue;
    const district = districtOfCup(competition);
    const result = cupResult(repo, season, competition);
    if (result.winner) qualifiers.add(result.winner);
    const p = supercupPair(districtChampions[district], result);
    if (p) supers[district] = p;
  }
  repo.setMeta(districtSupercupKey(season + 1), JSON.stringify(supers));
  repo.setMeta(qualifiersKey(season + 1), JSON.stringify([...qualifiers].sort()));
}

// ---------- datas ----------

type Cal = Params["calendar"];
const calendarDate = (season: number, d: { month: number; day: number }, c: Cal): IsoDate => createDate(d.month >= c.seasonStartMonth ? c.initialYear + season - 1 : c.initialYear + season, d.month, d.day);
const monthDay = (d: IsoDate) => ({ month: Number(d.slice(5, 7)), day: Number(d.slice(8, 10)) });
const later = (a: IsoDate, b: IsoDate) => (compare(a, b) >= 0 ? a : b);

/** Datas da Fase de Promoção: sábados a partir do fim das distritais, saltando os fins de semana de taça. */
export function promotionDates(rounds: number, season: number, params: Params, blocked: ReadonlySet<IsoDate>): IsoDate[] {
  const c = params.calendar;
  const districtsEnd = calendarDate(season, c.lastRoundPerTier.district ?? c.lastRoundUntil, c);
  const out: IsoDate[] = [];
  for (let d = nextWeekday(addDays(districtsEnd, 8), 6); out.length < rounds; d = addDays(d, 7)) if (!blocked.has(addDays(d, 1))) out.push(d);
  return out;
}

/** Domingos de taça (rondas nacionais antes da final e final distrital) em que a Fase de Promoção e a fase final do CP não jogam. */
export function blockedSundays(repo: Repository, season: number): Set<IsoDate> {
  const raw = repo.meta(blockedKey(season));
  return new Set(raw ? (JSON.parse(raw) as IsoDate[]) : []);
}

/** Quando acaba tudo o resto: ligas, Fase de Promoção e fase final do CP (que se marcam à medida que a época avança). */
export function leaguesEnd(season: number, params: Params, blocked: ReadonlySet<IsoDate>): IsoDate {
  const c = params.calendar;
  const promo = params.pyramid.promotion;
  const n = promo.championsPerGroup;
  const rounds = (n % 2 === 1 ? n : n - 1) * promo.legs;
  const promotionEnd = promotionDates(rounds, season, params, blocked).at(-1) as IsoDate;
  const cpEnd = finalPhaseDates(calendarDate(season, c.lastRoundPerTier.cp ?? c.lastRoundUntil, c), params, blocked).final;
  return [calendarDate(season, c.lastRoundUntil, c), promotionEnd, cpEnd].reduce(later);
}

/** `m` índices entre 0 e `total−1`, igualmente espaçados e crescentes. */
const spaced = (total: number, m: number): number[] => (m <= 0 ? [] : m === 1 ? [0] : Array.from({ length: m }, (_, i) => Math.round((i * (total - 1)) / (m - 1))));

// ---------- entradas ----------

const rankedEntrants = (clubs: readonly BaseClub[]): Entrant[] =>
  [...clubs].sort((a, b) => b.reputation - a.reputation || (a.id < b.id ? -1 : 1)).map((c, i) => ({ club: c.id, seed: i + 1, tier: TIER_NUMBER[c.tier] }));

/** Quem passa das distritais à Taça de Portugal: a lista fixada no fecho da época anterior ou, na primeira época, os de maior reputação de cada distrito. */
function districtQualifiers(repo: Repository, data: BaseData, params: Params, season: number): Set<string> {
  const raw = repo.meta(qualifiersKey(season));
  if (raw) return new Set(JSON.parse(raw) as string[]);
  const byDistrict = new Map<string, BaseClub[]>();
  for (const c of data.clubs) if (c.tier === "district" && !isInSecondDistrict(c.league)) byDistrict.set(c.district, [...(byDistrict.get(c.district) ?? []), c]);
  return new Set([...byDistrict.values()].flatMap((cs) => rankedEntrants(cs).slice(0, params.cups.cup.qualifiersPerDistrictWithoutHistory).map((e) => e.club)));
}

/** Entradas da Taça de Portugal, por vaga (as vagas vazias saem). */
function nationalEntrants(repo: Repository, data: BaseData, params: Params, season: number): Entrant[][] {
  const qualifiers = districtQualifiers(repo, data, params, season);
  const clubs = data.clubs.filter((c) => !isInSecondDistrict(c.league) && (c.tier !== "district" || qualifiers.has(c.id)));
  const all = rankedEntrants(clubs);
  const tierOf = new Map(clubs.map((c) => [c.id, c.tier] as const));
  return [0, 1, 2].map((w) => all.filter((e) => params.cups.cup.wave[tierOf.get(e.club) as Tier] === w)).filter((w) => w.length > 0);
}

const districtMembers = (data: BaseData): Map<string, BaseClub[]> => {
  const out = new Map<string, BaseClub[]>();
  for (const c of data.clubs) if (c.tier === "district" && !isInSecondDistrict(c.league)) out.set(c.district, [...(out.get(c.district) ?? []), c]);
  return new Map([...out].sort(([a], [b]) => (a < b ? -1 : 1)));
};

// ---------- plano de datas ----------

export type CupPlan = {
  /** Domingos das rondas nacionais, a última é a final. */
  national: IsoDate[];
  /** Domingos das rondas de cada taça distrital, a última é a final. */
  district: Record<string, IsoDate[]>;
  supercup: IsoDate;
  districtSupercup: IsoDate;
};

function readCupPlan(repo: Repository, season: number): CupPlan | undefined {
  const raw = repo.meta(planKey(season));
  return raw ? (JSON.parse(raw) as CupPlan) : undefined;
}

/**
 * Fixa as datas das taças da época (uma só vez), antes de gerar os calendários das ligas: as ligas param nos fins de semana de
 * taça. Rondas nacionais: fins de semana de todos os escalões; rondas distritais: fins de semana só das distritais.
 */
export function planCups(repo: Repository, data: BaseData, params: Params, season: number): CupPlan {
  const existing = readCupPlan(repo, season);
  if (existing) return existing;
  const c = params.calendar;
  const cfg = params.cups;
  const saturdays = seasonWeekends(season, c);
  const between = (from: IsoDate, to: IsoDate, taken: ReadonlySet<IsoDate> = new Set()) => saturdays.filter((d) => compare(d, from) >= 0 && compare(d, to) <= 0 && !taken.has(d));
  const sundayOf = (saturday: IsoDate) => addDays(saturday, 1);

  const natRounds = planKnockout(nationalEntrants(repo, data, params, season).map((w) => w.length)).length;
  const natPool = between(calendarDate(season, cfg.cup.firstRound, c), calendarDate(season, cfg.cup.lastRound, c));
  // uma data a mais para a segunda mão das meias-finais (há meias-finais se houver pelo menos 3 rondas)
  const natSlots = natRounds - 1 + (natRounds >= 3 ? 1 : 0);
  if (natPool.length < natSlots) throw new Error(`Cup: only ${natPool.length} free weekends for ${natSlots} rounds`);
  const natSaturdays = spaced(natPool.length, natSlots).map((i) => natPool[i] as IsoDate);
  const natSundays = natSaturdays.map(sundayOf);
  const districtsEnd = calendarDate(season, c.lastRoundPerTier.district ?? c.lastRoundUntil, c);
  let districtFinal = nextWeekday(addDays(districtsEnd, cfg.districtCup.finalDaysAfterDistrictsEnd), 0);
  while (natSundays.includes(districtFinal)) districtFinal = addDays(districtFinal, 7);
  // domingos em que nada mais se joga: as rondas nacionais e a final distrital (a Fase de Promoção e a fase final do CP desviam-se)
  const blocked = new Set([...natSundays, districtFinal]);
  const final = nextWeekday(addDays(leaguesEnd(season, params, blocked), cfg.cup.finalDaysAfterLeagues), 0);
  const members = districtMembers(data);
  const rounds = new Map([...members].filter(([, m]) => m.length >= 2).map(([d, m]) => [d, planKnockout([m.length]).length] as const));
  const most = Math.max(1, ...rounds.values());
  const distPool = between(calendarDate(season, cfg.districtCup.firstRound, c), addDays(districtsEnd, -7), new Set(natSaturdays));
  if (distPool.length < most - 1) throw new Error(`District cup: only ${distPool.length} free weekends for ${most - 1} rounds`);
  const shared = spaced(distPool.length, most - 1).map((i) => sundayOf(distPool[i] as IsoDate));
  const district: Record<string, IsoDate[]> = {};
  for (const [d, r] of rounds) district[d] = [...shared.slice(shared.length - (r - 1)), districtFinal];

  const first = saturdays[0] as IsoDate;
  const plan: CupPlan = { national: [...natSundays, final], district, supercup: addDays(first, -cfg.supercupDaysBeforeFirstRound), districtSupercup: addDays(first, -cfg.supercupDaysBeforeFirstRound - 7) };
  repo.setMeta(planKey(season), JSON.stringify(plan));
  repo.setMeta(blockedKey(season), JSON.stringify([...blocked].sort()));
  return plan;
}

/** Pausas que as taças impõem às ligas de cada escalão (para os calendários): fins de semana de taça. */
export function cupPauses(plan: CupPlan, tier: Tier): Cal["pauses"] {
  const sundays = [...plan.national.slice(0, -1), ...(tier === "district" ? [...new Set(Object.values(plan.district).flatMap((d) => d.slice(0, -1)))] : [])];
  return sundays.map((s) => ({ reason: "cup weekend", from: monthDay(addDays(s, -1)), until: monthDay(s) }));
}

// ---------- criação ----------

const toScheduled = (competition: string, season: number, f: Fixture): ScheduledMatch => ({
  id: f.id, competition, season, round: f.round, date: f.date, home: f.home, away: f.away,
  ...(f.knockout ? { knockout: true } : {}), ...(f.neutral ? { neutral: true } : {}), ...(f.venue ? { venue: f.venue } : {}), ...(f.firstLeg ? { firstLeg: f.firstLeg } : {}),
});

function contextOf(repo: Repository, data: BaseData, params: Params, season: number, competition: string, allocateDates: RunContext["allocateDates"]): RunContext {
  const seed = `${repo.meta("seed") ?? "?"}|${competition}|${season}`;
  const kind = cupKind(competition);
  const neutralVenue = kind === "districtCup" || kind === "districtSupercup" ? (a: string, b: string) => districtVenue(data, districtOfCup(competition), a, b, new Rng(seed, "venue")) : kind === "europe" ? () => undefined : () => NATIONAL_STADIUM;
  return { seed, competition, season, params, idPrefix: `e${season}-${slug(competition)}`, allocateDates, neutralVenue };
}
const noDates: RunContext["allocateDates"] = () => {
  throw new Error("The cup dates are already fixed");
};

/** Datas pedidas por uma competição: as europeias saem do calendário dos parâmetros (uma lista por fase); as taças já têm as suas fixas. */
function competitionDates(params: Params, season: number, competition: string, fallback: RunContext["allocateDates"]): RunContext["allocateDates"] {
  const eu = europeKind(competition);
  if (!eu) return fallback;
  const dates = europeDates(params, season, eu);
  return (stage, count) => {
    const pool = stage === 0 ? dates.leaguePhase : dates.knockout;
    // a última data do 2.º bloco é a final; as jornadas da fase de liga que sobrarem não se usam
    if (stage === 0) return pool.slice(0, count);
    if (pool.length !== count) throw new Error(`${competition}: ${count} dates needed, ${pool.length} planned`);
    return pool;
  };
}

function begin(repo: Repository, data: BaseData, params: Params, season: number, competition: string, entrants: Entrant[], lateWaves: Entrant[][], dates: IsoDate[]): void {
  const def = cupDef(competition, lateWaves, params);
  const ctx = contextOf(repo, data, params, season, competition, competitionDates(params, season, competition, (_stage, count) => {
    if (dates.length !== count) throw new Error(`${competition}: ${count} dates needed, ${dates.length} planned`);
    return dates;
  }));
  const step = startRun(def, entrants, ctx);
  saveRun(repo, step.state);
  if (step.fixtures.length > 0) repo.saveCalendar(step.fixtures.map((f) => toScheduled(competition, season, f)), []);
  announce(repo, data, params, season, cupKind(competition) as CupKind, competition, step.state, step.events);
  if (isEuropean(competition)) announceEuropeDraw(repo, data, season, competition, entrants, step.fixtures);
  repo.setMeta(listKey(season), JSON.stringify([...activeCompetitions(repo, season), competition]));
}

/** Qualificação e sorteio da fase de liga: uma notícia por clube português (RZ-250). */
function announceEuropeDraw(repo: Repository, data: BaseData, season: number, competition: string, entrants: readonly Entrant[], fixtures: readonly Fixture[]): void {
  const today = (repo.meta("date.today") as IsoDate | undefined) ?? fixtures[0]?.date;
  if (!today) return;
  const mine = new Map(data.clubs.map((c) => [c.id, c] as const));
  for (const { club } of entrants) {
    const cb = mine.get(club);
    if (!cb) continue;
    const entities = [{ k: "club" as const, id: club, roleKind: "qualified" }, { k: "competition" as const, id: competition }];
    repo.appendEvent({ type: "EUROPE_QUALIFIED", date: today, season, visibility: "exposed", origin: "match", entities, data: { competition } });
    const opponents = fixtures.filter((f) => f.home === club || f.away === club).sort((a, b) => a.round - b.round).map((f) => (f.home === club ? f.away : f.home));
    if (opponents.length > 0) repo.appendEvent({ type: "EUROPE_DRAW", date: today, season, visibility: "exposed", origin: "match", entities, data: { competition, opponents } });
  }
}

/** Cria as taças da época, uma só vez: depende dos calendários das ligas, por isso corre depois deles. Idempotente. */
export function ensureCompetitions(repo: Repository, data: BaseData, params: Params, season: number): void {
  if (repo.meta(listKey(season)) !== undefined) return;
  const plan = planCups(repo, data, params, season);
  const known = (id: string) => data.clubs.some((c) => c.id === id && !isInSecondDistrict(c.league));
  const seeded = (pair: [string, string]): Entrant[] => pair.map((id, i) => ({ club: id, seed: i + 1, tier: TIER_NUMBER[data.clubs.find((c) => c.id === id)!.tier] }));
  repo.transaction(() => {
    repo.setMeta(listKey(season), "[]");
    const pair = supercupEntrants(repo, season);
    if (pair && pair.every(known)) begin(repo, data, params, season, SUPERCUP, seeded(pair), [], [plan.supercup]);
    const supers = JSON.parse(repo.meta(districtSupercupKey(season)) ?? "{}") as Record<string, [string, string]>;
    for (const [district, p] of Object.entries(supers).sort(([a], [b]) => (a < b ? -1 : 1))) if (p.every(known)) begin(repo, data, params, season, districtSupercupName(district), seeded(p), [], [plan.districtSupercup]);
    const [first = [], ...late] = nationalEntrants(repo, data, params, season);
    begin(repo, data, params, season, CUP, first, late, plan.national);
    // competições europeias: só com clubes estrangeiros suficientes (saves antigos não têm)
    const previous = previousPremierTable(repo, data, season);
    // vagas da liga da época anterior (as do ranking de então) e quem ganhou a Taça e as provas europeias
    const slots = season > 1 ? europeSlots(repo, data, params, season - 1) : computeSlots(repo, data, params, season);
    const winnerOf = (competition: string) => (season > 1 ? cupResult(repo, season - 1, competition).winner : undefined);
    const europe = europeEntrants(repo, data, params, season, { cup: winnerOf(CUP), champions: winnerOf(EUROPE_NAME.championsLeague), europa: winnerOf(EUROPE_NAME.europaLeague), conference: winnerOf(EUROPE_NAME.conferenceLeague) }, previous, slots);
    saveSlots(repo, data, params, season);
    if (europe) for (const kind of EUROPEAN) begin(repo, data, params, season, EUROPE_NAME[kind], europe[kind], [], []);
    for (const [district, members] of districtMembers(data)) {
      const dates = plan.district[district];
      if (dates) begin(repo, data, params, season, districtCupName(district), rankedEntrants(members), [], dates);
    }
  });
}

/** Classificação final da Primeira Liga da época anterior (ids dos clubes), se existe. */
function previousPremierTable(repo: Repository, data: BaseData, season: number): string[] | undefined {
  if (season <= 1) return undefined;
  const league = data.clubs.find((c) => c.tier === "firstLeague")?.league;
  if (!league) return undefined;
  const rows = [...repo.standings(league, season - 1)].sort((a, b) => b.points - a.points || (b.scoredGoals - b.concededGoals) - (a.scoredGoals - a.concededGoals) || b.scoredGoals - a.scoredGoals);
  return rows.length > 0 ? rows.map((r) => r.club) : undefined;
}

// ---------- avanço ----------

const resultsOf = (repo: Repository): Results => (id): Played | undefined => {
  const m = repo.match(id);
  if (!m) return undefined;
  return { home: m.home, away: m.away, homeGoals: m.homeGoals, awayGoals: m.awayGoals, ...(m.homePenalties !== undefined && m.awayPenalties !== undefined ? { homePenalties: m.homePenalties, awayPenalties: m.awayPenalties } : {}) };
};

/**
 * Resolve as rondas que ficaram decididas e marca as seguintes. Devolve `true` se marcou jogos novos (o chamador volta a
 * ver o que falta jogar).
 */
export function advanceCompetitions(repo: Repository, data: BaseData, params: Params, season: number): boolean {
  let generated = false;
  const results = resultsOf(repo);
  for (const competition of activeCompetitions(repo, season)) {
    const run = readRun(repo, season, competition);
    const kind = cupKind(competition);
    if (!run || run.done || !kind) continue;
    const ctx = contextOf(repo, data, params, season, competition, competitionDates(params, season, competition, noDates));
    const before = JSON.stringify(run);
    const step = stepRun(cupDef(competition, undefined, params), run, results, ctx);
    if (step.events.length === 0 && step.fixtures.length === 0 && JSON.stringify(step.state) === before) continue;
    repo.transaction(() => {
      saveRun(repo, step.state);
      if (step.fixtures.length > 0) repo.saveCalendar(step.fixtures.map((f) => toScheduled(competition, season, f)), []);
      announce(repo, data, params, season, kind, competition, step.state, step.events);
    });
    if (step.fixtures.length > 0) generated = true;
  }
  return generated;
}

// ---------- prémios, histórico e notícias ----------

/** Prémios por ronda e na final, campeão e surpresas. Corre dentro da transação de quem chama. */
function announce(repo: Repository, data: BaseData, params: Params, season: number, kind: CupKind, competition: string, run: RunState, events: readonly StageEvent[]): void {
  const today = (repo.meta("date.today") as IsoDate | undefined) ?? createDate(params.calendar.initialYear + season - 1, params.calendar.seasonStartMonth, 1);
  if (kind === "europe") { announceEurope(repo, data, params, season, europeKind(competition) as EuropeKind, events, today); return; }
  const byId = new Map(data.clubs.map((c) => [c.id, c] as const));
  const district = kind === "districtCup" || kind === "districtSupercup" ? districtOfCup(competition) : undefined;
  const factor = district ? districtFactors(data.cities, params).get(district) ?? 1 : 1;
  const prize = (club: string, type: string, value: number, extra: Record<string, unknown> = {}) => {
    const cb = byId.get(club);
    if (!cb || value <= 0) return;
    post(repo, cb, "prizes", value);
    const city = cb.city;
    repo.appendEvent({ type: "COMPETITION_PRIZE", date: today, season, visibility: "exposed", origin: "match", entities: [{ k: "club", id: club, roleKind: "awarded" }, { k: "competition", id: competition }, ...(city ? [{ k: "city" as const, id: city, roleKind: "host" }] : [])], data: { competition, type, value, ...(district ? { districtFactor: factor } : {}), ...extra } });
  };
  const finalType: "portugalCup" | "superCup" | "districtCup" | "districtSupercup" = kind === "cup" ? "portugalCup" : kind === "supercup" ? "superCup" : kind === "districtCup" ? "districtCup" : "districtSupercup";
  for (const e of events) {
    if (e.type !== "roundPlayed") continue;
    const key = roundKey(e.label);
    for (const t of e.ties) {
      const winner = byId.get(t.winner);
      const loser = byId.get(t.loser);
      if (e.label.fromEnd === 0) {
        const value = prizeValue(finalType === "districtSupercup" ? "districtSuperCup" : finalType, params, factor);
        prize(t.winner, finalType, value, { position: 1, round: key });
        prize(t.loser, finalType, finalistValue(value, params), { position: 2, round: key });
        // as taças distritais ficam no histórico (prémio) sem notícia para o mundo: são dezenas por época
        if (kind === "cup" || kind === "supercup") repo.appendEvent({ type: "CHAMPION", date: today, season, visibility: "exposed", origin: "match", entities: [{ k: "club", id: t.winner, roleKind: "champion" }, { k: "competition", id: competition }], data: { league: competition, cup: true, runnerUp: t.loser } });
      } else if (kind === "cup") {
        prize(t.winner, "portugalCupRound", roundPrize(Math.max(0, e.label.fromEnd - 1), params), { round: key });
      }
      // um clube de escalão inferior elimina um profissional: surpresa
      const wt = run.entrants[t.winner]?.tier ?? (winner ? TIER_NUMBER[winner.tier] : 0);
      const lt = run.entrants[t.loser]?.tier ?? (loser ? TIER_NUMBER[loser.tier] : 0);
      if (kind === "cup" && wt > lt && lt <= TIER_NUMBER.thirdLeague) {
        repo.appendEvent({ type: "CUP_UPSET", date: today, season, visibility: "exposed", origin: "match", entities: [{ k: "club", id: t.winner, roleKind: "winner" }, { k: "club", id: t.loser, roleKind: "beaten" }, { k: "competition", id: competition }], data: { competition, round: key, winnerTier: wt, loserTier: lt, penalties: t.penalties, ...(t.aggregate ? { winnerGoals: t.aggregate.winner, beatenGoals: t.aggregate.loser } : {}) } });
      }
    }
  }
}

/** Jogos marcados e por jogar das taças da época. */
export function pendingCupMatches(repo: Repository, season: number): ScheduledMatch[] {
  const out: ScheduledMatch[] = [];
  for (const competition of activeCompetitions(repo, season)) {
    const played = new Set(repo.competitionMatches(competition, season).map((j) => j.id));
    for (const j of repo.calendar(competition, season).matches) if (!played.has(j.id)) out.push(j);
  }
  return out;
}
