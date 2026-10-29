/** Reforma do staff por idade (treinadores, presidentes, olheiros, árbitros…) e entrada de gente nova no mesmo lugar. Os jogadores têm o seu ciclo em squad/rollover; os autarcas saem por eleição (council/elections). */
import { Rng, clamp } from "../random/rng";
import type { Params } from "../config/parameters";
import type { BaseData } from "../data/types";
import type { Repository } from "../persistence/repository";
import type { IsoDate, PersonRecord, RoleRecord } from "../persistence/types";
import { addDays, ageAt } from "../calendar/dates";
import { generatePersonality, type PersonRole } from "../personality/generate";
import { generateName } from "../world/names";

const ROLE_KIND: Record<string, PersonRole> = {
  coach: "coach", assistant: "staff", medical: "staff", physio: "staff", community: "staff", scout: "staff",
  president: "president", businessperson: "businessperson", fanLeader: "fan", agent: "agent", referee: "referee", journalist: "journalist",
};

export function staffRetirementProbability(fn: string, age: number, params: Params): number {
  const cfg = params.squadCycle.staffRetirement;
  const f = cfg.byFn[fn];
  if (!f) return 0;
  if (age >= f.maxAge) return 1;
  if (age < f.fromAge) return 0;
  return clamp(cfg.baseProbability + cfg.perYear * (age - f.fromAge), 0, 1);
}

/** Fim de época: quem chega à idade da reforma deixa o cargo; o lugar é ocupado por alguém novo (um treinador novo entra livre e os clubes sem treinador contratam-no). Devolve o número de reformados. */
export function staffSuccession(repo: Repository, _data: BaseData, params: Params, season: number, today: IsoDate): number {
  const cfg = params.squadCycle.staffRetirement;
  const seed = repo.meta("seed") ?? "?";
  const people: PersonRecord[] = [];
  const roles: RoleRecord[] = [];
  let next = repo.peopleTotal();
  let retired = 0;
  for (const fn of Object.keys(cfg.byFn).sort()) {
    for (const id of repo.roleHolders(fn)) {
      const person = repo.person(id);
      const role = repo.role(id);
      if (!person || !role) continue;
      const age = ageAt(person.birth, today);
      const rng = new Rng(seed, `staff/${season}/${id}`);
      if (!rng.prob(staffRetirementProbability(fn, age, params))) continue;
      repo.removeRole(id);
      repo.appendEvent({ type: "STAFF_RETIRED", date: today, season, visibility: "exposed", origin: "generated", entities: [{ k: "person", id, roleKind: fn }, ...(role.club ? [{ k: "club" as const, id: role.club }] : [])], data: { fn, age } });
      retired++;
      const nrng = rng.derive("successor");
      const newId = `p${String(++next).padStart(6, "0")}`;
      const name = generateName(nrng, params.squadCycle.youth.nameFamily);
      const entryAge = clamp(nrng.gauss(cfg.byFn[fn]!.entryAge, 5), 26, cfg.byFn[fn]!.fromAge);
      const { personality, archetype } = generatePersonality(nrng, ROLE_KIND[fn] ?? "staff", {}, params.personality.traitMin, params.personality.traitMax);
      people.push({ id: newId, name: name.full, sportingName: name.sporting, birth: addDays(today, -Math.round(entryAge * 365.25)), nationality: person.nationality, ...(person.birthCity ? { birthCity: person.birthCity } : {}), roles: [fn], personality, archetype, lod: 2 });
      const quality = role.quality ? Object.fromEntries(Object.entries(role.quality).map(([k, v]) => [k, clamp(Math.round(v + nrng.gauss(0, 1.5)), 1, 20)])) : undefined;
      roles.push({ person: newId, fn, ...(fn === "coach" ? {} : role.club ? { club: role.club } : {}), ...(role.city ? { city: role.city } : {}), ...(quality ? { quality } : {}) });
    }
  }
  if (people.length > 0) repo.addPeople({ people, players: [], contracts: [], roles });
  return retired;
}
