import type { Params } from "../config/parameters";
import type { Rng } from "../random/rng";

/**
 * Cláusula de rescisão de um contrato novo (RZ-207): com certa probabilidade (maior se o agente é ganancioso),
 * o contrato fixa um valor — múltiplo do valor de mercado — que qualquer clube pode pagar sem o vendedor poder recusar.
 */
export function releaseClause(rng: Rng, value: number, agentGreed: number | undefined, params: Params): number | undefined {
  const c = params.market.clauses;
  const p = c.releaseProbability + (agentGreed === undefined ? 0 : c.releaseByAgentGreed * (agentGreed - params.market.agents.greedPivot));
  if (value <= 0 || !rng.derive("has").prob(Math.min(0.9, Math.max(0, p)))) return undefined;
  const factor = c.releaseFactor[0] + rng.derive("factor").float() * (c.releaseFactor[1] - c.releaseFactor[0]);
  return Math.round((value * factor) / 1000) * 1000;
}
