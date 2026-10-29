/** Cria uma pessoa nova com um cargo de staff (reforços do mercado e sucessores de quem se reforma). Puro: devolve os registos, quem chama grava. */
import { Rng, clamp } from "../random/rng";
import type { Params } from "../config/parameters";
import type { IsoDate, PersonRecord, RoleRecord } from "../persistence/types";
import { addDays } from "../calendar/dates";
import { generatePersonality, type PersonRole } from "../personality/generate";
import { generateName } from "../world/names";

const ROLE_KIND: Record<string, PersonRole> = {
  coach: "coach", assistant: "staff", medical: "staff", physio: "staff", community: "staff", scout: "staff",
  president: "president", businessperson: "businessperson", fanLeader: "fan", agent: "agent", referee: "referee", journalist: "journalist",
};

/** Áreas de qualidade de cada função de staff. */
export const STAFF_AREAS: Record<string, string[]> = {
  coach: ["tactics", "youthDevelopment", "motivation"], assistant: ["tactics", "motivation"], scout: ["scouting"],
  medical: ["medicine"], physio: ["medicine", "fitnessTraining"], community: ["fanRelations"],
};

export function newStaff(rng: Rng, params: Params, o: { id: string; fn: string; today: IsoDate; age: number; nationality?: string; birthCity?: string; club?: string; city?: string; quality?: Record<string, number> }): { person: PersonRecord; role: RoleRecord } {
  const name = generateName(rng, params.squadCycle.youth.nameFamily);
  const { personality, archetype } = generatePersonality(rng, ROLE_KIND[o.fn] ?? "staff", {}, params.personality.traitMin, params.personality.traitMax);
  const quality = o.quality ?? Object.fromEntries((STAFF_AREAS[o.fn] ?? []).map((a) => [a, clamp(Math.round(rng.gauss(9.5, 2.5)), 1, 20)]));
  return {
    person: { id: o.id, name: name.full, sportingName: name.sporting, birth: addDays(o.today, -Math.round(o.age * 365.25)), nationality: o.nationality ?? "pt", ...(o.birthCity ? { birthCity: o.birthCity } : {}), roles: [o.fn], personality, archetype, lod: 2 },
    role: { person: o.id, fn: o.fn, ...(o.club ? { club: o.club } : {}), ...(o.city ? { city: o.city } : {}), ...(Object.keys(quality).length > 0 ? { quality } : {}) },
  };
}
