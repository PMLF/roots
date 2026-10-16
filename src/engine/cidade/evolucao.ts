/** Evolução anual de uma cidade (RZ-133; docs/CIDADE.md §11): regressão ao alvo, resultados dos clubes e acontecimentos. Puro. */
import type { Rng } from "../aleatorio/rng";
import { clamp } from "../aleatorio/rng";
import type { CityEffects, Params } from "../config/parametros";
import type { CityTargets, CityState } from "./estado";

export type ClubsResults = { champions: number; promotions: number; relegations: number };
export const WITHOUT_RESULTS: ClubsResults = { champions: 0, promotions: 0, relegations: 0 };

export type EvolutionInput = {
  targets: CityTargets;
  /** Variação anual da população por causa do setor, em %. */
  driftPopulationPct: number;
  results: ClubsResults;
  /** Efeitos dos acontecimentos desta época (já escolhidos). */
  effects: readonly CityEffects[];
};

const clampPct = (x: number) => clamp(x, 0, 100);

export function evolveCity(before: CityState, e: EvolutionInput, rng: Rng, params: Pick<Params, "city">): CityState {
  const k = params.city.evolution;
  const sum = (pitch: keyof CityEffects) => e.effects.reduce((s, x) => s + (x[pitch] ?? 0), 0);
  const course = (current: number, target: number) => current + (target - current) * k.regression + rng.gauss(0, k.noise);
  const r = e.results;

  const economy = clampPct(course(before.economy, e.targets.economy) + sum("economy"));
  const employment = clampPct(course(before.employment, e.targets.employment) + sum("employment"));
  const tourism = clampPct(course(before.tourism, e.targets.tourism) + sum("tourism"));
  const pride = clampPct(course(before.pride, e.targets.pride) + r.champions * k.pride.champion + r.promotions * k.pride.promotion + r.relegations * k.pride.relegation + sum("pride"));
  const notoriety = clampPct(before.notoriety + (e.targets.notoriety - before.notoriety) * k.notoriety.regression + (pride - 50) * k.notoriety.byPride + sum("notoriety") + rng.gauss(0, k.noise / 2));
  const footballCulture = clamp(before.footballCulture + (pride - 50) * k.culture.byPride + r.champions * k.culture.champion + r.promotions * k.culture.promotion, 5, 95);

  const pct = clamp(
    e.driftPopulationPct + (economy - 50) * k.population.byEconomy + (pride - 50) * k.population.byPride + sum("populationPct") + rng.gauss(0, k.population.noisePct),
    -k.population.maxPct,
    k.population.maxPct,
  );
  const population = Math.max(50, Math.round(before.population * (1 + pct / 100)));
  return { population, employment, economy, tourism, pride, notoriety, footballCulture };
}
