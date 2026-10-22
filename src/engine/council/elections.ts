/**
 * Eleições autárquicas (RZ-236B, docs/CITY.md §12.6). De 4 em 4 anos: a campanha abre `campaignDays` antes do dia, o gamer decide quem
 * apoiar (ou fica neutro) e, no dia, cada cidade escolhe o seu autarca. O resultado depende do humor da cidade, das promessas
 * cumpridas e de quem concorre; o apoio do gamer (por orgulho, notoriedade, resultados e segurança no cargo) só empurra um pouco.
 */
import { Rng, clamp } from "../random/rng";
import { addDays, ageAt, createDate } from "../calendar/dates";
import { COUNCIL_AREAS, type CouncilArea, type CityService, type Params } from "../config/parameters";
import { cityStateNow } from "../city/cities";
import type { BaseClub, BaseData } from "../data/types";
import { generatePersonality } from "../personality/generate";
import type { IsoDate, PersonRecord, RoleRecord } from "../persistence/types";
import type { Repository } from "../persistence/repository";
import { generateName } from "../world/names";
import { agendaOf, AREA_SERVICE, mayorOf, type MayorInfo } from "./agenda";
import { adjustRelation } from "./relation";

export type CandidateKind = "incumbent" | "exMayor" | "retired" | "new";
/** `s`: apoio ao desporto (1-10) com que concorre. */
export type Candidate = { p: string; k: CandidateKind; s: number };
type Election = {
  year: number; date: IsoDate; stage: "campaign" | "done";
  cities: Record<string, Candidate[]>;
  /** A decisão do gamer: id do candidato, `neutral` ou ausente (por decidir). */
  choice?: string;
};
type Term = { person: string; from: number; start: Partial<Record<CityService, number>> };

const KEY = "council.election";
const SERVICES = Object.values(AREA_SERVICE) as CityService[];

export const electionOf = (repo: Repository): Election | undefined => {
  const raw = repo.meta(KEY);
  return raw ? (JSON.parse(raw) as Election) : undefined;
};
const save = (repo: Repository, e: Election): void => repo.setMeta(KEY, JSON.stringify(e));

/** Mandatos de uma cidade (do mais antigo): o primeiro é o autarca de arranque. */
export function termsOf(repo: Repository, data: BaseData, params: Params, city: string): Term[] {
  const raw = repo.meta(`council.terms.${city}`);
  if (raw) return JSON.parse(raw) as Term[];
  const first = repo.publicRoles({ city }).filter((p) => p.fn === "mayor").map((p) => p.id).sort()[0];
  return first ? [{ person: first, from: 1, start: snapshot(repo, data, params, city) }] : [];
}
function snapshot(repo: Repository, data: BaseData, params: Params, city: string): Partial<Record<CityService, number>> {
  const st = cityStateNow(repo, data, params, city);
  return st ? Object.fromEntries(SERVICES.map((s) => [s, Math.round(st[s])])) : {};
}

const dateOf = (year: number, params: Params): IsoDate => createDate(year, params.city.council.election.month, params.city.council.election.day);
const candidatesWanted = (population: number, params: Params): number => params.city.council.election.candidatesBySize.reduce((n, [min, c]) => (population >= min ? c : n), 2);

/** Quanto pesa o apoio do gamer (0-1): orgulho e notoriedade da cidade, resultados da última época e segurança no cargo (paciência do presidente). */
export function gamerWeight(repo: Repository, data: BaseData, params: Params, club: BaseClub): number {
  const w = params.city.council.election.gamer;
  const st = cityStateNow(repo, data, params, club.city);
  const last = repo.clubSeasonRecords(club.id).at(-1);
  const games = last ? last.wins + last.draws + last.losses : 0;
  const results = last && games > 0 ? (last.wins + last.draws / 3) / games : 0.4;
  const president = repo.publicRoles({ club: club.id }).find((p) => p.fn === "president");
  const patience = (president ? repo.person(president.id)?.personality.patience : undefined) ?? 10;
  const security = clamp(patience / 20, 0, 1) * (results >= 0.35 ? 1 : 0.5);
  return clamp(w.pride * ((st?.pride ?? 50) / 100) + w.notoriety * ((st?.notoriety ?? 50) / 100) + w.results * results + w.security * security, 0, 1);
}

