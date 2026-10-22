/** Criação de empresas e dos seus donos (RZ-219). Determinístico: cada cidade tem o seu fluxo aleatório. */
import { Rng, clamp } from "../random/rng";
import { addDays } from "../calendar/dates";
import type { Params } from "../config/parameters";
import type { BaseCity } from "../data/types";
import { generatePersonality } from "../personality/generate";
import { generateName } from "../world/names";
import type { CompanyRecord, CompanyScale, PersonRecord, RoleRecord } from "../persistence/types";
import { drawSector, companyName, isBroadcaster } from "./sectors";

export const SCALES: CompanyScale[] = ["local", "regional", "national", "international"];
const BASE_DECADE = Math.log10(15000);

const decadesOf = (population: number): number => Math.log10(Math.max(population, 1)) - BASE_DECADE;

/** Número de empresas que uma cidade sustenta. */
export function targetCompanies(city: Pick<BaseCity, "population">, params: Params): number {
  const k = params.companies.perCity;
  return Math.max(k.min, Math.round(k.base + k.perDecade * decadesOf(city.population)));
}

/** Peso de cada escala numa cidade com esta população. */
export const scaleWeightOf = (population: number, scale: CompanyScale, params: Params): number => Math.max(0, params.companies.scaleWeight[scale].base + params.companies.scaleWeight[scale].perDecade * decadesOf(population));

function drawScale(rng: Rng, population: number, params: Params): CompanyScale {
  return rng.weighted(SCALES, (s) => scaleWeightOf(population, s, params));
}

function drawCapital(rng: Rng, scale: CompanyScale, params: Params): number {
  const c = params.companies.capital;
  return Math.max(5000, Math.round(c.median[scale] * Math.exp(rng.gauss(0, c.sigma)) / 1000) * 1000);
}

/** Dono novo (pessoa com personalidade de empresário) numa cidade. */
export function createOwner(rng: Rng, id: string, city: BaseCity, today: string, params: Params): { person: PersonRecord; role: RoleRecord } {
  const name = generateName(rng, params.squadCycle.youth.nameFamily);
  const { personality, archetype } = generatePersonality(rng, "businessperson", {}, params.personality.traitMin, params.personality.traitMax);
  const age = clamp(rng.gauss(50, 8), 28, 75);
  const person: PersonRecord = {
    id, name: name.full, sportingName: name.sporting, birth: addDays(today, -Math.round(age * 365.25)), nationality: "pt", birthCity: city.id,
    roles: ["businessperson"], personality, archetype, lod: 2,
  };
  return { person, role: { person: id, fn: "businessperson", city: city.id } };
}

/** Nova empresa de uma cidade; o apelido do nome vem do dono. */
export function createCompany(rng: Rng, o: { id: string; city: BaseCity; owner: PersonRecord; year: number; foundedBefore?: number }, params: Params): CompanyRecord {
  const sector = drawSector(rng, o.city.sector, o.city.tag2);
  // emissoras: a televisão generalista é regional; rádios e plataformas, locais ou regionais (as nacionais criam-se à parte)
  const scale: CompanyScale = isBroadcaster(sector) ? (sector === "television" || rng.prob(0.35) ? "regional" : "local") : drawScale(rng, o.city.population, params);
  const surname = o.owner.sportingName.split(" ").at(-1) as string;
  return {
    id: o.id,
    name: companyName(rng, sector, surname, o.city.name),
    sector,
    scale,
    city: o.city.id,
    owner: o.owner.id,
    capital: drawCapital(rng, scale, params),
    founded: o.year - (o.foundedBefore ?? 0),
    state: "active",
  };
}

/** Emissora nacional criada no arranque: dono novo na cidade escolhida. */
export function createNationalBroadcaster(rng: Rng, o: { id: string; city: BaseCity; owner: PersonRecord; year: number; spec: Params["broadcast"]["national"][number] }): CompanyRecord {
  const surname = o.owner.sportingName.split(" ").at(-1) as string;
  return {
    id: o.id,
    name: companyName(rng, o.spec.sector, surname, o.city.name),
    sector: o.spec.sector,
    scale: o.spec.scale,
    city: o.city.id,
    owner: o.owner.id,
    capital: Math.round(o.spec.capital * Math.exp(rng.gauss(0, 0.1)) / 1_000_000) * 1_000_000,
    founded: o.year - rng.integer(5, 45),
    state: "active",
  };
}
