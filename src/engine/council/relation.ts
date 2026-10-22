/** Relação do gamer com cada autarca (RZ-236): 0-100, em palavras na interface, com seta (desde o início da época) e causa. */
import { clamp } from "../random/rng";
import type { Params } from "../config/parameters";
import type { Repository } from "../persistence/repository";
import { levelOf, type CityLevel, type ServiceTrend } from "../city/state";

export type RelationCause = "approved" | "refused" | "pride" | "backed" | "backedRival" | "neutralLost" | "promiseKept" | "promiseBroken";
type Stored = { v: number; start: number; cause?: RelationCause; mag: number };
const key = (person: string) => `council.relation.${person}`;

function read(repo: Repository, params: Pick<Params, "city">, person: string): Stored {
  const raw = repo.meta(key(person));
  if (raw) return JSON.parse(raw) as Stored;
  const v = params.city.council.relation.start;
  return { v, start: v, mag: 0 };
}

export function relationOf(repo: Repository, params: Pick<Params, "city">, person: string): { value: number; level: CityLevel; trend: ServiceTrend; cause?: RelationCause } {
  const s = read(repo, params, person);
  const r = params.city.council.relation;
  const d = s.v - s.start;
  const trend: ServiceTrend = d >= r.strongTrend ? "up2" : d >= r.trend ? "up1" : d <= -r.strongTrend ? "down2" : d <= -r.trend ? "down1" : "stable";
  return { value: s.v, level: levelOf(s.v, params), trend, ...(s.cause && trend !== "stable" ? { cause: s.cause } : {}) };
}

/** Muda a relação; a causa mostrada é a da maior mudança da época. */
export function adjustRelation(repo: Repository, params: Pick<Params, "city">, person: string, delta: number, cause: RelationCause): void {
  const s = read(repo, params, person);
  const next: Stored = { ...s, v: clamp(s.v + delta, 0, 100) };
  if (Math.abs(delta) >= s.mag) { next.cause = cause; next.mag = Math.abs(delta); }
  repo.setMeta(key(person), JSON.stringify(next));
}

/** Fim de época: o clube que dá orgulho à cidade agrada ao autarca; a seta volta a contar a partir daqui. */
export function closeRelation(repo: Repository, params: Pick<Params, "city">, person: string, pride: number): void {
  adjustRelation(repo, params, person, params.city.council.relation.prideDrift * (pride - 50), "pride");
  const s = read(repo, params, person);
  repo.setMeta(key(person), JSON.stringify({ v: s.v, start: s.v, mag: 0 } satisfies Stored));
}
