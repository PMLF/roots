/**
 * Ligas estrangeiras (RZ-230): um grupo pequeno de clubes inventados por país, só para haver jogadores de fora que o
 * olheiro possa descobrir. Não jogam no calendário do gamer; o plantel evolui na passagem de época (`squad/foreign.ts`).
 * Os ids começam por `x-` e nenhum clube tem página.
 */
import type { Params, Tier } from "../config/parameters";
import { Rng } from "../random/rng";
import type { Country } from "./countries";

export type ForeignClub = { id: string; name: string; country: string; tier: Tier; /** Família de nomes do país (para os jovens que entram). */ family: string };

export const FOREIGN_PREFIX = "x-";
export const isForeignClub = (id: string | undefined): boolean => id !== undefined && id.startsWith(FOREIGN_PREFIX);

const FORMS = ["FC", "Atlético", "Sporting", "Real", "Dínamo", "Unión", "Racing", "Olímpico"];
const START = ["Bar", "Cal", "Dor", "Fal", "Gar", "Hel", "Lor", "Mar", "Nor", "Ost", "Pol", "Ros", "Sal", "Tor", "Val", "Vel", "Zar"];
const MIDDLE = ["a", "e", "i", "o", "u", "an", "el", "or", "en"];
const END = ["mara", "vento", "burgo", "lia", "nova", "dena", "ria", "stad", "gora", "sena", "pol", "mont"];

/** Países com liga estrangeira: os de maior tradição (sem Portugal). */
export const foreignCountries = (countries: readonly Country[], params: Params): Country[] =>
  countries.filter((c) => c.id !== "pt").sort((a, b) => b.tradition - a.tradition || (a.id < b.id ? -1 : 1)).slice(0, params.world.foreignLeagues.countries);

/** Escalão dos plantéis de um país conforme a tradição. */
export const foreignTier = (country: Country): Tier => (country.tradition >= 85 ? "firstLeague" : country.tradition >= 65 ? "secondLeague" : "thirdLeague");

export function foreignClubs(seed: string, countries: readonly Country[], params: Params): ForeignClub[] {
  const out: ForeignClub[] = [];
  for (const country of foreignCountries(countries, params)) {
    const rng = new Rng(seed, `foreign/${country.id}`);
    const used = new Set<string>();
    for (let i = 0; i < params.world.foreignLeagues.clubsPerCountry; i++) {
      let name = "";
      for (let k = 0; k < 20 && (name === "" || used.has(name)); k++) {
        const town = `${rng.choose(START)}${rng.choose(MIDDLE)}${rng.choose(END)}`;
        name = `${rng.choose(FORMS)} ${town}`;
      }
      used.add(name);
      out.push({ id: `${FOREIGN_PREFIX}${country.id}-${String(i + 1).padStart(2, "0")}`, name, country: country.id, tier: foreignTier(country), family: country.familyNames });
    }
  }
  return out;
}
