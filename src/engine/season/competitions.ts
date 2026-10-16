/**
 * Taças da época (RZ-140, RZ-141, RZ-142): liga o motor genérico de competições (`competition/format`) ao jogo.
 *
 *  - **Taça de Portugal**: todos os clubes da pirâmide, a jogo único; os escalões altos entram mais tarde (`cups.cup.wave`);
 *    o clube de escalão inferior joga em casa; a final, em campo neutro, é o último jogo interno da época.
 *  - **Supertaça**: campeão da Primeira Liga contra o vencedor da Taça (ou o finalista vencido, se for o mesmo clube); joga-se
 *    antes de começarem as ligas, em campo neutro. Os dois clubes ficam decididos no fecho da época anterior.
 *  - **Taças Distritais**: uma por distrito, só com os clubes das distritais desse distrito.
 *
 * Cada competição é uma «corrida» (`RunState`) guardada no save; os jogos de cada ronda marcam-se quando a anterior acaba.
 * Para criar outra competição (fase de grupos, fase de liga…) basta uma `CompetitionDef` nova e um registo em `kindOf`.
 */
import { addDays, compare, createDate, nextWeekday, weekDay } from "../calendar/dates";
import { roundKey, type CompetitionDef, type DrawRules, type Entrant, type Fixture, type Played, type Results, type RunContext, type StageEvent } from "../competition/format/types";
import { startRun, stepRun, type RunState } from "../competition/format/run";
import { post } from "../club/finances";
import type { Params, Tier } from "../config/parameters";
import type { BaseClub, BaseData } from "../data/types";
import type { Repository } from "../persistence/repository";
import type { IsoDate, ScheduledMatch } from "../persistence/types";
import { districtFactors, finalistValue, prizeValue, roundPrize } from "./competitionPrizes";
import { finalPhaseDates } from "./cpFinalPhase";
import { isInSecondDistrict } from "./districts";

export const CUP = "Taça de Portugal";
export const SUPERCUP = "Supertaça";
export const DISTRICT_CUP_PREFIX = "Taça Distrital ";
export const districtCupName = (district: string) => `${DISTRICT_CUP_PREFIX}${district}`;

export type CupKind = "cup" | "supercup" | "districtCup";
export const cupKind = (competition: string): CupKind | undefined => (competition === CUP ? "cup" : competition === SUPERCUP ? "supercup" : competition.startsWith(DISTRICT_CUP_PREFIX) ? "districtCup" : undefined);
/** É uma competição a eliminar gerida aqui (sem tabela). */
export const isCup = (competition: string): boolean => cupKind(competition) !== undefined;

/** Número do escalão nos sorteios: 0 = Primeira Liga … 4 = distritais. */
export const TIER_NUMBER: Record<Tier, number> = { firstLeague: 0, secondLeague: 1, thirdLeague: 2, cp: 3, district: 4 };

const DRAW: DrawRules = { pairing: "random", advantage: "lowerTier" };

/** A definição de cada tipo de taça: uma só fase a eliminar, a jogo único. */
export function cupDef(kind: CupKind, competition: string, lateWaves?: Entrant[][]): CompetitionDef {
  return { id: competition, stages: [{ kind: "knockout", name: competition, legs: 1, rules: DRAW, finalNeutral: kind !== "districtCup", ...(lateWaves ? { lateWaves } : {}) }] };
}

const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const runKey = (season: number, competition: string) => `cup.${season}.${competition}`;
const listKey = (season: number) => `cups.${season}`;
const supercupKey = (season: number) => `supercup.${season}`;

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
export function cupResult(repo: Repository, season: number, competition: string): { winner?: string; runnerUp?: string; done: boolean } {
  const run = readRun(repo, season, competition);
  if (!run) return { done: false };
  return { done: run.done, ...(run.winner ? { winner: run.winner } : {}), ...(run.runnerUp ? { runnerUp: run.runnerUp } : {}) };
}

/** Os dois clubes da Supertaça de uma época, fixados no fecho da anterior. */
export function supercupEntrants(repo: Repository, season: number): [string, string] | undefined {
  const raw = repo.meta(supercupKey(season));
  return raw ? (JSON.parse(raw) as [string, string]) : undefined;
}

