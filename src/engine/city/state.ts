/**
 * Estado de uma cidade (concelho): as variáveis de docs/CITY.md §2 que o MVP acompanha (RZ-133).
 * Tudo aqui é puro. O estado "verdadeiro" são números 0-100; a interface só vê níveis em palavras e tendências.
 */
import type { Rng } from "../random/rng";
import { clamp } from "../random/rng";
import { CITY_SERVICES, type CityEffects, type CityService, type Params } from "../config/parameters";
import type { BaseCity, BaseClub } from "../data/types";

export type CityState = Record<CityService, number> & {
  population: number;
  employment: number;
  economy: number;
  tourism: number;
  pride: number;
  notoriety: number;
  footballCulture: number;
};

export { CITY_SERVICES };
export type Indicator = Exclude<keyof CityState, "population" | CityService>;
export const INDICATORS: readonly Indicator[] = ["economy", "employment", "tourism", "pride", "notoriety", "footballCulture"];

/** Níveis em palavras: 1 muito baixo … 5 muito alto. */
export type CityLevel = 1 | 2 | 3 | 4 | 5;
export type Trend = "rises" | "stable" | "drops";

export type CityTargets = Pick<CityState, "employment" | "economy" | "tourism" | "pride" | "notoriety"> & {
  /** Alvo-base de cada serviço (tamanho, setor e orçamento municipal); o alvo do momento soma-lhe a ligação à economia, emprego e turismo (`serviceTarget`). */
  services: Record<CityService, number>;
};

const perCapita = (c: Pick<BaseCity, "municipalBudget" | "population">) => c.municipalBudget / Math.max(1, c.population);

/** Orçamento municipal por habitante de cada concelho, de −1 (o mais baixo) a +1 (o mais alto), pela ordem entre todos. */
export function budgetIndexes(cities: readonly Pick<BaseCity, "id" | "municipalBudget" | "population">[]): Map<string, number> {
  const sorted = [...cities].sort((a, b) => perCapita(a) - perCapita(b) || a.id.localeCompare(b.id));
  return new Map(sorted.map((c, i) => [c.id, sorted.length > 1 ? (2 * i) / (sorted.length - 1) - 1 : 0] as const));
}

/** O alvo de um serviço neste momento: o alvo-base mais a ligação à economia, emprego e turismo atuais. */
export function serviceTarget(service: CityService, base: number, now: Pick<CityState, "economy" | "employment" | "tourism">, params: Pick<Params, "city">): number {
  const l = params.city.services.links[service];
  return clampPct(base + l.economy * (now.economy - 50) + l.employment * (now.employment - 50) + l.tourism * (now.tourism - 50));
}

const BASE_DECADE = Math.log10(15000);

export function levelOf(value: number, params: Pick<Params, "city">): CityLevel {
  const cuts = params.city.levels;
  return (1 + cuts.filter((c) => value >= c).length) as CityLevel;
}

/** Tendência com intensidade (RZ-233): seta forte ou fraca para cima ou para baixo, ou estável. */
export type ServiceTrend = "up2" | "up1" | "stable" | "down1" | "down2";
export function serviceTrendOf(before: number | undefined, now: number, params: Pick<Params, "city">): ServiceTrend {
  if (before === undefined) return "stable";
  const d = now - before;
  const strong = params.city.services.strongTrend;
  const weak = params.city.trendThreshold;
  return d >= strong ? "up2" : d >= weak ? "up1" : d <= -strong ? "down2" : d <= -weak ? "down1" : "stable";
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
export function cityTargets(c: BaseCity, clubs: readonly BaseClub[], params: Pick<Params, "city">, budgetIndex = 0, currentPopulation = c.population): CityTargets {
  const sv = params.city.services.initial;
  const k = params.city.initial;
  const decades = Math.log10(Math.max(c.population, 1)) - BASE_DECADE;
  const rep = Math.max(0, ...clubs.filter((x) => x.city === c.id).map((x) => x.reputation)) / k.reputationMax;
  return {
    employment: clampPct(k.base + sectorEffect(c, "employment", params) + k.byEmploymentDecade * decades + k.byClub.employment * (rep - 0.4)),
    economy: clampPct(k.base + sectorEffect(c, "economy", params) + k.byEconomyDecade * decades + k.byClub.economy * (rep - 0.4)),
    tourism: clampPct(k.base + sectorEffect(c, "tourism", params)),
    pride: clampPct(k.pride.base + k.pride.byReputation * rep),
    notoriety: clampPct(k.notoriety.base + k.notoriety.byReputation * rep + k.notoriety.byDecade * decades),
    services: Object.fromEntries(CITY_SERVICES.map((id) => [id, clampPct(sv.base[id] + sv.byDecade[id] * decades + sectorEffect(c, id, params) + sv.byBudget * budgetIndex + (id === "housing" ? params.city.services.housingGrowth * Math.log2(Math.max(1, currentPopulation) / Math.max(1, c.population)) : 0))])) as Record<CityService, number>,
  };
}

/** Estado de arranque: os alvos mais um desvio sorteado (mesma seed → mesma cidade). */
export function initialState(c: BaseCity, clubs: readonly BaseClub[], rng: Rng, params: Pick<Params, "city">, budgetIndex = 0): CityState {
  const k = params.city.initial;
  const a = cityTargets(c, clubs, params, budgetIndex);
  const base = {
    economy: clampPct(a.economy + rng.gauss(0, k.noise)),
    employment: clampPct(a.employment + rng.gauss(0, k.noise)),
    tourism: clampPct(a.tourism + rng.gauss(0, k.noise)),
  };
  const services = Object.fromEntries(CITY_SERVICES.map((id) => [id, clampPct(serviceTarget(id, a.services[id], base, params) + rng.derive(`service:${id}`).gauss(0, params.city.services.initial.noise))])) as Record<CityService, number>;
  return {
    ...services,
    population: c.population,
    employment: base.employment,
    economy: base.economy,
    tourism: base.tourism,
    pride: clampPct(a.pride + rng.gauss(0, k.pride.noise)),
    notoriety: clampPct(a.notoriety + rng.gauss(0, k.notoriety.noise)),
    footballCulture: c.footballCulture,
  };
}
