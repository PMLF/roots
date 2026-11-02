/**
 * Scouting do clube do gamer (RZ-230). O gamer não vê o mundo todo: quantos jogadores aparecem na pesquisa depende dos
 * olheiros do clube (os estrangeiros são bem menos). A informação sobre cada jogador vem de observações pagas:
 * uma semana (estimativas com margem e algumas pistas da personalidade) ou um mês (tudo). Também se pode pedir uma
 * lista de jogadores para uma posição (duas semanas), sem toda a informação.
 */
import type { Params } from "../config/parameters";
import type { BaseClub, BaseData } from "../data/types";
import { post } from "../club/finances";
import { clubBalance } from "../club/finances";
import { observeFields, observePersonality } from "../knowledge/observe";
import type { Repository } from "../persistence/repository";
import type { IsoDate, PlayerRecord } from "../persistence/types";
import { Rng, clamp } from "../random/rng";
import { addDays } from "../calendar/dates";
import { currentQuality } from "../world/player";
import { isForeignClub } from "../world/foreign";
import type { Attributes, Position } from "../world/types";

type OrderKind = "week" | "month" | "search";
export type ScoutOrder = {
  id: number;
  kind: OrderKind;
  /** Jogador observado (week/month). */
  person?: string;
  /** Pedido de pesquisa. */
  position?: string;
  minAge?: number;
  maxAge?: number;
  freeOnly?: boolean;
  start: IsoDate;
  end: IsoDate;
  cost: number;
  done?: boolean;
  /** Pesquisa concluída: os jogadores encontrados. */
  results?: string[];
};

export type OrderInput = Pick<ScoutOrder, "kind" | "person" | "position" | "minAge" | "maxAge" | "freeOnly">;

const ORDERS = "scouting.orders";
const FOUND = "scouting.found";
const SCOUTED = (person: string) => `scouted.${person}`;

export const orders = (repo: Repository): ScoutOrder[] => {
  const raw = repo.meta(ORDERS);
  return raw ? (JSON.parse(raw) as ScoutOrder[]) : [];
};
const saveOrders = (repo: Repository, list: ScoutOrder[]) => repo.setMeta(ORDERS, JSON.stringify(list));
export const foundBySearch = (repo: Repository): Set<string> => new Set(repo.meta(FOUND) ? (JSON.parse(repo.meta(FOUND) as string) as string[]) : []);
/** Nível do que se sabe do jogador por observação paga do olheiro: «week», «month» ou nada. */
/** Todos os jogadores já observados (id → nível), numa só leitura. */
export const scoutedLevels = (repo: Repository): Map<string, "week" | "month"> =>
  new Map([...repo.metaWithPrefix("scouted.")].map(([k, v]) => [k.slice("scouted.".length), v as "week" | "month"] as const));
export const scoutedLevel = (repo: Repository, person: string): "week" | "month" | undefined => (repo.meta(SCOUTED(person)) as "week" | "month" | null | undefined) ?? undefined;

/** Olheiros do clube: quantos e a melhor qualidade de olheiro (1-20). */
export function scoutsOf(repo: Repository, club: string): { count: number; quality: number; /** -1..1: olheiros ambiciosos preferem jovens, os de pouca ambição preferem veteranos. */ youthBias: number } {
  const scouts = repo.publicRoles({ club }).filter((p) => p.fn === "scout");
  const ambitions = scouts.map((p) => ((repo.person(p.id)?.personality.ambition ?? 10) - 10) / 10);
  const youthBias = ambitions.length === 0 ? 0 : ambitions.reduce((a, b) => a + b, 0) / ambitions.length;
  const quality = scouts.reduce((best, p) => Math.max(best, repo.role(p.id)?.quality?.scouting ?? 8), 0);
  return { count: scouts.length, quality, youthBias };
}

/** Fração dos jogadores nacionais que o clube vê, por olheiro (estrangeiros: muito menos). */
export function reach(count: number, params: Params): number {
  const r = params.scouting.reach;
  return clamp(r.base + r.perScout * count, 0, r.max);
}

