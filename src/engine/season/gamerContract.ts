/**
 * Contrato do gamer (RZ-161): salário mensal e duração negociados com o presidente do clube, ao aceitar uma oferta (RZ-157)
 * ou ao pedir um aumento no clube atual. A resposta (aceita, contrapropõe, recusa) é determinística: depende da personalidade
 * do presidente, da confiança (tempo no clube), dos resultados, das finanças e do ressentimento de recusas anteriores.
 * Estado no save: meta `gamer.contract` (JSON; só em saves novos) e `gamer.grudge` (ressentimento e data da última).
 */
import { clamp } from "../random/rng";
import type { Params } from "../config/parameters";
import type { BaseClub, BaseData } from "../data/types";
import { clubBalance } from "../club/finances";
import { recentMatches } from "../competition/recent";
import { createDate } from "../calendar/dates";
import type { Repository } from "../persistence/repository";
import type { IsoDate } from "../persistence/types";
import { currentSeason } from "./seasonPyramid";
import { courseLevel, ownsHome } from "../personal/spending";
import { applyContractBudget } from "../club/budget";

export type GamerContract = { club: string; monthlyWage: number; start: IsoDate; end: IsoDate; /** Meses de salário da cláusula de rescisão (saves antigos: o valor por omissão). */ clauseMonths?: number; /** Orçamento de plantel acordado (múltiplos do orçamento por defeito do clube; saves antigos: 1). */ budget?: SquadBudget };
/** Múltiplos do orçamento por defeito: teto da massa salarial e verba de transferências. */
export type SquadBudget = { wage: number; transfers: number };
export type Terms = { monthlyWage: number; years: number; clauseMonths?: number; budget?: SquadBudget };
export type Reply =
  | { result: "accepted"; terms: Terms }
  | { result: "counter"; terms: Terms; reason: Reason }
  | { result: "refused"; reason: Reason };
export type Reason = "budget" | "squad" | "results" | "trust" | "greed" | "grudge" | "generic" | "cooldown" | "tenure";

const dayNumber = (d: string): number => Math.floor(Date.parse(`${d}T00:00:00Z`) / 86400000);
const addYears = (d: IsoDate, years: number): IsoDate => createDate(Number(d.slice(0, 4)) + years, Number(d.slice(5, 7)), Math.min(28, Number(d.slice(8, 10)))) as IsoDate;

export const clauseMonthsOf = (params: Params, c: { clauseMonths?: number } | undefined): number => c?.clauseMonths ?? params.coach.contract.clause.defaultMonths;
/** Valor da cláusula de rescisão do contrato atual. */
export const clauseAmount = (params: Params, c: GamerContract): number => c.monthlyWage * clauseMonthsOf(params, c);

export const budgetOf = (c: { budget?: SquadBudget } | undefined): SquadBudget => c?.budget ?? { wage: 1, transfers: 1 };

/** Máximos do orçamento de plantel que o presidente aceita agora (múltiplos do orçamento por defeito). */
export function budgetCaps(params: Params, max: number): SquadBudget {
  const b = params.coach.contract.budget;
  return { wage: clamp(1 + b.wageSlope * (max - 1), 1, b.maxWage), transfers: clamp(1 + b.transfersSlope * (max - 1), 1, b.maxTransfers) };
}

export const contractOf = (repo: Repository): GamerContract | undefined => {
  const raw = repo.meta("gamer.contract");
  return raw ? (JSON.parse(raw) as GamerContract) : undefined;
};

type Grudge = { value: number; date: IsoDate; lastAsk?: IsoDate };
const grudgeRaw = (repo: Repository): Grudge | undefined => { const r = repo.meta("gamer.grudge"); return r ? (JSON.parse(r) as Grudge) : undefined; };
/** O presidente perdoa: tira ressentimento (ajudar o clube em dificuldades, RZ-162). */
export function relieveGrudge(repo: Repository, params: Params, today: IsoDate, amount: number): void {
  const g = grudgeRaw(repo);
  if (!g) return;
  repo.setMeta("gamer.grudge", JSON.stringify({ value: Math.max(0, grudgeNow(repo, params, today) - amount), date: today, ...(g.lastAsk ? { lastAsk: g.lastAsk } : {}) } satisfies Grudge));
}
/** Ressentimento atual (decai com o tempo). */
export function grudgeNow(repo: Repository, params: Params, today: IsoDate): number {
  const g = grudgeRaw(repo);
  if (!g) return 0;
  const months = Math.max(0, (dayNumber(today) - dayNumber(g.date)) / 30);
  return Math.max(0, g.value - months * params.coach.contract.grudgeDecayPerMonth);
}

