/**
 * Gerador do mundo e das pessoas (RZ-103; docs/WORLD_GENERATION.md). Puro e determinístico:
 * mesma seed + mesmos dados + mesmos parâmetros → mesmo mundo. Cada clube tem o seu fluxo
 * aleatório (derivado do id), por isso acrescentar um clube não muda os outros.
 */
import { foreignClubs } from "./foreign";
import { Rng, clamp } from "../random/rng";
import { createDate, addDays } from "../calendar/dates";
import type { Tier, Params } from "../config/parameters";
import type { BaseClub, BaseCity, BaseData } from "../data/types";
import { generatePersonality, type PersonRole } from "../personality/generate";
import { generateAttributes, generateBody, generatePositions, currentQuality, potentialEQuality } from "./player";
import { generateName } from "./names";
import { birthWeight, weightForPortugal, type Country } from "./countries";
import { densityIn, densityTable } from "./talent";
import { POSITIONS, type NewRole, type NewContract, type RoleFunction, type NewPlayer, type WorldBatch, type NewPerson, type Position } from "./types";

export type WorldInput = {
  seed: string;
  data: BaseData;
  countries: readonly Country[];
  params: Params;
  onProgress?: (phase: string, done: number, total: number) => void;
};

const TIERS: Tier[] = ["firstLeague", "secondLeague", "thirdLeague", "cp", "district"];

/** Lugares por posição para um plantel de `n` (maior resto), com pelo menos 2 guarda-redes. */
export function distributePositions(n: number, base: Params["world"]["placesByPosition"]): Position[] {
  const sum = POSITIONS.reduce((s, p) => s + base[p], 0);
  const raw = POSITIONS.map((p) => ({ p, x: (base[p] * n) / sum }));
  const count: Record<string, number> = {};
  let used = 0;
  for (const b of raw) {
    count[b.p] = Math.max(1, Math.floor(b.x));
    used += count[b.p] as number;
  }
  const rest = [...raw].sort((a, b) => b.x - Math.floor(b.x) - (a.x - Math.floor(a.x)));
  for (let i = 0; used < n; i++) {
    count[(rest[i % rest.length] as { p: string }).p]!++;
    used++;
  }
  while (used > n) {
    const larger = POSITIONS.filter((p) => (count[p] as number) > 1).sort((a, b) => (count[b] as number) - (count[a] as number))[0] as Position;
    count[larger]!--;
    used--;
  }
  if ((count.GR as number) < 2) {
    const larger = POSITIONS.filter((p) => p !== "GK").sort((a, b) => (count[b] as number) - (count[a] as number))[0] as Position;
    count[larger]!--;
    count.GR!++;
  }
  return POSITIONS.flatMap((p) => Array<Position>(count[p] as number).fill(p));
}

type Ctx = {
  seed: Rng;
  params: Params;
  countries: readonly Country[];
  porId: Map<string, Country>;
  foreigners: Country[];
  densities: Map<string, Float64Array>;
  cities: BaseCity[];
  citiesPerDistrict: Map<string, BaseCity[]>;
  start: string;
  batch: WorldBatch;
  seen: Set<string>;
  n: number;
};

const newId = (c: Ctx) => `p${String(++c.n).padStart(6, "0")}`;

function drawnCity(rng: Rng, xs: readonly BaseCity[]): BaseCity {
  return rng.weighted(xs, (c) => Math.sqrt(c.population));
}

function createPerson(c: Ctx, rng: Rng, o: { country: Country; age: number; roleKind: PersonRole; lod: 1 | 2 | 3; birthCity?: string; ctx?: Parameters<typeof generatePersonality>[2] }): NewPerson {
  let name = generateName(rng, o.country.familyNames);
  const birth = addDays(c.start, -Math.round(o.age * 365.25));
  for (let i = 0; i < 10 && c.seen.has(`${name.full}|${birth}`); i++) name = generateName(rng, o.country.familyNames);
  c.seen.add(`${name.full}|${birth}`);
  const { personality, archetype } = generatePersonality(rng, o.roleKind, o.ctx, c.params.personality.traitMin, c.params.personality.traitMax);
  const p: NewPerson = {
    id: newId(c),
    name: name.full,
    sportingName: name.sporting,
    birth,
    nationality: o.country.id,
    roles: [o.roleKind],
    personality,
    archetype,
    lod: o.lod,
    ...(o.birthCity !== undefined ? { birthCity: o.birthCity } : {}),
  };
  c.batch.people.push(p);
  return p;
}