const unit = (seed: string, key: string) => new Rng(seed, key).float();

/** Todos os jogadores do mundo que o gamer pode vir a ver (nacionais, livres e estrangeiros), sem os do próprio clube. */
export function worldPlayers(repo: Repository, data: BaseData, foreignClubIds: readonly string[]): PlayerRecord[] {
  const out: PlayerRecord[] = [];
  for (const c of data.clubs) for (const j of repo.clubPlayers(c.id)) if (j.state === "active") out.push(j);
  for (const j of repo.playersByState("free")) out.push(j);
  for (const id of foreignClubIds) for (const j of repo.clubPlayers(id)) if (j.state === "active") out.push(j);
  return out;
}

/** Aparece na pesquisa do clube? Monótono nos olheiros: mais olheiros mostram sempre um superconjunto. */
export function isVisible(seed: string, season: number, club: string, count: number, j: PlayerRecord, params: Params, factor = 1): boolean {
  const p = reach(count, params) * factor * (isForeignClub(j.club) ? params.scouting.reach.foreignFactor : 1);
  return unit(seed, `scouting/${club}/${season}/${j.person}`) < p;
}

const orderCost = (repo: Repository, params: Params, o: OrderInput): number => {
  const c = params.scouting.cost;
  if (o.kind === "search") return c.search;
  const foreign = o.person ? isForeignClub(repo.player(o.person)?.club) : false;
  return Math.round(((o.kind === "week" ? c.week : c.month) * (foreign ? c.foreignMultiplier : 1)) / 10) * 10;
};

export type OrderResult = { ok: true; order: ScoutOrder } | { ok: false; reason: "noScout" | "busy" | "noCash" | "invalid" | "own" };

export function placeOrder(repo: Repository, data: BaseData, params: Params, club: BaseClub, today: IsoDate, input: OrderInput): OrderResult {
  const scouts = scoutsOf(repo, club.id);
  if (scouts.count === 0) return { ok: false, reason: "noScout" };
  const list = orders(repo);
  if (list.filter((o) => !o.done).length >= scouts.count * params.scouting.perScout) return { ok: false, reason: "busy" };
  if (input.kind === "search" ? !input.position : !input.person || !repo.player(input.person)) return { ok: false, reason: "invalid" };
  if (input.person && repo.player(input.person)?.club === club.id) return { ok: false, reason: "own" };
  const cost = orderCost(repo, params, input);
  if (clubBalance(repo, club) < cost) return { ok: false, reason: "noCash" };
  const days = input.kind === "week" ? params.scouting.days.week : input.kind === "month" ? params.scouting.days.month : params.scouting.days.search;
  const order: ScoutOrder = { ...input, id: Math.max(0, ...list.map((o) => o.id)) + 1, start: today, end: addDays(today, days), cost };
  post(repo, club, "staff", -cost);
  saveOrders(repo, [...list, order]);
  return { ok: true, order };
}

/** Qualidade da observação: a do melhor olheiro do clube (1-20 → 0,3-0,9); o mês dá mais, o relatório rápido menos. */
const qualityOf = (kind: OrderKind, scoutQuality: number, params: Params): number => {
  const base = clamp(params.knowledge.qualityPerSource.scout + (scoutQuality - 10) / 40, 0.3, 0.9);
  return kind === "month" ? Math.min(params.scouting.monthQualityMax, base + params.scouting.monthBoost) : kind === "week" ? base : params.scouting.searchQuality;
};

function observe(repo: Repository, params: Params, club: string, person: string, kind: OrderKind, scoutQuality: number, date: IsoDate, season: number, rng: Rng): void {
  const j = repo.player(person);
  const p = repo.person(person);
  if (!j || !p) return;
  const quality = qualityOf(kind, scoutQuality, params);
  const base = { observer: club, target: { k: "person" as const, id: person }, source: "scout" as const, quality, date, season };
  observeFields(repo, { ...base, group: "attributes" }, j.attributes, [1, 20], rng.derive("a"), params.knowledge);
  observeFields(repo, { ...base, group: "potential" }, { potential: j.potential }, [1, 20], rng.derive("p"), params.knowledge);
  if (kind !== "search") observePersonality(repo, { ...base, group: "personality" }, p.personality, rng.derive("q"), kind === "month" ? { ...params.knowledge, personality: { ...params.knowledge.personality, labelsMax: 20, worstSubstitutionProbQuality: 0 } } : params.knowledge);
  if (kind !== "search") repo.setMeta(SCOUTED(person), kind === "month" || scoutedLevel(repo, person) === "month" ? "month" : "week");
}

