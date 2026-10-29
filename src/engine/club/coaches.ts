/**
 * Treinadores da IA (RZ-210): cada clube tem um treinador principal (cargo `coach`); o clube do gamer tem o gamer, por isso não tem
 * treinador da IA. A direção perde confiança no treinador que falha os objetivos (lugar na tabela abaixo do esperado pela reputação e
 * pelo dinheiro) e despede-o; o clube contrata um livre ou alicia um treinador com bons resultados noutro clube, que só aceita se
 * for para um escalão acima ou para um salário bem superior. Estado no save (meta): `coach.board` (confiança e data de entrada) e
 * `coach.vacancies` (clubes à procura de treinador).
 */
import { Rng, clamp } from "../random/rng";
import type { Params, Tier } from "../config/parameters";
import type { BaseClub, BaseData } from "../data/types";
import type { Repository } from "../persistence/repository";
import type { IsoDate } from "../persistence/types";
import { dayNumber } from "../calendar/dates";
import { isInSecondDistrict } from "../season/districts";
import { referenceWage } from "../season/gamerContract";
import { standingIn } from "../world/standing";
import { currentSeason } from "../season/seasonPyramid";
import type { SeasonFinish } from "./reputationCycle";

type BoardState = { conf: number; since: IsoDate };
type Board = Record<string, BoardState>;
type Vacancies = Record<string, IsoDate>;

const TIER_ORDER: Tier[] = ["firstLeague", "secondLeague", "thirdLeague", "cp", "district"];
const readJson = <T>(repo: Repository, key: string): T => JSON.parse(repo.meta(key) ?? "{}") as T;
const readBoard = (repo: Repository): Board => readJson<Board>(repo, "coach.board");
const readVacancies = (repo: Repository): Vacancies => readJson<Vacancies>(repo, "coach.vacancies");

/** O treinador principal de um clube (se tiver). */
export const coachOf = (repo: Repository, club: string): string | undefined => repo.publicRoles({ club }).find((p) => p.fn === "coach")?.id;

/** Qualidade do treinador (1-20): média de táticas e motivação. */
export function coachQuality(repo: Repository, person: string): number {
  const q = repo.role(person)?.quality;
  return q ? ((q.tactics ?? 10) + (q.motivation ?? 10)) / 2 : 10;
}

type Table = Map<string, number>; // clube → posição atual
const expectedRanks = (data: BaseData, params: Params, league: string): Map<string, number> => {
  const peers = data.clubs.filter((c) => c.league === league);
  const w = params.world.standingReputationWeight;
  const sorted = [...peers].sort((a, b) => standingIn(b, peers, w) - standingIn(a, peers, w) || (a.id < b.id ? -1 : 1));
  return new Map(sorted.map((c, i) => [c.id, i + 1] as const));
};

/** Desempenho de um clube na liga, de −1 (muito abaixo do esperado) a 1 (muito acima). Sem desempenho enquanto jogou poucos jogos. */
function performance(repo: Repository, data: BaseData, params: Params, club: BaseClub, season: number, cache: Map<string, { table: Table; played: Map<string, number>; expected: Map<string, number> }>): number | undefined {
  let c = cache.get(club.league);
  if (!c) {
    const lines = repo.standings(club.league, season);
    const sorted = [...lines].sort((a, b) => b.points - a.points || (b.scoredGoals - b.concededGoals) - (a.scoredGoals - a.concededGoals) || (a.club < b.club ? -1 : 1));
    c = { table: new Map(sorted.map((l, i) => [l.club, i + 1] as const)), played: new Map(lines.map((l) => [l.club, l.matches] as const)), expected: expectedRanks(data, params, club.league) };
    cache.set(club.league, c);
  }
  const rank = c.table.get(club.id), expected = c.expected.get(club.id);
  if (rank === undefined || expected === undefined || (c.played.get(club.id) ?? 0) < params.coach.board.minMatches) return undefined;
  return clamp((expected - rank) / Math.max(1, c.table.size - 1), -1, 1);
}

const freeCoaches = (repo: Repository): string[] => repo.roleHolders("coach").filter((id) => repo.role(id)?.club === undefined);

