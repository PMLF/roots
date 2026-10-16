/**
 * Estado de uma cidade (concelho): as variáveis de docs/CITY.md §2 que o MVP acompanha (RZ-133).
 * Tudo aqui é puro. O estado "verdadeiro" são números 0-100; a interface só vê níveis em palavras e tendências.
 */
import type { Rng } from "../random/rng";
import { clamp } from "../random/rng";
import type { CityEffects, Params } from "../config/parameters";
import type { BaseCity, BaseClub } from "../data/types";

export type CityState = {
  population: number;
  employment: number;
  economy: number;
  tourism: number;
  pride: number;
  notoriety: number;
  footballCulture: number;
};

export type Indicator = Exclude<keyof CityState, "population">;
export const INDICATORS: readonly Indicator[] = ["economy", "employment", "tourism", "pride", "notoriety", "footballCulture"];

/** Níveis em palavras: 1 muito baixo … 5 muito alto. */
export type CityLevel = 1 | 2 | 3 | 4 | 5;
export type Trend = "rises" | "stable" | "drops";

export type CityTargets = Pick<CityState, "employment" | "economy" | "tourism" | "pride" | "notoriety">;

const BASE_DECADE = Math.log10(15000);

export function levelOf(value: number, params: Pick<Params, "city">): CityLevel {
  const cuts = params.city.levels;
  return (1 + cuts.filter((c) => value >= c).length) as CityLevel;
}

export function trendOf(before: number | undefined, now: number, params: Pick<Params, "city">): Trend {
  if (before === undefined) return "stable";
  const d = now - before;
  return d >= params.city.trendThreshold ? "rises" : d <= -params.city.trendThreshold ? "drops" : "stable";
}

/** Efeito do setor num campo: o principal a 100 %, o secundário a 50 %, mais o das ilhas. */
export function sectorEffect(c: Pick<BaseCity, "sector" | "tag2" | "island">, pitch: keyof CityEffects, params: Pick<Params, "city">): number {
  const s = params.city.sectors;
  return (s[c.sector]?.[pitch] ?? 0) + 0.5 * (s[c.tag2]?.[pitch] ?? 0) + (c.island ? (s.ILH?.[pitch] ?? 0) : 0);
}

const clampPct = (x: number) => clamp(x, 0, 100);

/** Valores para onde a cidade tende, sem ruído: o setor, o tamanho e o melhor clube da terra. */
export function cityTargets(c: BaseCity, clubs: readonly BaseClub[], params: Pick<Params, "city">): CityTargets {
  const k = params.city.initial;
  const decades = Math.log10(Math.max(c.population, 1)) - BASE_DECADE;
  const rep = Math.max(0, ...clubs.filter((x) => x.city === c.id).map((x) => x.reputation)) / k.reputationMax;
  return {
    employment: clampPct(k.base + sectorEffect(c, "employment", params) + k.byEmploymentDecade * decades),
    economy: clampPct(k.base + sectorEffect(c, "economy", params) + k.byEconomyDecade * decades),
    tourism: clampPct(k.base + sectorEffect(c, "tourism", params)),
    pride: clampPct(k.pride.base + k.pride.byReputation * rep),
    notoriety: clampPct(k.notoriety.base + k.notoriety.byReputation * rep + k.notoriety.byDecade * decades),
  };
}

/** Estado de arranque: os alvos mais um desvio sorteado (mesma seed → mesma cidade). */
export function initialState(c: BaseCity, clubs: readonly BaseClub[], rng: Rng, params: Pick<Params, "city">): CityState {
  const k = params.city.initial;
  const a = cityTargets(c, clubs, params);
  return {
    population: c.population,
    employment: clampPct(a.employment + rng.gauss(0, k.noise)),
    economy: clampPct(a.economy + rng.gauss(0, k.noise)),
    tourism: clampPct(a.tourism + rng.gauss(0, k.noise)),
    pride: clampPct(a.pride + rng.gauss(0, k.pride.noise)),
    notoriety: clampPct(a.notoriety + rng.gauss(0, k.notoriety.noise)),
    footballCulture: c.footballCulture,
  };
}
