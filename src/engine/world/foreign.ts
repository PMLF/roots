/**
 * Ligas estrangeiras (RZ-230): um grupo pequeno de clubes inventados por país, só para haver jogadores de fora que o
 * olheiro possa descobrir. Não jogam no calendário do gamer; o plantel evolui na passagem de época (`squad/foreign.ts`).
 * Os ids começam por `x-` e nenhum clube tem página.
 */
import type { Params, Tier } from "../config/parameters";
import { Rng } from "../random/rng";
import type { BaseClub } from "../data/types";
import type { Country } from "./countries";

export type ForeignClub = {
  id: string; name: string; country: string; tier: Tier;
  /** Família de nomes do país (para os jovens que entram). */ family: string;
  /** Qualidade-alvo (1-20) dos jogadores do clube: país, mais o lugar do clube no seu país. */ quality: number;
  /** Cores do clube, no formato dos dados («Vermelho e branco»). */ colours: string;
  /** Capacidade do estádio. */ capacity: number;
};

const FOREIGN_PREFIX = "x-";
export const isForeignClub = (id: string | undefined): boolean => id !== undefined && id.startsWith(FOREIGN_PREFIX);

const FORMS = ["FC", "Atlético", "Sporting", "Real", "Dínamo", "Unión", "Racing", "Olímpico"];
const START = ["Bar", "Cal", "Dor", "Fal", "Gar", "Hel", "Lor", "Mar", "Nor", "Ost", "Pol", "Ros", "Sal", "Tor", "Val", "Vel", "Zar"];
const MIDDLE = ["a", "e", "i", "o", "u", "an", "el", "or", "en"];
const END = ["mara", "vento", "burgo", "lia", "nova", "dena", "ria", "stad", "gora", "sena", "pol", "mont"];

/** Países com clubes estrangeiros: os que a configuração lista e existem nos dados (sem Portugal). */
const foreignCountries = (countries: readonly Country[], params: Params): Country[] =>
  countries.filter((c) => c.id !== "pt" && params.world.foreignLeagues.clubs[c.id] !== undefined).sort((a, b) => b.tradition - a.tradition || (a.id < b.id ? -1 : 1));

/** Escalão dos plantéis de um país conforme a tradição. */
const foreignTier = (country: Country): Tier => (country.tradition >= 85 ? "firstLeague" : country.tradition >= 65 ? "secondLeague" : "thirdLeague");

const PALETTE = ["Vermelho", "Azul", "Verde", "Amarelo", "Preto", "Laranja", "Roxo", "Azul-marinho", "Castanho", "Branco", "Dourado", "Grená"];

export function foreignClubs(seed: string, countries: readonly Country[], params: Params): ForeignClub[] {
  const out: ForeignClub[] = [];
  const f = params.world.foreignLeagues;
  for (const country of foreignCountries(countries, params)) {
    const rng = new Rng(seed, `foreign/${country.id}`);
    const used = new Set<string>();
    const n = f.clubs[country.id] as number;
    const tier = foreignTier(country);
    // qualidade média do país pela tradição: 45 → 10,5 · 70 → 12,5 · 95 → 14,5 (o melhor clube do país sobe, o pior desce `rankSpread`/2)
    const base = 10.5 + ((country.tradition - 45) / 50) * 4;
    for (let i = 0; i < n; i++) {
      let name = "";
      for (let k = 0; k < 20 && (name === "" || used.has(name)); k++) {
        const town = `${rng.choose(START)}${rng.choose(MIDDLE)}${rng.choose(END)}`;
        name = `${rng.choose(FORMS)} ${town}`;
      }
      used.add(name);
      // o primeiro clube de cada país é o melhor; a qualidade desce com o lugar (amplitude `rankSpread`)
      const rank = n === 1 ? 0.5 : 1 - i / (n - 1);
      const quality = base + (rank - 0.5) * f.rankSpread + (rng.float() - 0.5) * 0.6;
      const a = PALETTE[rng.integer(0, PALETTE.length - 1)] as string;
      let b = PALETTE[rng.integer(0, PALETTE.length - 1)] as string;
      if (b === a) b = "Branco";
      out.push({
        id: `${FOREIGN_PREFIX}${country.id}-${String(i + 1).padStart(2, "0")}`, name, country: country.id, tier, family: country.familyNames, quality,
        colours: a === b ? a : `${a} e ${b.toLowerCase()}`,
        capacity: Math.round((12000 + rank * 40000 + rng.float() * 8000) / 100) * 100,
      });
    }
  }
  return out;
}

/** O clube estrangeiro com a forma dos clubes dos dados (para a bilheteira, os nomes e as cores). Não tem cidade nem localidade. */
export function foreignAsBase(fc: ForeignClub): BaseClub {
  const reputation = Math.round(Math.min(8300, Math.max(900, 900 + ((fc.quality - 8) / 8) * 7400)));
  return {
    id: fc.id, name: fc.name, locality: "", localityId: "", city: "", district: "", tier: "firstLeague", league: fc.country, reputation, finances: 0,
    stadium: { name: `Estádio ${fc.name}`, ownership: "club", capacity: fc.capacity, location: "near" },
    colours: fc.colours, nickname: "", mascot: "", rival: "", sector: "", tag2: "", hub: "", origin: "new",
  } as unknown as BaseClub;
}