function event(repo: Repository, type: "COACH_SACKED" | "COACH_HIRED", date: IsoDate, season: number, person: string, club: string, data: Record<string, unknown>, other?: string): void {
  repo.appendEvent({ type, date, season, visibility: "exposed", origin: "generated", entities: [{ k: "person", id: person, roleKind: "coach" }, { k: "club", id: club, roleKind: type === "COACH_SACKED" ? "sacked" : "hirer" }, ...(other ? [{ k: "club" as const, id: other, roleKind: "from" }] : [])], data });
}

function release(repo: Repository, board: Board, vacancies: Vacancies, club: string, coach: string, date: IsoDate, season: number, reason: string, vacant: boolean): void {
  repo.setRoleClub(coach, null);
  event(repo, "COACH_SACKED", date, season, coach, club, { reason });
  delete board[club];
  if (vacant) vacancies[club] = date;
}

/** Procura treinador para um clube: um livre ou um com bons resultados noutro clube que aceite as condições. */
function fill(repo: Repository, data: BaseData, params: Params, club: BaseClub, season: number, date: IsoDate, gamerClub: string | undefined, rng: Rng, cache: Parameters<typeof performance>[5], board: Board, vacancies: Vacancies): boolean {
  const cfg = params.coach.board.poach;
  const target = params.world.targetQuality[club.tier].mean;
  const options: { person: string; score: number; from?: BaseClub }[] = [];
  const score = (person: string) => coachQuality(repo, person) - 0.7 * Math.abs(coachQuality(repo, person) - target) + rng.derive(`n/${person}`).float() * 0.5;
  for (const person of freeCoaches(repo)) options.push({ person, score: score(person) });
  // aliciar: só os melhores candidatos empregados (com bons resultados e qualidade acima do que o clube procura) e só alguns dos que o clube tenta
  const employed: { person: string; score: number; from: BaseClub }[] = [];
  for (const person of repo.roleHolders("coach")) {
    const at = repo.role(person)?.club;
    if (!at || at === club.id || at === gamerClub) continue;
    const from = data.clubs.find((c) => c.id === at);
    if (!from || isInSecondDistrict(from.league)) continue;
    if (coachQuality(repo, person) < target + cfg.qualityEdge) continue;
    const perf = performance(repo, data, params, from, season, cache);
    if (perf === undefined || perf < cfg.minPerf) continue;
    employed.push({ person, score: score(person) + cfg.bonus, from });
  }
  employed.sort((a, b) => b.score - a.score || (a.person < b.person ? -1 : 1));
  for (const x of employed.slice(0, cfg.tries)) {
    const tierUp = TIER_ORDER.indexOf(club.tier) < TIER_ORDER.indexOf(x.from.tier);
    const wageUp = referenceWage(club, params) >= referenceWage(x.from, params) * cfg.wageRatio;
    const accept = tierUp ? cfg.tierUp : wageUp ? cfg.wage : cfg.stay;
    if (rng.derive(`a/${x.person}`).prob(cfg.attempt) && rng.derive(`o/${x.person}`).prob(accept)) { options.push(x); break; }
  }
  const best = options.sort((a, b) => b.score - a.score || (a.person < b.person ? -1 : 1))[0];
  if (!best) return false;
  repo.setRoleClub(best.person, club.id);
  event(repo, "COACH_HIRED", date, season, best.person, club.id, { from: best.from ? best.from.id : "free" }, best.from?.id);
  board[club.id] = { conf: params.coach.board.start, since: date };
  delete vacancies[club.id];
  if (best.from) { vacancies[best.from.id] = date; delete board[best.from.id]; }
  return true;
}

/**
 * Ronda semanal (às segundas): o clube do gamer fica sem treinador da IA; a direção avalia cada treinador, despede quem perdeu a
 * confiança e os clubes sem treinador contratam um (depois de alguns dias de interinidade).
 */
