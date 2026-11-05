/**
 * Prémio por vencer cada competição (RZ-216; docs/DESIGN_RULES.md §3). Puro: calcula os valores. A tesouraria do clube
 * entra com as finanças (RZ-114); por agora o valor fica no evento `PREMIO_COMPETICAO`, de onde se reconstrói.
 * Taça de Portugal, Supertaça e Taças Distritais têm os valores nos parâmetros e só pagam quando existirem (RZ-140 a RZ-142).
 */
import type { Params } from "../config/parameters";
import type { BaseCity, DistrictId } from "../data/types";

/** Riqueza de um distrito = orçamento municipal total × apoio médio dos autarcas ao desporto (1-10). */
function wealth(cities: readonly BaseCity[]): number {
  if (cities.length === 0) return 0;
  const budget = cities.reduce((t, c) => t + c.municipalBudget, 0);
  const support = cities.reduce((t, c) => t + c.mayor.sportSupport, 0) / cities.length;
  return budget * support;
}

/**
 * Fator multiplicativo dos prémios distritais por distrito: riqueza do distrito sobre a riqueza média, limitado a
 * `premios.fatorDistrito`. Normalizado para que a média dos distritos seja ~1 (o valor nos parâmetros é a média).
 */
export function districtFactors(cities: readonly BaseCity[], params: Params): Map<DistrictId, number> {
  const byDistrict = new Map<DistrictId, BaseCity[]>();
  for (const c of cities) byDistrict.set(c.district, [...(byDistrict.get(c.district) ?? []), c]);
  const r = new Map([...byDistrict].map(([d, cs]) => [d, wealth(cs)] as const));
  const mean = r.size > 0 ? [...r.values()].reduce((t, v) => t + v, 0) / r.size : 0;
  const { min, max } = params.prizes.districtFactor;
  return new Map([...r].map(([d, v]) => [d, mean > 0 ? Math.min(max, Math.max(min, v / mean)) : 1] as const));
}

export type PrizeType = "firstLeague" | "secondLeague" | "thirdLeague" | "cpSeries" | "cpWinner" | "district" | "promotionPhase" | "portugalCup" | "superCup" | "districtCup" | "districtSuperCup";

/** Valor do prémio (euros, arredondado às dezenas), com o fator do distrito nas competições distritais. */
export function prizeValue(type: PrizeType, params: Params, factor = 1): number {
  const base = params.prizes.competitions[type];
  const f = type === "district" || type === "promotionPhase" || type === "districtCup" || type === "districtSuperCup" ? factor : 1;
  return Math.round((base * f) / 10) * 10;
}

/** Valor do finalista vencido numa competição a eliminar. */
export function finalistValue(winner: number, params: Params): number {
  return Math.round((winner * params.prizes.beatenFinalist) / 10) * 10;
}

/**
 * Prémio de ultrapassar uma ronda da Taça de Portugal. `rondasAntesDasMeias` = 0 nas meias-finais (a ronda que leva à final),
 * 1 nos quartos, 2 nos oitavos… Cada ronda para trás vale `fator` da seguinte, com mínimo.
 */
export function roundPrize(semiBeforeRounds: number, params: Params): number {
  const { semi, factor, min } = params.prizes.portugalCupPerRound;
  return Math.max(min, Math.round(semi * factor ** Math.max(0, semiBeforeRounds)));
}
