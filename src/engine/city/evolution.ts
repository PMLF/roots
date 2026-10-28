/** Evolução anual de uma cidade (RZ-133; docs/CITY.md §11): regressão ao alvo, resultados dos clubes e acontecimentos. Puro. */
import type { Rng } from "../random/rng";
import { clamp } from "../random/rng";
import { CITY_SERVICES, type CityEffects, type CityService, type Params } from "../config/parameters";
import { serviceTarget, type CityTargets, type CityState } from "./state";

export type ClubsResults = { champions: number; promotions: number; relegations: number };
export const WITHOUT_RESULTS: ClubsResults = { champions: 0, promotions: 0, relegations: 0 };

export type EvolutionInput = {
  targets: CityTargets;
  /** Variação anual da população por causa do setor, em %. */
  driftPopulationPct: number;
  results: ClubsResults;
  /** Efeitos dos acontecimentos desta época (já escolhidos). */
  effects: readonly CityEffects[];
  /** Pontos que o orçamento da Câmara soma ao alvo de cada serviço (RZ-236). */
  council?: Partial<Record<CityService, number>>;
  /** Pontos que as empresas locais somam ao alvo do emprego e da economia (RZ-235). */
  companies?: { employment: number; economy: number };
};

const clampPct = (x: number) => clamp(x, 0, 100);

export function evolveCity(before: CityState, e: EvolutionInput, rng: Rng, params: Pick<Params, "city">): CityState {
  const k = params.city.evolution;
  const sum = (pitch: keyof CityEffects) => e.effects.reduce((s, x) => s + (x[pitch] ?? 0), 0);
  const course = (current: number, target: number) => current + (target - current) * k.regression + rng.gauss(0, k.noise);
  const r = e.results;

  // o que os clubes da terra fazem (títulos, subidas, descidas) mexe logo na economia, no emprego, nos serviços e na população (RZ-270)
  const cl = k.clubs;
  const club = (f: keyof (typeof cl)["champion"]) => r.champions * cl.champion[f] + r.promotions * cl.promotion[f] + r.relegations * cl.relegation[f];
  const economy = clampPct(course(before.economy, e.targets.economy + (e.companies?.economy ?? 0)) + sum("economy") + club("economy"));
  const employment = clampPct(course(before.employment, e.targets.employment + (e.companies?.employment ?? 0)) + sum("employment") + club("employment"));
  const tourism = clampPct(course(before.tourism, e.targets.tourism) + sum("tourism"));
  const pride = clampPct(course(before.pride, e.targets.pride) + r.champions * k.pride.champion + r.promotions * k.pride.promotion + r.relegations * k.pride.relegation + sum("pride"));
  const notoriety = clampPct(before.notoriety + (e.targets.notoriety - before.notoriety) * k.notoriety.regression + (pride - 50) * k.notoriety.byPride + sum("notoriety") + rng.gauss(0, k.noise / 2));
  const footballCulture = clamp(before.footballCulture + (pride - 50) * k.culture.byPride + r.champions * k.culture.champion + r.promotions * k.culture.promotion, 5, 95);

  // serviços: regridem para um alvo que depende do tamanho, setor, orçamento e da economia, emprego e turismo de agora
  const sv = params.city.services;
  const now = { economy, employment, tourism };
  const services = Object.fromEntries(CITY_SERVICES.map((id) => [id, clampPct(before[id] + (serviceTarget(id, e.targets.services[id] + (e.council?.[id] ?? 0), now, params) - before[id]) * sv.regression + rng.derive(`service:${id}`).gauss(0, sv.noise) + sum(id) + (id === "entertainment" ? club("entertainment") : id === "mobility" ? club("mobility") : 0))])) as Record<CityService, number>;
  const meanServices = CITY_SERVICES.reduce((a, id) => a + services[id], 0) / CITY_SERVICES.length;

  const pct = clamp(
    e.driftPopulationPct + (economy - 50) * k.population.byEconomy + (pride - 50) * k.population.byPride + (meanServices - 50) * sv.population.byServices + (employment - 50) * sv.population.byEmployment + (services.housing - 50) * sv.population.byHousing + club("populationPct") + sum("populationPct") + rng.gauss(0, k.population.noisePct),
    -k.population.maxPct,
    k.population.maxPct,
  );
  const population = Math.max(50, Math.round(before.population * (1 + pct / 100)));
  return { ...services, population, employment, economy, tourism, pride, notoriety, footballCulture };
}