/**
 * Fixa a Supertaça da época seguinte (chamado no fecho da época `season`): o campeão da Primeira Liga contra o vencedor da
 * Taça — ou o finalista vencido, se o campeão ganhou a Taça. Sem Taça acabada ou sem campeão, não há Supertaça.
 */
export function planSupercup(repo: Repository, season: number, firstLeagueChampion: string | undefined): [string, string] | undefined {
  const cup = cupResult(repo, season, CUP);
  if (!firstLeagueChampion || !cup.done || !cup.winner) return undefined;
  const other = cup.winner === firstLeagueChampion ? cup.runnerUp : cup.winner;
  if (!other || other === firstLeagueChampion) return undefined;
  const pair: [string, string] = [firstLeagueChampion, other];
  repo.setMeta(supercupKey(season + 1), JSON.stringify(pair));
  return pair;
}

// ---------- datas ----------

type Cal = Params["calendar"];
const calendarDate = (season: number, d: { month: number; day: number }, c: Cal): IsoDate => createDate(d.month >= c.seasonStartMonth ? c.initialYear + season - 1 : c.initialYear + season, d.month, d.day);

/** Quando acabam as ligas, incluindo a Fase de Promoção e a fase final do CP (que se marcam à medida que a época avança). */
export function leaguesEnd(season: number, params: Params): IsoDate {
  const c = params.calendar;
  const dEnd = calendarDate(season, c.lastRoundPerTier.district ?? c.lastRoundUntil, c);
  const promo = params.pyramid.promotion;
  const n = promo.championsPerGroup;
  const rounds = (n % 2 === 1 ? n : n - 1) * promo.legs;
  const promotionEnd = addDays(nextWeekday(addDays(dEnd, 8), 6), 7 * (rounds - 1));
  const cpEnd = finalPhaseDates(calendarDate(season, c.lastRoundPerTier.cp ?? c.lastRoundUntil, c), params).final;
  return [calendarDate(season, c.lastRoundUntil, c), promotionEnd, cpEnd].reduce((a, b) => (compare(a, b) >= 0 ? a : b));
}

/** `m` índices entre 0 e `total−1`, igualmente espaçados e crescentes. */
const spaced = (total: number, m: number): number[] => (m <= 0 ? [] : m === 1 ? [0] : Array.from({ length: m }, (_, i) => Math.round((i * (total - 1)) / (m - 1))));

/**
 * `count` datas para as rondas: as primeiras espalhadas entre `from` e a semana antes de `final`, nos dias da semana preferidos
 * (primeiro só o preferido; se faltarem dias, juntam-se os seguintes) que não tenham jogos das ligas nem pausas; a última é `final`.
 */
export function cupDates(count: number, from: IsoDate, final: IsoDate, weekdays: readonly number[], blocked: (d: IsoDate) => boolean): IsoDate[] {
  if (count <= 0) return [];
  const before = count - 1;
  const last = addDays(final, -6);
  const days: IsoDate[] = [];
  for (let d = from; compare(d, last) <= 0; d = addDays(d, 1)) if (!blocked(d)) days.push(d);
  let pool: IsoDate[] = [];
  for (let k = 1; k <= weekdays.length && pool.length < before; k++) pool = days.filter((d) => weekdays.slice(0, k).includes(weekDay(d)));
  if (pool.length < before) throw new Error(`Taça: só há ${pool.length} datas livres para ${before} rondas antes da final`);
  return [...spaced(pool.length, before).map((i) => pool[i] as IsoDate), final];
}

// ---------- criação ----------

type Setup = { busy: Set<IsoDate>; firstLeagueDate: IsoDate | undefined; pauses: { from: IsoDate; until: IsoDate }[] };

function setupOf(repo: Repository, data: BaseData, params: Params, season: number): Setup {
  const busy = new Set<IsoDate>();
  let firstLeagueDate: IsoDate | undefined;
  for (const league of new Set(data.clubs.filter((c) => !isInSecondDistrict(c.league)).map((c) => c.league))) {
    for (const m of repo.calendar(league, season).matches) {
      busy.add(m.date);
      if (!firstLeagueDate || compare(m.date, firstLeagueDate) < 0) firstLeagueDate = m.date;
    }
  }
  const c = params.calendar;
  const pauses = c.pauses.map((p) => ({ from: calendarDate(season, p.de, c), until: calendarDate(season, p.until, c) }));
  return { busy, firstLeagueDate, pauses };
}

