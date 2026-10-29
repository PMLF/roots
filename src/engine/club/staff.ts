/**
 * Staff técnico dos clubes (RZ-208): assistentes, olheiros, médicos, fisioterapeutas e responsáveis de comunidade. Todos os anos
 * evoluem com a idade, os bons procuram clubes melhores (e o clube de destino dispensa o pior), os lugares vagos preenchem-se
 * com livres ou gente nova, e entra gente nova no mercado. O clube do gamer só muda por decisão do gamer (contratar/despedir).
 * O treinador principal tem o seu ciclo em `club/coaches.ts`.
 */
import { Rng, clamp } from "../random/rng";
import type { Params, Tier } from "../config/parameters";
import type { BaseData } from "../data/types";
import type { Repository } from "../persistence/repository";
import type { IsoDate, PersonRecord, RoleRecord } from "../persistence/types";
import { ageAt } from "../calendar/dates";
import { newStaff } from "../people/newStaff";

const TIER_ORDER: Tier[] = ["firstLeague", "secondLeague", "thirdLeague", "cp", "district"];
type Vacancy = { club: string; fn: string };
const readVacancies = (repo: Repository): Vacancy[] => JSON.parse(repo.meta("staff.vacancies") ?? "[]") as Vacancy[];

/** Qualidade global (média das áreas) de um profissional, 1-20. */
export function staffRating(repo: Repository, person: string): number {
  const q = repo.role(person)?.quality;
  const v = q ? Object.values(q) : [];
  return v.length === 0 ? 10 : v.reduce((a, b) => a + b, 0) / v.length;
}

const holders = (repo: Repository, fn: string, club: string): string[] => repo.roleHolders(fn).filter((id) => repo.role(id)?.club === club);
const freePool = (repo: Repository, fn: string): string[] => repo.roleHolders(fn).filter((id) => repo.role(id)?.club === undefined);

function event(repo: Repository, type: "STAFF_HIRED" | "STAFF_DISMISSED" | "STAFF_MOVED", date: IsoDate, season: number, person: string, club: string, data: Record<string, unknown>, other?: string): void {
  repo.appendEvent({ type, date, season, visibility: "exposed", origin: "generated", entities: [{ k: "person", id: person, roleKind: String(data.fn) }, { k: "club", id: club }, ...(other ? [{ k: "club" as const, id: other, roleKind: "from" }] : [])], data });
}

export function staffSeasonEnd(repo: Repository, data: BaseData, params: Params, season: number, today: IsoDate, nextTier: ReadonlyMap<string, Tier>, gamerClub?: string): void {
  const cfg = params.staff;
  seedStaffMarket(repo, data, params, today);
  const seed = repo.meta("seed") ?? "?";
  const rng = new Rng(seed, `staff/end/${season}`);
  const tierOf = (club: string) => nextTier.get(club) ?? data.clubs.find((c) => c.id === club)?.tier ?? "district";
  const rank = (club: string) => TIER_ORDER.indexOf(tierOf(club));

  // 1. evolução: sobem os mais novos, descem os mais velhos
  for (const fn of ["coach", ...cfg.functions]) {
    for (const id of repo.roleHolders(fn)) {
      const role = repo.role(id), p = repo.person(id);
      if (!role?.quality || !p) continue;
      const age = ageAt(p.birth, today), r = rng.derive(`dev/${id}`);
      const next = Object.fromEntries(Object.entries(role.quality).map(([k, v]) => [k, clamp(v + (age < cfg.develop.peakAge && r.prob(cfg.develop.gain) ? 1 : 0) - (age >= cfg.develop.declineAge && r.prob(cfg.develop.loss) ? 1 : 0), 1, 20)]));
      if (Object.entries(next).some(([k, v]) => v !== role.quality![k])) repo.setRoleQuality(id, next);
    }
  }

  // 2. carreiras: os bons procuram um clube melhor e o destino dispensa o pior
  const vacancies = readVacancies(repo);
  const clubs = data.clubs.filter((c) => c.id !== gamerClub);
  for (const fn of cfg.functions) {
    for (const id of repo.roleHolders(fn)) {
      const role = repo.role(id);
      if (!role?.club || role.club === gamerClub) continue;
      const r = rng.derive(`career/${id}`);
      if (!r.prob(cfg.career.attempt)) continue;
      const mine = staffRating(repo, id);
      const better = r.shuffle(clubs.filter((c) => rank(c.id) < rank(role.club!))).slice(0, 3);
      for (const dest of better) {
        const there = holders(repo, fn, dest.id).sort((a, b) => staffRating(repo, a) - staffRating(repo, b));
        const worst = there[0];
        if (!worst) continue;
        if (mine < staffRating(repo, worst) + cfg.career.qualityEdge || !r.prob(cfg.career.accept)) continue;
        repo.setRoleClub(worst, null);
        event(repo, "STAFF_DISMISSED", today, season, worst, dest.id, { fn, reason: "replaced" });
        repo.setRoleClub(id, dest.id);
        event(repo, "STAFF_MOVED", today, season, id, dest.id, { fn }, role.club);
        vacancies.push({ club: role.club, fn });
        break;
      }
    }
  }

  // 3. lugares vagos: o melhor livre da função ou gente nova
  const people: PersonRecord[] = [];
  const roles: RoleRecord[] = [];
  let next = repo.peopleTotal();
  const left: Vacancy[] = [];
  for (const v of vacancies) {
    if (v.club === gamerClub) continue;
    if (holders(repo, v.fn, v.club).length > 0 && v.fn !== "scout") continue;
    const pool = freePool(repo, v.fn).sort((a, b) => staffRating(repo, b) - staffRating(repo, a) || (a < b ? -1 : 1));
    const best = pool[0];
    if (best) {
      repo.setRoleClub(best, v.club);
      event(repo, "STAFF_HIRED", today, season, best, v.club, { fn: v.fn, from: "free" });
      continue;
    }
    const id = `p${String(++next).padStart(6, "0")}`;
    const made = newStaff(rng.derive(`fill/${v.club}/${v.fn}`), params, { id, fn: v.fn, today, age: 38, club: v.club });
    people.push(made.person); roles.push(made.role);
    event(repo, "STAFF_HIRED", today, season, id, v.club, { fn: v.fn, from: "new" });
  }
  // 4. gente nova no mercado de livres (sem encher: no máximo o triplo da entrada anual por função)
  const perFn = Math.max(1, Math.round((cfg.entrants.per100Clubs * data.clubs.length) / 100));
  for (const fn of cfg.functions) {
    if (freePool(repo, fn).length >= perFn * 3) continue;
    for (let i = 0; i < perFn; i++) {
      const id = `p${String(++next).padStart(6, "0")}`;
      const r = rng.derive(`entrant/${fn}/${i}`);
      const made = newStaff(r, params, { id, fn, today, age: clamp(r.gauss(cfg.entrants.age, 6), 25, 58) });
      people.push(made.person); roles.push(made.role);
    }
  }
  if (people.length > 0) repo.addPeople({ people, players: [], contracts: [], roles });
  repo.setMeta("staff.vacancies", JSON.stringify(left));
}

