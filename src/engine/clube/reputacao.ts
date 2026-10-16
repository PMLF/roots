import type { LevelReputation, Params } from "../config/parametros";

/** A reputação (0-10 000) em palavra: mundial, continental, nacional, regional, local ou obscuro. */
export function reputationLevel(reputation: number, params: Params): LevelReputation {
  const n = params.reputation.levels.find((x) => reputation >= x.min);
  return (n ?? params.reputation.levels.at(-1) as { level: LevelReputation }).level;
}
