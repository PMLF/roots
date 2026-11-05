/** Estádios neutros das finais (RZ-140): o Estádio Nacional para as finais nacionais e um dos maiores do distrito para as distritais. */
import type { Rng } from "../random/rng";
import type { Params } from "../config/parameters";
import type { BaseData } from "../data/types";
import { isInSecondDistrict } from "./districts";

/** Id de `ScheduledMatch.venue` para o Estádio Nacional (os outros são ids de clubes, cujo estádio recebe o jogo). */
export const NATIONAL_STADIUM = "national";

/** `name` é sempre o original; `sponsor` é a empresa que lhe dá o nome (se houver). */
export type Stadium = { name: string; locality: string; capacity: number; sponsor?: string };

const nationalStadium = (params: Params): Stadium => params.cups.nationalStadium;

/** O estádio de um local de jogo neutro: o nacional ou o de um clube. */
export function venueStadium(data: BaseData, params: Params, venue: string): Stadium | undefined {
  if (venue === NATIONAL_STADIUM) return nationalStadium(params);
  const c = data.clubs.find((x) => x.id === venue);
  return c ? { name: c.stadium.name, locality: c.locality, capacity: c.stadium.capacity } : undefined;
}

/** Um dos três maiores estádios do distrito que não seja de nenhum dos dois finalistas, escolhido ao acaso (determinístico por `rng`). */
export function districtVenue(data: BaseData, district: string, a: string, b: string, rng: Rng, top = 3): string | undefined {
  const biggest = data.clubs.filter((c) => c.district === district && c.id !== a && c.id !== b && !isInSecondDistrict(c.league)).sort((x, y) => y.stadium.capacity - x.stadium.capacity || (x.id < y.id ? -1 : 1)).slice(0, top);
  return biggest.length > 0 ? rng.shuffle(biggest)[0]?.id : undefined;
}
