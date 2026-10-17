/** Jogadores formados pelo clube (RZ-117): novos jovens com pessoa, personalidade, atributos e contrato. */
import type { Rng } from "../random/rng";
import { clamp } from "../random/rng";
import { addDays } from "../calendar/dates";
import type { Params, Tier } from "../config/parameters";
import type { BaseCity, BaseClub } from "../data/types";
import { generatePersonality } from "../personality/generate";
import { generateAttributes, generateBody, generatePositions, currentQuality, potentialEQuality } from "../world/player";
import { generateName } from "../world/names";
import type { ContractRecord, PersonRecord, PlayerRecord } from "../persistence/types";
import type { Position } from "../world/types";
import { createDate } from "../calendar/dates";

export type NewPlayerKit = { person: PersonRecord; player: PlayerRecord; contract: ContractRecord };

/** Ordenado mensal de um jogador de qualidade `quality` num clube do escalão (mesma fórmula do arranque do mundo). */
export function wageFor(params: Params, tier: Tier, quality: number, wageScale: number): number {
  const w = params.world.wage;
  const wage = w.average[tier] * Math.exp(w.elasticity * (quality - params.world.targetQuality[tier].mean)) * wageScale;
  return Math.max(50, Math.round(wage / 10) * 10);
}

/** Contrato que termina a 30 de junho, `years` anos depois do início da época que começa em `seasonStart`. */
export function contractDates(seasonStart: string, years: number): { start: string; end: string } {
  const year = Number(seasonStart.slice(0, 4));
  return { start: seasonStart, end: createDate(year + years, 6, 30) };
}

export type YouthInput = {
  id: string;
  club: BaseClub;
  tier: Tier;
  position: Position;
  /** Qualidade-alvo (ao nível do plantel) à volta da qual o jovem é gerado. */
  targetQuality: number;
  wageScale: number;
  seasonStart: string;
  years: number;
  cities: readonly BaseCity[];
  districtCities: readonly BaseCity[];
  /** Aposta do clube nos jovens (1 = média): sobe o potencial de quem sai da formação. */
  focus?: number;
};

export function createYouth(rng: Rng, o: YouthInput, params: Params): NewPlayerKit {
  const y = params.squadCycle.youth;
  const age = rng.integer(y.ageMin, y.ageMax);
  const name = generateName(rng, y.nameFamily);
  const roll = rng.float();
  const pool = roll < y.hometownProbability ? undefined : o.districtCities.length > 0 && roll < 0.85 ? o.districtCities : o.cities;
  const birthCity = pool ? rng.weighted(pool, (c) => Math.sqrt(c.population)).id : o.club.city;
  const natural = birthCity === o.club.city;
  const { personality, archetype } = generatePersonality(rng, "player", { cityNatural: natural, hardOrigin: false }, params.personality.traitMin, params.personality.traitMax);
  const { current, potential } = potentialEQuality(rng, o.targetQuality, age, params.world);
  const attributes = generateAttributes(rng, o.position, current, age);
  const person: PersonRecord = {
    id: o.id,
    name: name.full,
    sportingName: name.sporting,
    birth: addDays(o.seasonStart, -Math.round((age + rng.float()) * 365.25)),
    nationality: "pt",
    birthCity,
    roles: ["player"],
    personality,
    archetype,
    lod: 1,
  };
  const player: PlayerRecord = {
    person: o.id,
    positions: generatePositions(rng, o.position, params.world.secondaryAptitude),
    attributes,
    potential: Math.round(clamp(Math.max(potential + y.potentialByFocus * ((o.focus ?? 1) - 1), currentQuality(attributes, o.position)), 1, 20) * 10) / 10,
    ...generateBody(rng, o.position),
    club: o.club.id,
    trainedAt: o.club.id,
    state: "active",
  };
  const contract: ContractRecord = {
    person: o.id,
    club: o.club.id,
    monthlyWage: wageFor(params, o.tier, clamp(current, 1, 20), o.wageScale),
    ...contractDates(o.seasonStart, o.years),
  };
  return { person, player, contract };
}
