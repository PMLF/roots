/**
 * Talento local (RZ-234): jovens da terra que ainda não assinaram por nenhum clube.
 * O concelho define o teto (população^expoente × cultura de futebol): quantos nascem e quão alto chega o potencial. Cada ano nasce
 * uma geração; os clubes contratam-nos na passagem de época (no lugar dos jovens «de raiz»); quem fica sem clube sai do futebol.
 */
import { Rng, clamp } from "../random/rng";
import { addDays } from "../calendar/dates";
import type { Params, Tier } from "../config/parameters";
import type { BaseCity, BaseData } from "../data/types";
import { generatePersonality } from "../personality/generate";
import { generateAttributes, generateBody, generatePositions, currentQuality, potentialEQuality } from "../world/player";
import { generateName } from "../world/names";
import type { PersonRecord, PlayerRecord, WorldBatchRecord } from "../persistence/types";
import type { Position } from "../world/types";

/** Teto do concelho: população^expoente × cultura de futebol (0-100). */
export const cityCeiling = (city: Pick<BaseCity, "population" | "footballCulture">, params: Params): number =>
  Math.pow(Math.max(city.population, 1), params.squadCycle.youth.prospects.popExponent) * Math.max(city.footballCulture, 1);

/** Quantos jovens nascem neste concelho este ano: média por concelho × teto relativo, com arredondamento por sorteio. */
export function prospectCount(ceiling: number, meanCeiling: number, params: Params, rng: Rng): number {
  const x = (params.squadCycle.youth.prospects.perCityMean * ceiling) / meanCeiling;
  const base = Math.floor(x);
  return base + (rng.float() < x - base ? 1 : 0);
}

/**
 * Gera a geração do ano: pessoas e jogadores com estado `prospect`, sem clube nem contrato.
 * A qualidade vem da mistura dos escalões (por nº de entradas) e o potencial é deslocado pelo teto do concelho.
 */
export function newProspects(data: BaseData, params: Params, o: { season: number; seasonStart: string; seed: string; nextId: () => string }): WorldBatchRecord {
  const y = params.squadCycle.youth;
  const p = y.prospects;
  const ceilings = data.cities.map((c) => cityCeiling(c, params));
  const mean = ceilings.reduce((a, b) => a + b, 0) / Math.max(1, ceilings.length);
  const tierWeights = (Object.keys(y.perClub) as Tier[]).map((t) => ({ t, w: y.perClub[t] * data.clubs.filter((c) => c.tier === t).length }));
  const batch: WorldBatchRecord = { people: [], players: [], contracts: [], roles: [] };
  const world = params.world;
  data.cities.forEach((city, i) => {
    const rng = new Rng(o.seed, `prospects/${o.season}/${city.id}`);
    const n = prospectCount(ceilings[i] as number, mean, params, rng.derive("n"));
    const shift = p.potentialShift * clamp(Math.log((ceilings[i] as number) / mean) / 2, -1, 1);
    for (let k = 0; k < n; k++) {
      const r = rng.derive(`k/${k}`);
      const tier = r.weighted(tierWeights, (x) => x.w).t;
      const tq = world.targetQuality[tier];
      const position = r.weighted(Object.keys(world.placesByPosition) as Position[], (pos) => world.placesByPosition[pos]);
      const target = clamp(r.gauss(tq.mean + y.targetOffset, tq.deviation), 1, 20);
      const age = r.integer(p.ageMin, p.ageMax);
      const name = generateName(r, y.nameFamily);
      const { personality, archetype } = generatePersonality(r, "player", { cityNatural: true, hardOrigin: false }, params.personality.traitMin, params.personality.traitMax);
      const { current, potential } = potentialEQuality(r, target, age, world);
      const attributes = generateAttributes(r, position, current, age);
      const id = o.nextId();
      const person: PersonRecord = {
        id, name: name.full, sportingName: name.sporting,
        birth: addDays(o.seasonStart, -Math.round((age + r.float()) * 365.25)),
        nationality: "pt", birthCity: city.id, roles: ["player"], personality, archetype, lod: 1,
      };
      const player: PlayerRecord = {
        person: id, positions: generatePositions(r, position, world.secondaryAptitude), attributes,
        potential: Math.round(clamp(Math.max(potential + shift, currentQuality(attributes, position)), 1, 20) * 10) / 10,
        ...generateBody(r, position), state: "prospect",
      };
      batch.people.push(person);
      batch.players.push(player);
    }
  });
  return batch;
}