/** Salário mensal de referência de um clube (sem negociação). */
export function referenceWage(club: BaseClub, params: Params): number {
  const ct = params.coach.contract;
  const ratio = club.reputation / params.finances.model.refReputation[club.tier];
  return Math.max(300, Math.round((params.world.wage.average[club.tier] * ct.wageFactor * Math.pow(Math.max(0.2, ratio), ct.repExponent)) / 50) * 50);
}

const presidentOf = (repo: Repository, club: string) => repo.publicRoles({ club }).filter((p) => p.fn === "president").map((p) => p.id).sort()[0];

/** Máximo, em múltiplos do salário de referência, que o presidente aceita agora. `current` = o gamer já está no clube. */
export function acceptableRatio(repo: Repository, data: BaseData, params: Params, club: BaseClub, today: IsoDate, current: boolean): { max: number; weakest: Reason } {
  const ct = params.coach.contract;
  const a = ct.accept;
  const pres = presidentOf(repo, club.id);
  const pers = pres ? repo.person(pres)?.personality : undefined;
  const contract = contractOf(repo);
  const tenure = current && contract && contract.club === club.id ? clamp((dayNumber(today) - dayNumber(contract.start)) / ct.trustDays, 0, 1) : 0;
  let ppg = 1.3;
  if (current) {
    const games = recentMatches(repo, data, club.id, 10);
    if (games.length > 0) ppg = games.reduce((s, g) => s + (g.outcome === "win" ? 3 : g.outcome === "draw" ? 1 : 0), 0) / games.length;
  }
  const ref = referenceWage(club, params);
  const terms = {
    trust: a.trust * tenure,
    results: a.results * clamp((ppg - 1.3) / 1.7, -1, 1),
    finances: a.finances * clamp(clubBalance(repo, club) / (ref * 120), -1, 1),
    loyalty: a.loyalty * (((pers?.loyalty ?? 10) - 10) / 10),
    greed: -a.greed * (((pers?.greed ?? 10) - 10) / 10),
    grudge: -grudgeNow(repo, params, today),
    // raízes e formação (RZ-162): casa própria na cidade do clube e cursos de treinador pesam na negociação
    roots: a.roots * (ownsHome(repo, club.city) ? 1 : 0),
    course: a.course * courseLevel(repo, today),
  };
  const max = clamp(a.base + Object.values(terms).reduce((s, x) => s + x, 0), a.min, a.max);
  const weakest = (Object.entries(terms).sort((x, y) => x[1] - y[1])[0]![0]) as keyof typeof terms;
  const reason: Reason = weakest === "finances" ? "budget" : weakest === "loyalty" ? "trust" : weakest === "roots" || weakest === "course" ? "generic" : weakest;
  return { max, weakest: reason };
}

/** A resposta do presidente a uma proposta de salário e duração. Não altera nada. */
export function reply(repo: Repository, data: BaseData, params: Params, club: BaseClub, today: IsoDate, current: boolean, ask: Terms): Reply {
  const ct = params.coach.contract;
  const years = clamp(Math.round(ask.years), ct.yearsMin, ct.yearsMax);
  const ref = referenceWage(club, params);
  const { max, weakest } = acceptableRatio(repo, data, params, club, today, current);
  const cl = ct.clause;
  const months = clamp(Math.round(ask.clauseMonths ?? cl.defaultMonths), cl.min, cl.max);
  // uma cláusula maior que a habitual pesa no que o presidente aceita pagar de salário (e uma menor alivia)
  const ratio = ask.monthlyWage / ref + cl.weight * (months - cl.defaultMonths);
  // orçamento de plantel: o que o presidente dá cresce com a aceitação; pedir mais do que isso é contraproposta
  const bc = ct.budget, caps = budgetCaps(params, max), now = budgetOf(current ? contractOf(repo) : undefined), want = ask.budget ?? now;
  const budget: SquadBudget = { wage: clamp(want.wage, bc.min, Math.max(caps.wage, now.wage)), transfers: clamp(want.transfers, bc.min, Math.max(caps.transfers, now.transfers)) };
  const budgetCut = budget.wage + 1e-9 < want.wage || budget.transfers + 1e-9 < want.transfers;
  if (ratio <= max + 1e-9) {
    const terms = { monthlyWage: Math.round(ask.monthlyWage / 10) * 10, years, clauseMonths: months, budget };
    return budgetCut ? { result: "counter", terms, reason: "squad" } : { result: "accepted", terms };
  }
  if (ratio <= max * ct.counterSlack) return { result: "counter", terms: { monthlyWage: Math.floor(((max - cl.weight * (months - cl.defaultMonths)) * ref) / 10) * 10, years, clauseMonths: months, budget }, reason: weakest };
  return { result: "refused", reason: weakest };
}