function portugalCountry(c: Ctx): Country {
  return c.porId.get("pt") as Country;
}

function playerAge(rng: Rng, m: Params["world"]): number {
  return clamp(rng.gauss(m.age.mean, m.age.deviation), m.age.min, m.age.max);
}

/** Escolhe a nacionalidade de um jogador de um clube do escalão. */
function chooseCountry(c: Ctx, rng: Rng, tier: Tier, foreignerP: number, targetQ: number): Country {
  if (!rng.prob(foreignerP)) return portugalCountry(c);
  return rng.weighted(c.foreigners, (p) => weightForPortugal(p, tier) * densityIn(c.densities.get(p.id) as Float64Array, targetQ));
}

function hometown(c: Ctx, rng: Rng, country: Country, club: BaseClub | undefined): string | undefined {
  if (country.id !== "pt" || rng.prob(0.06)) return undefined; // luso-descendentes e naturalizados nascem lá fora
  if (club) {
    const r = rng.float();
    if (r < 0.35) return club.city;
    const district = c.citiesPerDistrict.get(club.district);
    if (r < 0.75 && district && district.length > 0) return drawnCity(rng, district).id;
  }
  return drawnCity(rng, c.cities).id;
}

function createPlayer(
  c: Ctx,
  rng: Rng,
  o: { pos: Position; tier: Tier; targetQ: number; club?: BaseClub; foreignerP: number; lod: 1 | 2; wageScale: number; country?: Country },
): void {
  const m = c.params.world;
  const age = playerAge(rng, m);
  const country = o.country ?? chooseCountry(c, rng, o.tier, o.foreignerP, o.targetQ);
  const birthCity = hometown(c, rng, country, o.club);
  const natural = birthCity !== undefined && birthCity === o.club?.city;
  const person = createPerson(c, rng, {
    country,
    age,
    roleKind: "player",
    lod: o.lod,
    ...(birthCity !== undefined ? { birthCity } : {}),
    ctx: { cityNatural: natural, hardOrigin: country.index < 30 },
  });
  const { current, potential } = potentialEQuality(rng, o.targetQ, age, m);
  const attributes = generateAttributes(rng, o.pos, current, age);
  const j: NewPlayer = {
    person: person.id,
    positions: generatePositions(rng, o.pos, m.secondaryAptitude),
    attributes,
    // o potencial nunca fica abaixo da qualidade realmente medida nos atributos
    potential: Math.round(Math.max(potential, currentQuality(attributes, o.pos)) * 10) / 10,
    ...generateBody(rng, o.pos),
    ...(o.club ? { club: o.club.id } : {}),
    ...(o.club && age <= m.age.trainedAtStartMax ? { trainedAt: o.club.id } : {}),
    state: o.club ? "active" : "free",
  };
  c.batch.players.push(j);
  if (o.club) {
    const years = rng.integer(m.wage.yearsContractMin, m.wage.yearsContractMax);
    const k = rng.integer(0, years - 1);
    const wage = m.wage.average[o.tier] * Math.exp(m.wage.elasticity * (current - m.targetQuality[o.tier].mean)) * o.wageScale;
    const year0 = m.age.min > 0 ? c.params.calendar.initialYear : 2026;
    const ct: NewContract = {
      person: person.id,
      club: o.club.id,
      monthlyWage: Math.max(50, Math.round(wage / 10) * 10),
      start: createDate(year0 - k, 7, 1),
      end: createDate(year0 - k + years, 6, 30),
    };
    c.batch.contracts.push(ct);
  }
}

function createRole(c: Ctx, rng: Rng, fn: RoleFunction, roleKind: PersonRole, meanAge: number, o: { club?: string; city?: string; country?: Country; quality?: Record<string, number>; ctx?: Parameters<typeof generatePersonality>[2]; birthCity?: string }): NewPerson {
  const age = clamp(rng.gauss(meanAge, 8), 24, 75);
  const person = createPerson(c, rng, { country: o.country ?? portugalCountry(c), age, roleKind, lod: 2, ...(o.ctx ? { ctx: o.ctx } : {}), ...(o.birthCity ? { birthCity: o.birthCity } : {}) });
  const role: NewRole = { person: person.id, fn, ...(o.club ? { club: o.club } : {}), ...(o.city ? { city: o.city } : {}), ...(o.quality ? { quality: o.quality } : {}) };
  c.batch.roles.push(role);
  return person;
}