/** Fecha as ordens que chegaram ao fim (chamado ao passar de dia). Devolve as que acabaram. */
export function completeOrders(repo: Repository, data: BaseData, params: Params, club: string, today: IsoDate, season: number): ScoutOrder[] {
  const list = orders(repo);
  const finished: ScoutOrder[] = [];
  const seed = repo.meta("seed") ?? "?";
  const scouts = scoutsOf(repo, club);
  const foreign = (repo.meta("foreign.clubs") ? (JSON.parse(repo.meta("foreign.clubs") as string) as { id: string }[]) : []).map((c) => c.id);
  for (const o of list) {
    if (o.done || o.end > today) continue;
    const rng = new Rng(seed, `scouting/order/${o.id}`);
    if (o.kind === "search") {
      o.results = search(repo, data, params, club, season, scouts, o, foreign, rng, today);
      repo.setMeta(FOUND, JSON.stringify([...new Set([...foundBySearch(repo), ...o.results])]));
    } else if (o.person) observe(repo, params, club, o.person, o.kind, scouts.quality, today, season, rng);
    o.done = true;
    finished.push(o);
  }
  if (finished.length > 0) saveOrders(repo, list);
  return finished;
}

/** Jogadores da posição com nível ou potencial que interessam ao clube, entre os que a pesquisa alcança (3× o alcance normal). */
function search(repo: Repository, data: BaseData, params: Params, club: string, season: number, scouts: { count: number; quality: number; youthBias?: number }, o: ScoutOrder, foreign: string[], rng: Rng, today: IsoDate): string[] {
  const seed = repo.meta("seed") ?? "?";
  const pos = o.position as Position;
  const quality = (j: PlayerRecord) => currentQuality(j.attributes as Attributes, (j.positions[0]?.pos ?? "CM") as Position);
  const own = repo.clubPlayers(club).filter((j) => j.positions[0]?.pos === pos).map(quality).sort((a, b) => a - b);
  const bar = own.length > 0 ? own[Math.floor(own.length / 2)]! - params.scouting.search.slack : 0;
  const age = (j: PlayerRecord) => (Date.parse(today) - Date.parse((repo.person(j.person) as { birth: string }).birth)) / (365.25 * 86_400_000);
  const candidates = worldPlayers(repo, data, foreign)
    .filter((j) => j.club !== club && j.positions[0]?.pos === pos)
    .filter((j) => (!o.freeOnly || j.state === "free") && (o.minAge === undefined || age(j) >= o.minAge) && (o.maxAge === undefined || age(j) <= o.maxAge))
    .filter((j) => isVisible(seed, season, club, scouts.count, j, params, params.scouting.search.reachFactor))
    .filter((j) => Math.max(quality(j), j.potential - params.scouting.search.potentialDiscount) >= bar);
  const noisy = candidates.map((j) => ({ j, score: Math.max(quality(j), j.potential - params.scouting.search.potentialDiscount) + rng.derive(j.person).gauss(0, params.scouting.search.noise) + params.staff.traits.scoutYouth * (scouts.youthBias ?? 0) * (age(j) <= 21 ? 1 : age(j) >= 29 ? -1 : 0) }));
  const picked = noisy.sort((a, b) => b.score - a.score || (a.j.person < b.j.person ? -1 : 1)).slice(0, params.scouting.search.results).map((x) => x.j.person);
  for (const id of picked) observe(repo, params, club, id, "search", scouts.quality, today, season, rng.derive(`obs/${id}`));
  return picked;
}