/** Pessoa como se fosse autarca: traços e apoio ao desporto com que concorre. */
export function candidateInfo(repo: Repository, c: Candidate): MayorInfo {
  const pers = repo.person(c.p)?.personality;
  return { person: c.p, traits: { ambition: pers?.ambition ?? 10, vanity: pers?.vanity ?? 10, patience: pers?.patience ?? 10, integrity: pers?.integrity ?? 10 }, sportSupport: c.s };
}

/** As prioridades do candidato (sem o humor do momento): o que mais e menos valoriza, e o que promete (as duas maiores). */
export function platformOf(repo: Repository, params: Params, c: Candidate): { most: CouncilArea[]; least: CouncilArea[]; promises: CouncilArea[] } {
  const a = agendaOf(repo.meta("seed") ?? "?", candidateInfo(repo, c), undefined, params);
  const sorted = [...COUNCIL_AREAS].sort((x, y) => a.share[y] - a.share[x]);
  return { most: sorted.slice(0, 2), least: sorted.slice(-2).reverse(), promises: sorted.slice(0, 2) };
}

/** Promessas do mandato que acaba: o serviço prometido não piorou (desporto: metade dos pedidos do gamer passou). */
export function promisesKept(repo: Repository, data: BaseData, params: Params, city: string, term: Term): { kept: number; total: number } {
  const promises = platformOf(repo, params, { p: term.person, k: "incumbent", s: mayorOf(repo, data, city)?.sportSupport ?? 5 }).promises;
  const st = cityStateNow(repo, data, params, city);
  let kept = 0;
  for (const area of promises) {
    const service = AREA_SERVICE[area];
    if (service) { if (st && st[service] >= (term.start[service] ?? 0) - 2) kept++; continue; }
    const asked = JSON.parse(repo.meta("council.requests") ?? "[]") as { mayor: string; area: string; status: string }[];
    const mine = asked.filter((r) => r.mayor === term.person && r.area === area && r.status !== "pending");
    if (mine.length === 0 || mine.filter((r) => r.status === "approved").length * 2 >= mine.length) kept++;
  }
  return { kept, total: promises.length };
}

function newPerson(rng: Rng, id: string, city: string, today: IsoDate, params: Params): { person: PersonRecord; role: RoleRecord } {
  const name = generateName(rng, params.squadCycle.youth.nameFamily);
  const { personality, archetype } = generatePersonality(rng, "mayor", {}, params.personality.traitMin, params.personality.traitMax);
  const age = clamp(rng.gauss(52, 8), 32, 72);
  return {
    person: { id, name: name.full, sportingName: name.sporting, birth: addDays(today, -Math.round(age * 365.25)), nationality: "pt", birthCity: city, roles: ["mayor"], personality, archetype, lod: 2 },
    role: { person: id, fn: "mayor", city },
  };
}

/** Quem concorre numa cidade: o autarca (se quiser), um ex-autarca, um futebolista reformado da região e gente nova até ao número da cidade. */
function drawCandidates(repo: Repository, data: BaseData, params: Params, cityId: string, year: number, today: IsoDate, make: (rng: Rng) => { id: string; s: number }): Candidate[] {
  const el = params.city.council.election;
  const city = data.cities.find((c) => c.id === cityId);
  if (!city) return [];
  const rng = new Rng(repo.meta("seed") ?? "?", `election/${year}/${cityId}`);
  const current = mayorOf(repo, data, cityId);
  const terms = termsOf(repo, data, params, cityId);
  const out: Candidate[] = [];
  if (current && rng.prob(el.pIncumbentRuns)) out.push({ p: current.person, k: "incumbent", s: current.sportSupport });
  const past = [...new Set(terms.map((t) => t.person))].filter((p) => p !== current?.person);
  const back = past.find(() => rng.prob(el.pExMayorRuns));
  if (back) out.push({ p: back, k: "exMayor", s: clamp(Math.round(city.mayor.sportSupport + rng.gauss(0, 1.5)), 1, 10) });
  if (rng.prob(el.pRetiredPlayer)) {
    const region = new Set(data.cities.filter((c) => c.id === cityId || (city.hub && c.hub === city.hub)).map((c) => c.id));
    const pool = [...region].flatMap((c) => repo.playersBornIn(c)).filter((p) => repo.player(p)?.state === "retired" && !out.some((o) => o.p === p) && ageAt(repo.person(p)?.birth ?? today, today) >= el.retiredMinAge).sort();
    const pick = pool.length > 0 ? rng.choose(pool) : undefined;
    if (pick) out.push({ p: pick, k: "retired", s: clamp(Math.round(8 + rng.gauss(0, 1)), 1, 10) });
  }
  const want = candidatesWanted(city.population, params);
  while (out.length < want) { const m = make(rng.derive(`new/${out.length}`)); out.push({ p: m.id, k: "new", s: m.s }); }
  return out.slice(0, want);
}