const STAFF_FUNCTIONS: { fn: RoleFunction; areas: string[] }[] = [
  { fn: "coach", areas: ["tactics", "youthDevelopment", "motivation"] },
  { fn: "assistant", areas: ["tactics", "motivation"] },
  { fn: "scout", areas: ["scouting"] },
  { fn: "medical", areas: ["medicine"] },
  { fn: "physio", areas: ["medicine", "fitnessTraining"] },
  { fn: "community", areas: ["fanRelations"] },
];

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s.length === 0 ? 1 : (s[Math.floor(s.length / 2)] as number);
}

export function generateWorld(e: WorldInput): WorldBatch {
  const { params, data } = e;
  const m = params.world;
  const batch: WorldBatch = { people: [], players: [], contracts: [], roles: [] };
  const porId = new Map(e.countries.map((p) => [p.id, p]));
  if (!porId.has("pt")) throw new Error("A tabela de países tem de incluir Portugal (pt)");
  const foreigners = e.countries.filter((p) => p.id !== "pt");
  const densities = new Map(e.countries.map((p) => [p.id, densityTable(p, m.talent)]));
  const citiesPerDistrict = new Map<string, BaseCity[]>();
  for (const cd of data.cities) citiesPerDistrict.set(cd.district, [...(citiesPerDistrict.get(cd.district) ?? []), cd]);
  const c: Ctx = {
    seed: new Rng(e.seed, "world"),
    params,
    countries: e.countries,
    porId,
    foreigners,
    densities,
    cities: data.cities,
    citiesPerDistrict,
    start: createDate(params.calendar.initialYear, 7, 1),
    batch,
    seen: new Set(),
    n: 0,
  };
  const progress = e.onProgress ?? (() => undefined);

  // estatísticas por escalão para normalizar reputação e finanças
  const byTier = new Map<Tier, BaseClub[]>();
  for (const tier of TIERS) byTier.set(tier, data.clubs.filter((cl) => cl.tier === tier));
  const stats = new Map<Tier, { repMin: number; repMax: number; meanRep: number; medianEnd: number }>();
  for (const [tier, cls] of byTier) {
    const reps = cls.map((x) => x.reputation);
    const repMin = Math.min(...reps);
    const repMax = Math.max(...reps);
    const norm = (r: number) => (repMax > repMin ? (r - repMin) / (repMax - repMin) : 0.5);
    stats.set(tier, { repMin, repMax, meanRep: reps.length ? reps.reduce((a, b) => a + norm(b), 0) / reps.length : 0.5, medianEnd: median(cls.map((x) => x.finances)) });
  }

  // ---------- clubes: plantel, treinador, staff, presidente
  const clubs = [...data.clubs].sort((a, b) => (a.id < b.id ? -1 : 1));
  clubs.forEach((cl, i) => {
    progress("clubs", i, clubs.length);
    const rng = c.seed.derive(`clube/${cl.id}`);
    const tier = cl.tier;
    const st = stats.get(tier) as { repMin: number; repMax: number; meanRep: number; medianEnd: number };
    const repNorm = st.repMax > st.repMin ? (cl.reputation - st.repMin) / (st.repMax - st.repMin) : 0.5;
    const target = m.targetQuality[tier];
    const pEstr = clamp(params.foreigners[tier] * (1 + m.variationForeignersReputation * (repNorm - st.meanRep) * 2), 0, 0.95);
    const wageScale = clamp((cl.finances / st.medianEnd) ** 0.4, 0.4, 2.5);
    for (const pos of distributePositions(m.squad[tier], m.placesByPosition)) {
      const targetQ = clamp(rng.gauss(target.mean + m.qualityByReputation * (repNorm - st.meanRep), target.deviation), 1, 20);
      createPlayer(c, rng, { pos, tier, targetQ, club: cl, foreignerP: pEstr, lod: 1, wageScale });
    }
    STAFF_FUNCTIONS.slice(0, m.staffPerClub).forEach(({ fn, areas }) => {
      const quality = Object.fromEntries(areas.map((a) => [a, clamp(Math.round(rng.gauss(target.mean + 0.5, 2)), 1, 20)]));
      const estr = fn === "coach" && rng.prob(Math.min(0.5, pEstr));
      const country = estr ? rng.weighted(foreigners, (p) => weightForPortugal(p, tier)) : undefined;
      createRole(c, rng, fn, fn === "coach" ? "coach" : "staff", fn === "coach" ? 47 : 42, {
        club: cl.id,
        quality,
        ...(country ? { country } : {}),
        ctx: fn === "coach" ? { veteran: rng.prob(0.3) } : {},
      });
    });
    createRole(c, rng, "president", "president", 56, { club: cl.id, city: cl.city, birthCity: cl.city });
  });
  progress("clubs", clubs.length, clubs.length);

  // ---------- autarcas (traços do CSV) e empresários
  const cities = [...data.cities].sort((a, b) => (a.id < b.id ? -1 : 1));
  cities.forEach((cd, i) => {
    progress("cities", i, cities.length);
    const rng = c.seed.derive(`cidade/${cd.id}`);
    createRole(c, rng, "mayor", "mayor", 54, { city: cd.id, birthCity: cd.id, ctx: { fixed: cd.mayor.traits } });
  });
  progress("cities", cities.length, cities.length);

  const othersRng = c.seed.derive("others");
  const othersN = m.others;
  const generateSeveral = (n: number, fn: RoleFunction, roleKind: PersonRole, age: number, byCity: boolean, foreigner = 0) => {
    for (let i = 0; i < n; i++) {
      const cd = byCity ? drawnCity(othersRng, cities) : undefined;
      const country = othersRng.prob(foreigner) ? othersRng.weighted(foreigners, (p) => birthWeight(p) * p.portugalAffinity) : undefined;
      createRole(c, othersRng, fn, roleKind, age, { ...(cd ? { city: cd.id, birthCity: cd.id } : {}), ...(country ? { country } : {}) });
    }
  };
  generateSeveral(othersN.businesspeople, "businessperson", "businessperson", 50, true);
  generateSeveral(othersN.fansOfficials, "fanLeader", "fan", 46, true);
  generateSeveral(othersN.agents, "agent", "agent", 44, false, 0.3);
  generateSeveral(othersN.referees, "referee", "referee", 34, false);
  generateSeveral(othersN.journalists, "journalist", "journalist", 40, false);
  for (let i = 0; i < othersN.freeStaff; i++) {
    const f = othersRng.choose(STAFF_FUNCTIONS);
    createRole(c, othersRng, f.fn, f.fn === "coach" ? "coach" : "staff", 44, {
      quality: Object.fromEntries(f.areas.map((a) => [a, clamp(Math.round(othersRng.gauss(9, 3)), 1, 20)])),
    });
  }
  progress("others", 1, 1);

  // ---------- jogadores sem clube
  const freeRng = c.seed.derive("free");
  const tierWeight: Record<Tier, number> = { firstLeague: 5, secondLeague: 10, thirdLeague: 15, cp: 30, district: 40 };
  for (let i = 0; i < m.free; i++) {
    if (i % 250 === 0) progress("free", i, m.free);
    const tier = freeRng.weighted(TIERS, (x) => tierWeight[x]);
    const target = m.targetQuality[tier];
    const pos = freeRng.weighted([...POSITIONS], (p) => m.placesByPosition[p]);
    const targetQ = clamp(freeRng.gauss(target.mean - 0.7, target.deviation + 0.4), 1, 20);
    createPlayer(c, freeRng, { pos, tier, targetQ, foreignerP: params.foreigners[tier] * 1.1, lod: 2, wageScale: 1 });
  }
  progress("free", m.free, m.free);

  // ---------- ligas estrangeiras (RZ-230): só jogadores, para o olheiro descobrir
  const foreignById = new Map(e.countries.map((p) => [p.id, p]));
  for (const fc of foreignClubs(e.seed, e.countries, params)) {
    const rng = c.seed.derive(`clube/${fc.id}`);
    const country = foreignById.get(fc.country) as Country;
    const target = m.targetQuality[fc.tier];
    const pseudo = { id: fc.id, name: fc.name, city: "", district: "", tier: fc.tier } as unknown as BaseClub;
    const squad = { ...m.squad, [fc.tier]: m.foreignLeagues.squad };
    for (const pos of distributePositions(squad[fc.tier], m.placesByPosition)) {
      const targetQ = clamp(rng.gauss(target.mean + (country.tradition - 70) / 40, target.deviation), 1, 20);
      createPlayer(c, rng, { pos, tier: fc.tier, targetQ, club: pseudo, foreignerP: 0, lod: 2, wageScale: 1, country });
    }
  }
  return batch;
}