const blockedOn = (s: Setup) => (d: IsoDate) => s.busy.has(d) || s.pauses.some((p) => compare(d, p.from) >= 0 && compare(d, p.until) <= 0);

/** Estádio neutro: o maior que não seja de nenhum dos dois finalistas. */
function neutralVenue(data: BaseData, a: string, b: string): string | undefined {
  return data.clubs.filter((c) => c.id !== a && c.id !== b && !isInSecondDistrict(c.league)).sort((x, y) => y.stadium.capacity - x.stadium.capacity || (x.id < y.id ? -1 : 1))[0]?.id;
}

function contextOf(repo: Repository, data: BaseData, params: Params, season: number, competition: string, allocateDates: RunContext["allocateDates"]): RunContext {
  return { seed: `${repo.meta("seed") ?? "?"}|${competition}|${season}`, competition, season, params, idPrefix: `e${season}-${slug(competition)}`, allocateDates, neutralVenue: (a, b) => neutralVenue(data, a, b) };
}
const noDates: RunContext["allocateDates"] = () => {
  throw new Error("As datas da taça já estão fixadas");
};

const toScheduled = (competition: string, season: number, f: Fixture): ScheduledMatch => ({
  id: f.id, competition, season, round: f.round, date: f.date, home: f.home, away: f.away,
  ...(f.knockout ? { knockout: true } : {}), ...(f.neutral ? { neutral: true } : {}), ...(f.venue ? { venue: f.venue } : {}), ...(f.firstLeg ? { firstLeg: f.firstLeg } : {}),
});

/** Entradas de um conjunto de clubes: o melhor tem `seed` 1 (pela reputação). */
function entrantsOf(clubs: readonly BaseClub[]): Entrant[] {
  return [...clubs].sort((a, b) => b.reputation - a.reputation || (a.id < b.id ? -1 : 1)).map((c, i) => ({ club: c.id, seed: i + 1, tier: TIER_NUMBER[c.tier] }));
}

function begin(repo: Repository, data: BaseData, params: Params, season: number, kind: CupKind, competition: string, entrants: Entrant[], lateWaves: Entrant[][], dates: (count: number) => IsoDate[]): void {
  const def = cupDef(kind, competition, lateWaves);
  const ctx = contextOf(repo, data, params, season, competition, (_stage, count) => dates(count));
  const step = startRun(def, entrants, ctx);
  saveRun(repo, step.state);
  if (step.fixtures.length > 0) repo.saveCalendar(step.fixtures.map((f) => toScheduled(competition, season, f)), []);
  announce(repo, data, params, season, kind, competition, step.state, step.events);
  repo.setMeta(listKey(season), JSON.stringify([...activeCompetitions(repo, season), competition]));
}

