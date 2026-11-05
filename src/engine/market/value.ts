/** Valor de mercado de um jogador (RZ-205): ordenado anual × múltiplo da idade, prémio do potencial dos jovens e peso do contrato restante. */
import type { Params } from "../config/parameters";
import { clamp } from "../random/rng";

function interpolate(points: readonly (readonly [number, number])[], x: number): number {
  const first = points[0] as readonly [number, number];
  const last = points[points.length - 1] as readonly [number, number];
  if (x <= first[0]) return first[1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i] as readonly [number, number];
    const [x0, y0] = points[i - 1] as readonly [number, number];
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return last[1];
}

export type ValueInput = { quality: number; potential: number; age: number; monthlyWage: number; monthsLeft: number };

export function marketValue(o: ValueInput, params: Params): number {
  const m = params.market;
  const premium = o.age <= m.potentialPremiumAgeMax ? 1 + Math.max(0, o.potential - o.quality) * m.potentialPremium : 1;
  const contract = clamp(o.monthsLeft / m.contractFullMonths, m.contractMinFactor, 1.3);
  return Math.max(0, o.monthlyWage * 12 * interpolate(m.ageFactor, o.age) * premium * contract);
}
