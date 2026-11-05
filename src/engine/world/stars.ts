import type { Params } from "../config/parameters";
import type { Tier } from "../config/parameters";

export type StarRating = {
  /** Qualidade atual em estrelas (0,5 a 5, de meia em meia), relativa ao escalão onde joga. */
  stars: number;
  /** Intervalo de potencial em estrelas, quando é conhecido (ou estimado com margem). */
  potential?: { low: number; high: number };
};

const roundHalf = (x: number) => Math.round(x * 2) / 2;
const clampStars = (x: number) => Math.min(5, Math.max(0.5, x));

/** Qualidade (1-20) em estrelas relativas ao escalão: a média do escalão vale `centre`; cada `pointsPerStar` pontos é uma estrela. */
export function starsOf(quality: number, tier: Tier, params: Params): number {
  const w = params.world;
  const mean = w.targetQuality[tier].mean;
  return clampStars(roundHalf(w.stars.centre + (quality - mean) / w.stars.pointsPerStar));
}

/** Intervalo de potencial: de `low` a `high` (qualidade 1-20), nunca abaixo da qualidade atual. */
export function potentialRange(low: number, high: number, current: number, tier: Tier, params: Params): { low: number; high: number } {
  const lo = starsOf(Math.max(low, current), tier, params);
  const hi = Math.max(lo, starsOf(Math.max(high, current), tier, params));
  return { low: lo, high: hi };
}

/** Escalão de referência de um jogador: o do clube, ou o definido para livres. */
export function referenceTier(clubTier: Tier | undefined, params: Params): Tier {
  return clubTier ?? params.world.stars.freeAgentTier;
}