/** Cria as taças da época, uma só vez: depende dos calendários das ligas, por isso corre depois deles. Idempotente. */
export function ensureCompetitions(repo: Repository, data: BaseData, params: Params, season: number): void {
  if (repo.meta(listKey(season)) !== undefined) return;
  const setup = setupOf(repo, data, params, season);
  if (!setup.firstLeagueDate) return;
  const blocked = blockedOn(setup);
  const clubs = data.clubs.filter((c) => !isInSecondDistrict(c.league));
  const today = (repo.meta("date.today") as IsoDate | undefined) ?? "";
  const notBefore = (d: IsoDate) => (today && compare(d, addDays(today, 2)) < 0 ? addDays(today, 2) : d);
  const cfg = params.cups;
  repo.transaction(() => {
    repo.setMeta(listKey(season), "[]");
    // Supertaça: antes de começarem as ligas
    const pair = supercupEntrants(repo, season);
    if (pair && pair.every((id) => clubs.some((c) => c.id === id))) {
      const date = addDays(setup.firstLeagueDate as IsoDate, -cfg.supercupDaysBeforeFirstRound);
      const entrants = pair.map((id, i): Entrant => ({ club: id, seed: i + 1, tier: TIER_NUMBER[clubs.find((c) => c.id === id)!.tier] }));
      begin(repo, data, params, season, "supercup", SUPERCUP, entrants, [], () => [date]);
    }
    // Taça: a final é o último jogo interno da época
    const cup = cfg.cup;
    const final = nextWeekday(addDays(leaguesEnd(season, params), cup.finalDaysAfterLeagues), 0);
    const all = entrantsOf(clubs);
    const byWave = [0, 1, 2].map((w) => all.filter((e) => cup.wave[clubs.find((c) => c.id === e.club)!.tier] === w)).filter((w) => w.length > 0);
    begin(repo, data, params, season, "cup", CUP, byWave[0] ?? [], byWave.slice(1), (count) => cupDates(count, notBefore(calendarDate(season, cup.firstRound, params.calendar)), final, cup.weekdays, blocked));
    // Taças Distritais: uma por distrito
    const c = params.calendar;
    const districtsEnd = calendarDate(season, c.lastRoundPerTier.district ?? c.lastRoundUntil, c);
    let districtFinal = nextWeekday(addDays(districtsEnd, cfg.districtCup.finalDaysAfterDistrictsEnd), cup.weekdays[0] ?? 3);
    while (blocked(districtFinal)) districtFinal = addDays(districtFinal, 7);
    const byDistrict = new Map<string, BaseClub[]>();
    for (const club of clubs) if (club.tier === "district") byDistrict.set(club.district, [...(byDistrict.get(club.district) ?? []), club]);
    for (const [district, members] of [...byDistrict].sort(([a], [b]) => (a < b ? -1 : 1))) {
      if (members.length < 2) continue;
      begin(repo, data, params, season, "districtCup", districtCupName(district), entrantsOf(members), [], (count) => cupDates(count, notBefore(calendarDate(season, cfg.districtCup.firstRound, c)), districtFinal, cup.weekdays, blocked));
    }
  });
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
    const ctx = contextOf(repo, data, params, season, competition, noDates);
    const before = JSON.stringify(run);
    const step = stepRun(cupDef(kind, competition), run, results, ctx);
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
  const byId = new Map(data.clubs.map((c) => [c.id, c] as const));
  const district = kind === "districtCup" ? competition.slice(DISTRICT_CUP_PREFIX.length) : undefined;
  const factor = district ? districtFactors(data.cities, params).get(district) ?? 1 : 1;
  const prize = (club: string, type: string, value: number, extra: Record<string, unknown> = {}) => {
    const cb = byId.get(club);
    if (!cb || value <= 0) return;
    post(repo, cb, "prizes", value);
    const city = cb.city;
    repo.appendEvent({ type: "COMPETITION_PRIZE", date: today, season, visibility: "exposed", origin: "match", entities: [{ k: "club", id: club, roleKind: "premiado" }, { k: "competition", id: competition }, ...(city ? [{ k: "city" as const, id: city, roleKind: "host" }] : [])], data: { competition, type, value, ...(district ? { districtFactor: factor } : {}), ...extra } });
  };
  const finalType = kind === "cup" ? "portugalCup" : kind === "supercup" ? "superCup" : "districtCup";
  for (const e of events) {
    if (e.type !== "roundPlayed") continue;
    const key = roundKey(e.label);
    for (const t of e.ties) {
      const winner = byId.get(t.winner);
      const loser = byId.get(t.loser);
      if (e.label.fromEnd === 0) {
        const value = prizeValue(finalType, params, factor);
        prize(t.winner, finalType, value, { position: 1, round: key });
        prize(t.loser, finalType, finalistValue(value, params), { position: 2, round: key });
        // as taças distritais ficam no histórico (prémio) sem notícia para o mundo: são vinte por época
        if (kind !== "districtCup") repo.appendEvent({ type: "CHAMPION", date: today, season, visibility: "exposed", origin: "match", entities: [{ k: "club", id: t.winner, roleKind: "champion" }, { k: "competition", id: competition }], data: { league: competition, cup: true, runnerUp: t.loser } });
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