function sign(repo: Repository, params: Params, base: BaseClub, today: IsoDate, terms: Terms, kind: "hired" | "raise" | "initial" | "renewed"): void {
  const club = base.id;
  const end = addYears(today, terms.years);
  const before = budgetOf(contractOf(repo)?.club === club ? contractOf(repo) : undefined);
  const budget = terms.budget ?? { wage: 1, transfers: 1 };
  repo.setMeta("gamer.contract", JSON.stringify({ club, monthlyWage: terms.monthlyWage, start: today, end, clauseMonths: terms.clauseMonths ?? params.coach.contract.clause.defaultMonths, budget } satisfies GamerContract));
  // o orçamento acordado passa a valer já (só se mudou: renovar sem mudar não repõe a verba já gasta)
  if (budget.wage !== before.wage || budget.transfers !== before.transfers) applyContractBudget(repo, base, params, currentSeason(repo));
  repo.appendEvent({ type: "GAMER_CONTRACT", date: today, season: currentSeason(repo), visibility: "exposed", origin: "match", entities: [{ k: "club", id: club, roleKind: "contratou" }], data: { kind, monthlyWage: terms.monthlyWage, years: terms.years, clauseMonths: terms.clauseMonths ?? params.coach.contract.clause.defaultMonths, budgetWage: budget.wage, budgetTransfers: budget.transfers } });
}

export const addGrudge = (repo: Repository, params: Params, today: IsoDate, lastAsk?: IsoDate, step: number = params.coach.contract.grudgeStep) => {
  const g: Grudge = { value: grudgeNow(repo, params, today) + step, date: today, ...(lastAsk ? { lastAsk } : grudgeRaw(repo)?.lastAsk ? { lastAsk: grudgeRaw(repo)!.lastAsk! } : {}) };
  repo.setMeta("gamer.grudge", JSON.stringify(g));
};

/** Contrato inicial (novo save): salário de referência e duração por omissão, sem negociação. */
export function signInitial(repo: Repository, params: Params, club: BaseClub, today: IsoDate): void {
  sign(repo, params, club, today, { monthlyWage: referenceWage(club, params), years: params.coach.contract.defaultYears }, "initial");
}

/** Propor condições a um clube que fez oferta: se o presidente aceita, o gamer fica contratado; senão devolve contraproposta ou recusa. */
export function negotiateOffer(repo: Repository, data: BaseData, params: Params, clubId: string, today: IsoDate, ask: Terms): Reply {
  const club = data.clubs.find((c) => c.id === clubId);
  if (!club) throw new Error("Clube desconhecido");
  const r = reply(repo, data, params, club, today, false, ask);
  if (r.result === "refused") addGrudge(repo, params, today);
  return r;
}

/** Pedir um aumento (ou renegociar) no clube atual. */
export function askRaise(repo: Repository, data: BaseData, params: Params, today: IsoDate, ask: Terms): Reply {
  const ct = params.coach.contract;
  const clubId = repo.meta("gamer.club");
  const club = clubId ? data.clubs.find((c) => c.id === clubId) : undefined;
  const contract = contractOf(repo);
  if (!club || !contract) throw new Error("Sem contrato para renegociar");
  if (dayNumber(today) - dayNumber(contract.start) < ct.raiseMinTenureDays) return { result: "refused", reason: "tenure" };
  const last = grudgeRaw(repo)?.lastAsk;
  const expiring = dayNumber(contract.end) - dayNumber(today) <= ct.expiry.noticeDays; // perto do fim renegociar não espera pelo intervalo
  if (last && !expiring && dayNumber(today) - dayNumber(last) < ct.raiseCooldownDays) return { result: "refused", reason: "cooldown" };
  const r = reply(repo, data, params, club, today, true, ask);
  if (r.result === "accepted") { sign(repo, params, club, today, r.terms, "raise"); }
  else if (r.result === "refused") addGrudge(repo, params, today, today);
  else { const g = grudgeRaw(repo); repo.setMeta("gamer.grudge", JSON.stringify({ value: g?.value ?? 0, date: g?.date ?? today, lastAsk: today } satisfies Grudge)); }
  return r;
}

/** Renovação automática no fim do contrato: mantém o salário (ou sobe até ao que o presidente aceita, no máximo ao de referência × `max`). */
export function signRenewal(repo: Repository, params: Params, club: BaseClub, today: IsoDate, terms: Terms): void { sign(repo, params, club, today, terms, "renewed"); }

/** Fecha o contrato de um clube novo depois de o presidente aceitar (chamado por `acceptOffer`). */
export function signHired(repo: Repository, params: Params, club: BaseClub, today: IsoDate, terms: Terms): void { sign(repo, params, club, today, terms, "hired"); }
