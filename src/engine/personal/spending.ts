/**
 * O que o gamer faz com o dinheiro da sua conta (RZ-162, 2.ª fatia): casa própria na terra (menos custo de vida e raízes na negociação),
 * cursos de treinador (peso na negociação), apoio a causas da cidade (serviços e relação com o autarca) e ajuda ao clube em dificuldades
 * (o presidente perdoa). Tudo sai da conta pessoal; nada é obrigatório e quase não há fricção.
 */
import { addDays } from "../calendar/dates";
import { adjustRelation } from "../council/relation";
import { cityHistoryWithPast } from "../city/cities";
import { mayorOf } from "../council/agenda";
import { post } from "../club/finances";
import type { CityService, Params } from "../config/parameters";
import { CITY_SERVICES } from "../config/parameters";
import type { BaseClub, BaseData } from "../data/types";
import type { Repository } from "../persistence/repository";
import type { IsoDate } from "../persistence/types";
import { currentSeason } from "../season/seasonPyramid";
import { bankOf, livingCost } from "./bank";
import { relieveGrudge } from "../season/gamerContract";

const json = <T>(raw: string | undefined, fallback: T): T => (raw ? (JSON.parse(raw) as T) : fallback);

// --- casa própria ---
export const homesOf = (repo: Repository): string[] => json(repo.meta("gamer.homes"), [] as string[]);
export const ownsHome = (repo: Repository, city: string): boolean => homesOf(repo).includes(city);
export const homePrice = (repo: Repository, data: BaseData, params: Params, city: string): number => {
  // o preço é sobre o custo de vida de quem não tem casa (sem desconto)
  const base = Math.round((livingCost(repo, data, params, city) / (ownsHome(repo, city) ? 1 - params.personal.home.livingDiscount : 1)) * params.personal.home.priceMonths / 1000) * 1000;
  return Math.max(1000, base);
};

type Result<T extends object = object> = ({ ok: true; balance: number } & T) | { ok: false; reason: string };

function pay(repo: Repository, params: Params, today: IsoDate, value: number): number | undefined {
  const bank = bankOf(repo, params, today);
  if (value > bank.balance) return undefined;
  repo.setMeta("gamer.bank", JSON.stringify({ ...bank, balance: bank.balance - value }));
  return bank.balance - value;
}

export function buyHome(repo: Repository, data: BaseData, params: Params, today: IsoDate, city: string): Result {
  if (!data.cities.some((c) => c.id === city)) return { ok: false, reason: "city" };
  if (ownsHome(repo, city)) return { ok: false, reason: "owned" };
  const price = homePrice(repo, data, params, city);
  let balance: number | undefined;
  repo.transaction(() => {
    balance = pay(repo, params, today, price);
    if (balance === undefined) return;
    repo.setMeta("gamer.homes", JSON.stringify([...homesOf(repo), city]));
    repo.appendEvent({ type: "GAMER_HOME", date: today, season: currentSeason(repo), visibility: "exposed", origin: "match", entities: [{ k: "city", id: city, roleKind: "home" }], data: { price } });
  });
  return balance === undefined ? { ok: false, reason: "funds" } : { ok: true, balance };
}

// --- cursos de treinador ---
type Courses = { level: number; training?: { level: number; until: IsoDate } };
const coursesRaw = (repo: Repository): Courses => json(repo.meta("gamer.courses"), { level: 0 });
export function courseLevel(repo: Repository, today: IsoDate): number {
  const c = coursesRaw(repo);
  return c.training && c.training.until <= today ? c.training.level : c.level;
}
export const courseTraining = (repo: Repository, today: IsoDate): { level: number; until: IsoDate } | undefined => {
  const c = coursesRaw(repo);
  return c.training && c.training.until > today ? c.training : undefined;
};
export function startCourse(repo: Repository, params: Params, today: IsoDate): Result<{ level: number; until: IsoDate }> {
  const cfg = params.personal.course;
  const current = courseLevel(repo, today);
  if (current >= cfg.cost.length) return { ok: false, reason: "max" };
  if (courseTraining(repo, today)) return { ok: false, reason: "busy" };
  const level = current + 1;
  const until = addDays(today, cfg.days[level - 1]!);
  let balance: number | undefined;
  repo.transaction(() => {
    balance = pay(repo, params, today, cfg.cost[level - 1]!);
    if (balance === undefined) return;
    repo.setMeta("gamer.courses", JSON.stringify({ level: current, training: { level, until } } satisfies Courses));
    repo.appendEvent({ type: "GAMER_COURSE", date: today, season: currentSeason(repo), visibility: "exposed", origin: "match", entities: [], data: { level, until } });
  });
  return balance === undefined ? { ok: false, reason: "funds" } : { ok: true, balance, level, until };
}