/** Abre a campanha em todas as cidades; no concelho do gamer guarda a decisão por tomar. */
function startCampaign(repo: Repository, data: BaseData, params: Params, today: IsoDate, year: number): Election {
  const people: PersonRecord[] = [];
  const roles: RoleRecord[] = [];
  let next = repo.peopleTotal();
  const cities: Record<string, Candidate[]> = {};
  for (const city of [...data.cities].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    cities[city.id] = drawCandidates(repo, data, params, city.id, year, today, (rng) => {
      const id = `p${String(++next).padStart(6, "0")}`;
      const made = newPerson(rng, id, city.id, today, params);
      people.push(made.person);
      roles.push(made.role);
      return { id, s: clamp(Math.round(city.mayor.sportSupport + rng.gauss(0, 1.5)), 1, 10) };
    });
  }
  // futebolistas reformados e ex-autarcas já têm pessoa; só os que ainda não têm cargo recebem um (para a ficha os mostrar como autarcas)
  for (const [city, list] of Object.entries(cities)) for (const c of list) if (c.k === "retired" && !repo.role(c.p) && !roles.some((r) => r.person === c.p)) roles.push({ person: c.p, fn: "mayor", city });
  if (people.length > 0 || roles.length > 0) repo.addPeople({ people, players: [], contracts: [], roles });
  const e: Election = { year, date: dateOf(year, params), stage: "campaign", cities };
  save(repo, e);
  return e;
}

/** O gamer apoia um candidato do seu concelho ou fica neutro. */
export function supportCandidate(repo: Repository, data: BaseData, gamer: BaseClub | undefined, candidate: string): { ok: boolean } {
  const e = electionOf(repo);
  if (!e || e.stage !== "campaign" || !gamer || e.choice !== undefined) return { ok: false };
  if (candidate !== "neutral" && !(e.cities[gamer.city] ?? []).some((c) => c.p === candidate)) return { ok: false };
  save(repo, { ...e, choice: candidate });
  return { ok: true };
}

/** Há uma campanha no concelho do gamer à espera da decisão dele? */
export function campaignPending(repo: Repository, gamer: BaseClub | undefined): Election | undefined {
  const e = electionOf(repo);
  return e && e.stage === "campaign" && gamer && e.choice === undefined && (e.cities[gamer.city]?.length ?? 0) > 0 ? e : undefined;
}

function resolveCity(repo: Repository, data: BaseData, params: Params, e: Election, cityId: string, gamer: BaseClub | undefined, season: number): { winner: Candidate; scores: Map<string, number> } | undefined {
  const el = params.city.council.election;
  const list = e.cities[cityId] ?? [];
  if (list.length === 0) return undefined;
  const rng = new Rng(repo.meta("seed") ?? "?", `election/vote/${e.year}/${cityId}`);
  const st = cityStateNow(repo, data, params, cityId);
  const mood = st ? (SERVICES.reduce((s, k) => s + st[k], 0) / SERVICES.length - 50) / 50 : 0;
  const terms = termsOf(repo, data, params, cityId);
  const term = terms.at(-1);
  const kept = term ? promisesKept(repo, data, params, cityId, term) : { kept: 0, total: 0 };
  const promiseTerm = kept.total > 0 ? (kept.kept - (kept.total - kept.kept)) / kept.total : 0;
  const backed = gamer && gamer.city === cityId && e.choice && e.choice !== "neutral" ? e.choice : undefined;
  const shift = gamer && backed ? el.gamer.maxShift * gamerWeight(repo, data, params, gamer) : 0;
  const scores = new Map<string, number>();
  for (const c of list) {
    let s = rng.derive(c.p).gauss(0, el.vote.noise);
    if (c.k === "incumbent") s += el.vote.incumbent + el.vote.mood * mood + el.vote.promises * promiseTerm;
    if (c.k === "exMayor") s += el.vote.exMayor;
    if (c.k === "retired") s += el.vote.retired;
    if (backed === c.p) s += shift;
    scores.set(c.p, s);
  }
  const winner = [...list].sort((a, b) => (scores.get(b.p) as number) - (scores.get(a.p) as number) || (a.p < b.p ? -1 : 1))[0] as Candidate;
  void season;
  return { winner, scores };
}