/** O mercado de livres começa vazio: a primeira vez que alguém o consulta (ou no primeiro fim de época) enche-se com gente nova. */
export function seedStaffMarket(repo: Repository, data: BaseData, params: Params, today: IsoDate): void {
  if (repo.meta("staff.seeded") === "1") return;
  repo.setMeta("staff.seeded", "1");
  const cfg = params.staff;
  const perFn = Math.max(2, Math.round((cfg.entrants.per100Clubs * data.clubs.length) / 100)) * 2;
  const people: PersonRecord[] = [], roles: RoleRecord[] = [];
  let next = repo.peopleTotal();
  for (const fn of cfg.functions) {
    for (let i = 0; i < perFn; i++) {
      const id = `p${String(++next).padStart(6, "0")}`;
      const r = new Rng(repo.meta("seed") ?? "?", `staff/seed/${fn}/${i}`);
      const made = newStaff(r, params, { id, fn, today, age: clamp(r.gauss(cfg.entrants.age, 8), 25, 58) });
      people.push(made.person); roles.push(made.role);
    }
  }
  repo.addPeople({ people, players: [], contracts: [], roles });
}

// --- o gamer contrata e despede no seu clube ---

export type StaffCandidate = { id: string; name: string; age: number; nationality: string; /** Estimativa da qualidade, 1-20 (com erro). */ estimate: number };

export function staffCandidates(repo: Repository, params: Params, fn: string, club: string, today: IsoDate): StaffCandidate[] {
  const seed = repo.meta("seed") ?? "?";
  return freePool(repo, fn).flatMap((id) => {
    const p = repo.person(id);
    if (!p) return [];
    const err = params.staff.estimateError;
    const noise = (new Rng(seed, `staff/est/${club}/${id}`).float() * 2 - 1) * err;
    return [{ id, name: p.sportingName, age: ageAt(p.birth, today), nationality: p.nationality, estimate: clamp(Math.round(staffRating(repo, id) + noise), 1, 20) }];
  }).sort((a, b) => b.estimate - a.estimate || (a.id < b.id ? -1 : 1));
}

export type StaffResult = { ok: true } | { ok: false; reason: "notYours" | "notFree" | "slotTaken" | "unknown" | "invalid" };

export function hireStaff(repo: Repository, params: Params, club: string, person: string, today: IsoDate, season: number): StaffResult {
  const role = repo.role(person);
  if (!role || !params.staff.functions.includes(role.fn)) return { ok: false, reason: "unknown" };
  if (role.club !== undefined) return { ok: false, reason: "notFree" };
  const slots = role.fn === "scout" ? params.staff.scoutsMax : 1;
  if (holders(repo, role.fn, club).length >= slots) return { ok: false, reason: "slotTaken" };
  repo.setRoleClub(person, club);
  event(repo, "STAFF_HIRED", today, season, person, club, { fn: role.fn, from: "free", gamer: true });
  return { ok: true };
}

export function dismissStaff(repo: Repository, params: Params, club: string, person: string, today: IsoDate, season: number): StaffResult {
  const role = repo.role(person);
  if (!role || !params.staff.functions.includes(role.fn)) return { ok: false, reason: "invalid" };
  if (role.club !== club) return { ok: false, reason: "notYours" };
  repo.setRoleClub(person, null);
  event(repo, "STAFF_DISMISSED", today, season, person, club, { fn: role.fn, reason: "gamer" });
  return { ok: true };
}