// --- causas da cidade ---
type Causes = Record<string, Partial<Record<CityService, number>>>;
const causesRaw = (repo: Repository): Causes => json(repo.meta("gamer.causes"), {} as Causes);
/** Pontos que as causas do gamer somam a cada serviço da cidade no fecho desta época. */
export const causeOffsets = (repo: Repository, city: string): Partial<Record<CityService, number>> => causesRaw(repo)[city] ?? {};
export function clearCauses(repo: Repository, city: string): void {
  const all = causesRaw(repo);
  if (all[city]) { delete all[city]; repo.setMeta("gamer.causes", JSON.stringify(all)); }
}
export function supportCause(repo: Repository, data: BaseData, params: Params, today: IsoDate, city: string, service: string, amount: number): Result<{ points: number }> {
  const cfg = params.personal.cause;
  const value = Math.floor(amount);
  if (!(CITY_SERVICES as readonly string[]).includes(service)) return { ok: false, reason: "service" };
  if (!(value >= cfg.min)) return { ok: false, reason: "amount" };
  const population = cityHistoryWithPast(repo, data, params, city).at(-1)?.state.population ?? data.cities.find((c) => c.id === city)?.population ?? 15_000;
  const all = causesRaw(repo);
  const have = all[city]?.[service as CityService] ?? 0;
  if (have >= cfg.maxPointsPerYear) return { ok: false, reason: "cap" };
  const points = Math.min(cfg.maxPointsPerYear - have, cfg.pointsPer * ((value / Math.max(1000, population)) * 100));
  let balance: number | undefined;
  repo.transaction(() => {
    balance = pay(repo, params, today, value);
    if (balance === undefined) return;
    repo.setMeta("gamer.causes", JSON.stringify({ ...all, [city]: { ...all[city], [service]: have + points } }));
    const mayor = mayorOf(repo, data, city)?.person;
    if (mayor) adjustRelation(repo, params, mayor, Math.min(cfg.maxRelation, (cfg.relationPerThousand * value) / 1000), "cause");
    repo.appendEvent({ type: "GAMER_CAUSE", date: today, season: currentSeason(repo), visibility: "exposed", origin: "match", entities: [{ k: "city", id: city, roleKind: "cause" }], data: { service, amount: value } });
  });
  return balance === undefined ? { ok: false, reason: "funds" } : { ok: true, balance, points: Math.round(points * 10) / 10 };
}

// --- ajudar o clube ---
export function helpClub(repo: Repository, params: Params, today: IsoDate, club: BaseClub, wageRef: number, amount: number): Result {
  const cfg = params.personal.help;
  const value = Math.floor(amount);
  if (!(value >= cfg.min)) return { ok: false, reason: "amount" };
  let balance: number | undefined;
  repo.transaction(() => {
    balance = pay(repo, params, today, value);
    if (balance === undefined) return;
    post(repo, club, "donations", value);
    relieveGrudge(repo, params, today, (cfg.grudgeReliefPerYearOfWage * value) / Math.max(1, wageRef * 12));
    repo.appendEvent({ type: "GAMER_HELP_CLUB", date: today, season: currentSeason(repo), visibility: "exposed", origin: "match", entities: [{ k: "club", id: club.id, roleKind: "helped" }], data: { amount: value } });
  });
  return balance === undefined ? { ok: false, reason: "funds" } : { ok: true, balance };
}