export function coachRound(repo: Repository, data: BaseData, params: Params, today: IsoDate, season: number, gamerClub?: string): void {
  const cfg = params.coach.board;
  const rng = new Rng(repo.meta("seed") ?? "?", `coaches/${today}`);
  const board = readBoard(repo);
  const vacancies = readVacancies(repo);
  const cache: Parameters<typeof performance>[5] = new Map();
  const clubs = data.clubs.filter((c) => !isInSecondDistrict(c.league)).sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const club of clubs) {
    const coach = coachOf(repo, club.id);
    if (club.id === gamerClub) {
      // o treinador do clube do gamer é o gamer
      if (coach) release(repo, board, vacancies, club.id, coach, today, season, "gamer", false);
      delete vacancies[club.id];
      continue;
    }
    if (!coach) { vacancies[club.id] ??= today; continue; }
    const perf = performance(repo, data, params, club, season, cache);
    if (perf === undefined) continue;
    const st = (board[club.id] ??= { conf: cfg.start, since: today });
    st.conf += cfg.rate * (clamp(50 + 60 * perf * cfg.pressure[club.tier], 0, 100) - st.conf);
    const president = repo.publicRoles({ club: club.id }).find((p) => p.fn === "president");
    const patience = (president ? repo.person(president.id)?.personality.patience : undefined) ?? 10;
    const limit = cfg.sackBelow - cfg.patienceEffect * (patience - 10);
    if (st.conf < limit && dayNumber(today) - dayNumber(st.since) >= cfg.graceDays && rng.derive(`sack/${club.id}`).prob(cfg.sackProbability)) {
      release(repo, board, vacancies, club.id, coach, today, season, "results", true);
    }
  }
  for (const club of clubs) {
    const since = vacancies[club.id];
    if (since === undefined || club.id === gamerClub || dayNumber(today) - dayNumber(since) < cfg.vacancyDays) continue;
    fill(repo, data, params, club, season, today, gamerClub, rng.derive(`fill/${club.id}`), cache, board, vacancies);
  }
  repo.setMeta("coach.board", JSON.stringify(board));
  repo.setMeta("coach.vacancies", JSON.stringify(vacancies));
}

/** Fim de época: despedimentos pelos objetivos falhados (descida ou época muito abaixo do esperado) e a confiança volta a meio caminho do arranque. */
export function coachSeasonEnd(repo: Repository, data: BaseData, params: Params, season: number, today: IsoDate, finish: readonly SeasonFinish[], nextTier: ReadonlyMap<string, Tier>, gamerClub?: string): void {
  const cfg = params.coach.board;
  const rng = new Rng(repo.meta("seed") ?? "?", `coaches/end/${season}`);
  const board = readBoard(repo);
  const vacancies = readVacancies(repo);
  const expected = new Map<string, Map<string, number>>();
  for (const f of finish) {
    if (f.club === gamerClub) continue;
    const club = data.clubs.find((c) => c.id === f.club);
    const coach = club ? coachOf(repo, f.club) : undefined;
    if (!club || !coach) continue;
    if (!expected.has(club.league)) expected.set(club.league, expectedRanks(data, params, club.league));
    const perf = clamp((((expected.get(club.league)!.get(f.club) ?? f.position) - f.position) / Math.max(1, f.size - 1)) * cfg.pressure[f.tier], -1, 1);
    const relegated = TIER_ORDER.indexOf(nextTier.get(f.club) ?? f.tier) > TIER_ORDER.indexOf(f.tier);
    const p = relegated ? cfg.sackRelegated : perf <= cfg.badPerf ? cfg.sackBad : 0;
    if (p > 0 && rng.derive(`s/${f.club}`).prob(p)) release(repo, board, vacancies, f.club, coach, today, season, relegated ? "relegation" : "results", true);
  }
  for (const st of Object.values(board)) st.conf = (st.conf + cfg.start) / 2;
  repo.setMeta("coach.board", JSON.stringify(board));
  repo.setMeta("coach.vacancies", JSON.stringify(vacancies));
}

/** Depois de o gamer mudar de clube (ou começar): o clube novo fica sem treinador da IA e o antigo procura um. */
export function syncGamerCoach(repo: Repository, data: BaseData, params: Params): void {
  const today = (repo.meta("date.today") ?? "") as IsoDate;
  if (!today) return;
  coachRound(repo, data, params, today, currentSeason(repo), repo.meta("gamer.club") || undefined);
}