/** O dia das eleições: cada cidade escolhe, o mandato novo abre e o gamer sente o efeito do seu apoio. */
function resolve(repo: Repository, data: BaseData, params: Params, e: Election, gamer: BaseClub | undefined, today: IsoDate, season: number): void {
  const el = params.city.council.election;
  for (const city of data.cities) {
    const r = resolveCity(repo, data, params, e, city.id, gamer, season);
    if (!r) continue;
    const before = mayorOf(repo, data, city.id);
    const terms = termsOf(repo, data, params, city.id);
    const own = gamer?.city === city.id;
    // consequências para o gamer, no concelho dele
    if (own && gamer) {
      const term = terms.at(-1);
      if (term) {
        const k = promisesKept(repo, data, params, city.id, term);
        if (k.total > 0) adjustRelation(repo, params, term.person, k.kept * 2 >= k.total ? el.relation.promiseKept : el.relation.promiseBroken, k.kept * 2 >= k.total ? "promiseKept" : "promiseBroken");
      }
      const choice = e.choice;
      if (choice && choice !== "neutral") adjustRelation(repo, params, r.winner.p, choice === r.winner.p ? el.relation.backed : el.relation.backedRival, choice === r.winner.p ? "backed" : "backedRival");
      else for (const c of e.cities[city.id] ?? []) {
        if (c.p === r.winner.p || !repo.meta(`council.relation.${c.p}`)) continue;
        adjustRelation(repo, params, c.p, el.relation.neutralLost, "neutralLost");
      }
      repo.appendEvent({
        type: "ELECTION_RESULT", date: today, season, visibility: "exposed", origin: "generated",
        entities: [{ k: "city", id: city.id }, { k: "person", id: r.winner.p, roleKind: "mayor" }, { k: "club", id: gamer.id }],
        data: { winner: r.winner.p, kind: r.winner.k, reelected: before?.person === r.winner.p ? 1 : 0, backed: choice && choice !== "neutral" ? (choice === r.winner.p ? "winner" : "rival") : "neutral" },
      });
    }
    repo.setMeta(`council.mayor.${city.id}`, JSON.stringify({ person: r.winner.p, sportSupport: r.winner.s }));
    if (before?.person !== r.winner.p) repo.setMeta(`council.terms.${city.id}`, JSON.stringify([...terms, { person: r.winner.p, from: season, start: snapshot(repo, data, params, city.id) } satisfies Term]));
    else if (terms.length > 0) repo.setMeta(`council.terms.${city.id}`, JSON.stringify(terms.map((t, i) => (i === terms.length - 1 ? { ...t, start: snapshot(repo, data, params, city.id) } : t))));
  }
  save(repo, { ...e, stage: "done" });
}

/** Todos os dias: abre a campanha na altura certa e conta os votos no dia das eleições. */
export function dailyElections(repo: Repository, data: BaseData, params: Params, gamer: BaseClub | undefined, today: IsoDate, season: number): void {
  const el = params.city.council.election;
  let e = electionOf(repo);
  const nextYear = e ? e.year + params.city.yearsMunicipalElections : params.city.sinceTerm + params.city.yearsMunicipalElections;
  if ((!e || e.stage === "done") && today >= addDays(dateOf(nextYear, params), -el.campaignDays)) {
    e = startCampaign(repo, data, params, today, nextYear);
    if (gamer && (e.cities[gamer.city]?.length ?? 0) > 0) {
      repo.appendEvent({
        type: "ELECTION_CAMPAIGN", date: today, season, visibility: "exposed", origin: "generated",
        entities: [{ k: "city", id: gamer.city }, { k: "club", id: gamer.id }],
        data: { date: e.date, year: e.year },
      });
    }
  }
  if (e && e.stage === "campaign" && today >= e.date) resolve(repo, data, params, e, gamer, today, season);
}
