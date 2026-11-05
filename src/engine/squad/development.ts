/**
 * Desenvolvimento anual de um jogador (RZ-117): cresce até ao potencial antes do auge,
 * estabiliza no auge e desce depois, mais depressa nos atributos físicos.
 * Puro e determinístico: só depende do Rng, dos atributos e dos parâmetros.
 */
import type { Rng } from "../random/rng";
import { clamp } from "../random/rng";
import type { Params } from "../config/parameters";
import { currentQuality } from "../world/player";
import { GK_ATTRIBUTES, MENTAL_ATTRIBUTES, PHYSICAL_ATTRIBUTES, type Attributes, type Position } from "../world/types";
import { KEY } from "../world/player";

export type DevelopmentResult = { attributes: Record<string, number>; potential: number; quality: number };

const stochasticRound = (rng: Rng, x: number): number => {
  const base = Math.floor(x);
  return base + (rng.float() < x - base ? 1 : 0);
};

/** Variação esperada da qualidade (pontos) de um jogador de `age` anos até à época seguinte. */
export function expectedChange(quality: number, potential: number, age: number, params: Params): number {
  const d = params.squadCycle.development;
  if (age < params.world.peakAge) return Math.max(0, potential - quality) * d.growthShare;
  if (age < d.declineAge) return 0;
  return -(d.declineBase + d.declinePerYear * (age - d.declineAge));
}

/** `age` = idade no início da nova época (já com mais um ano). */
export function developPlayer(rng: Rng, o: { attributes: Record<string, number>; potential: number; position: Position; age: number }, params: Params): DevelopmentResult {
  const d = params.squadCycle.development;
  const key = new Set<string>(KEY[o.position]);
  const gk = new Set<string>(GK_ATTRIBUTES);
  const physical = new Set<string>(PHYSICAL_ATTRIBUTES);
  const mental = new Set<string>(MENTAL_ATTRIBUTES);
  const q0 = currentQuality(o.attributes as Attributes, o.position);
  const change = expectedChange(q0, o.potential, o.age, params) + rng.gauss(0, d.yearlyNoise);
  const attributes: Record<string, number> = {};
  for (const [name, value] of Object.entries(o.attributes)) {
    if (gk.has(name) && o.position !== "GK") {
      attributes[name] = value;
      continue;
    }
    let delta = change * (key.has(name) ? 1 : d.offPositionWeight);
    if (physical.has(name) && o.age >= d.declineAge) delta -= d.physicalExtra * (o.age - d.declineAge + 1);
    if (mental.has(name) && o.age <= 29) delta += d.mentalGain;
    attributes[name] = clamp(stochasticRound(rng, value + delta + rng.gauss(0, 0.35)), 1, 20);
  }
  const quality = currentQuality(attributes as Attributes, o.position);
  const potential = o.age < params.world.peakAge ? Math.max(o.potential, quality) : quality;
  return { attributes, potential: Math.round(clamp(potential, 1, 20) * 10) / 10, quality };
}
