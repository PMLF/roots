import type { Params, Tier } from "../config/parameters";
import type { BaseClub, BaseData } from "../data/types";
import type { Repository } from "../persistence/repository";
import type { IsoDate } from "../persistence/types";
import { dayNumber, fromDayNumber } from "../calendar/dates";
import { agentTraits } from "../agent/assign";
import { ageAt } from "../calendar/dates";
import { marketValue } from "../market/value";
import { clamp } from "../random/rng";
import { currentQuality } from "../world/player";
import type { Attributes, Position } from "../world/types";
import { wageFor } from "./youth";

/** Condições de um contrato de renovação: ordenado mensal, anos e cláusula de rescisão (`null` = sem cláusula). */
export type RenewalTerms = { wage: number; years: number; release: number | null };
/** Pedido do jogador (e do agente) para renovar, mais o teto de cláusula que o agente aceita. */
export type RenewalAsk = RenewalTerms & { releaseCeiling: number };
/** Decisão do gamer sobre um contrato a expirar: renovar com estas condições ou deixar sair. */
export type RenewalDecision = ({ kind: "renew" } & RenewalTerms) | { kind: "release" };
/** Estado da negociação com o agente: rondas feitas e, se acabou sem acordo, porquê. */
export type NegotiationState = { round: number; closed?: NegotiationClosed; /** Dia em que o agente voltou a falar (fecho = 1 mês depois). */ reopens?: IsoDate; accepted?: boolean };
export type NegotiationClosed = "refused" | "level" | "distance";
export type NegotiationReply =
  | { status: "accepted"; terms: RenewalTerms }
  | { status: "counter"; terms: RenewalTerms; round: number; roundsLeft: number; reason?: "distance" }
  | { status: "closed"; reason: NegotiationClosed; reopens?: IsoDate };

const key = (season: number | string, person: string) => `renewal.${season}.${person}`;

export function decisionOf(repo: Repository, season: number, person: string): RenewalDecision | undefined {
  const raw = repo.meta(key(season, person));
  return raw ? (JSON.parse(raw) as RenewalDecision) : undefined;
}

const negKey = (season: number | string, person: string) => `renewal.negotiation.${season}.${person}`;

export function negotiationOf(repo: Repository, season: number | string, person: string): NegotiationState {
  const raw = repo.meta(negKey(season, person));
  return raw ? (JSON.parse(raw) as NegotiationState) : { round: 0 };
}

function saveNegotiation(repo: Repository, season: number | string, person: string, n: NegotiationState): void {
  repo.setMeta(negKey(season, person), JSON.stringify(n));
}

export function setDecision(repo: Repository, season: number, person: string, d: RenewalDecision): void {
  repo.setMeta(key(season, person), JSON.stringify(d));
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s.length === 0 ? 1 : (s[Math.floor(s.length / 2)] as number);
}

/** Pedido de renovação: a fórmula do escalão, mais cara com agente ganancioso, e nunca abaixo de 95 % do ordenado atual. */
export function renewalAsk(repo: Repository, data: BaseData, params: Params, club: BaseClub, person: string): RenewalAsk | undefined {
  const j = repo.player(person);
  const ct = repo.contract(person);
  const pos = j?.positions[0]?.pos;
  if (!j || !pos) return undefined;
  const tier: Tier = club.tier;
  const sameTier = data.clubs.filter((c) => c.tier === tier);
  const wageScale = clamp((club.finances / median(sameTier.map((c) => c.finances))) ** 0.4, 0.4, 2.5);
  const quality = currentQuality(j.attributes as Attributes, pos as Position);
  const ag = agentTraits(repo, j.agent);
  const agentFactor = ag ? 1 + params.market.agents.wageByGreed * (ag.greed - params.market.agents.greedPivot) : 1;
  const formula = wageFor(params, tier, quality, wageScale) * params.squadCycle.contracts.renewalWageFactor * agentFactor;
  const wage = Math.max(50, Math.round(Math.max(formula, (ct?.monthlyWage ?? 0) * 0.95) / 10) * 10);
  const ref = releaseReference(repo, params, person, wage);
  return { wage, years: params.squadCycle.contracts.negotiation.askYears, release: ref, releaseCeiling: Math.round((ref * params.squadCycle.contracts.negotiation.clauseCeiling) / 1000) * 1000 };
}

/** Cláusula «normal» para este jogador: o valor de mercado vezes o meio do intervalo de cláusulas do mundo. */
function releaseReference(repo: Repository, params: Params, person: string, wage: number): number {
  const j = repo.player(person);
  const p = repo.person(person);
  const pos = j?.positions[0]?.pos;
  if (!j || !p || !pos) return 0;
  const [lo, hi] = params.market.clauses.releaseFactor;
  const value = marketValue({ quality: currentQuality(j.attributes as Attributes, pos as Position), potential: j.potential, age: ageAt(p.birth, repo.meta("date.today") ?? p.birth), monthlyWage: wage, monthsLeft: 24 }, params);
  return Math.max(1000, Math.round((value * (lo + hi)) / 2 / 1000) * 1000);
}

/** Quanto ordenado a mais (fração) o agente pede conforme a cláusula: mais alta ou inexistente sai mais cara; mais baixa, mais barata. */
export function clauseFactor(params: Params, release: number | null, reference: number): number {
  const n = params.squadCycle.contracts.negotiation;
  const ratio = release === null ? n.noClauseRatio : release / Math.max(1, reference);
  return clamp(1 + n.clauseWage * (ratio - 1), 0.95, 1.25);
}

/** Quanto do pedido o jogador aceita (fração): a lealdade e ser da terra baixam o patamar. */
export function acceptFloor(repo: Repository, params: Params, club: BaseClub, person: string): number {
  const n = params.squadCycle.contracts.negotiation;
  const p = repo.person(person);
  const loyalty = p?.personality.loyalty ?? 10;
  const native = p?.birthCity !== undefined && p.birthCity === club.city;
  return clamp(n.acceptFloor - n.floorByLoyalty * (loyalty - 10) - (native ? n.floorNative : 0), n.floorMin, 1);
}

/** Interesse do jogador em renovar com este clube: muito acima do nível do clube (e ambicioso) não quer; em escalões baixos, de outro distrito, só fica se o ordenado compensar. */
export function renewalInterest(repo: Repository, data: BaseData, params: Params, club: BaseClub, person: string): { interested: false; reason: "level" } | { interested: true; minWage?: number } {
  const n = params.squadCycle.contracts.negotiation;
  const p = repo.person(person);
  const j = repo.player(person);
  const pos = j?.positions[0]?.pos;
  if (!p || !j || !pos) return { interested: true };
  const native = p.birthCity !== undefined && p.birthCity === club.city;
  const ambition = p.personality.ambition ?? 10;
  const loyalty = p.personality.loyalty ?? 10;
  const quality = currentQuality(j.attributes as Attributes, pos as Position);
  const tq = params.world.targetQuality[club.tier];
  if (quality > tq.mean + n.level.margin * tq.deviation && ambition >= n.level.ambitionMin && loyalty < n.level.loyaltyStay && !native) return { interested: false, reason: "level" };
  if (n.distance.tiers.includes(club.tier) && !native && loyalty < n.distance.loyaltyStay) {
    const from = p.birthCity ? data.cities.find((c) => c.id === p.birthCity)?.district : undefined;
    if (from !== club.district) return { interested: true, minWage: Math.round((params.world.wage.average[club.tier] * n.distance.wageFactor) / 10) * 10 };
  }
  return { interested: true };
}

/** O dia 30 dias depois de `d` (vazio se não há data). */
function monthAfter(d: string): IsoDate | undefined {
  return d ? fromDayNumber(dayNumber(d as IsoDate) + 30) : undefined;
}

/** Valores sugeridos para os campos da proposta, à medida do jogador: ordenados à volta do meio entre o atual e o pedido e cláusulas em torno da referência. */
export function renewalSuggestions(ask: RenewalAsk, currentWage: number): { wages: number[]; releases: number[] } {
  const base = (currentWage + ask.wage) / 2;
  const nice = (v: number) => {
    const step = 10 ** Math.max(1, Math.floor(Math.log10(Math.max(v, 10))) - 1);
    return Math.max(50, Math.round(v / step) * step);
  };
  const wages = [...new Set([0.75, 0.9, 1, 1.1, 1.25, 1.5, 2].map((m) => nice(base * m)))].sort((a, b) => a - b);
  const ref = ask.release ?? 0;
  const releases = ref > 0 ? [...new Set([0.5, 1, 1.5, 2, 3].map((m) => nice(ref * m)))].sort((a, b) => a - b) : [];
  return { wages, releases };
}

/** Uma ronda de negociação: o agente aceita, contrapropõe (mexe no ordenado e, se preciso, nos anos e na cláusula) ou fecha a porta. */
export function negotiateRenewal(repo: Repository, data: BaseData, params: Params, club: BaseClub, season: number | string, person: string, offer: RenewalTerms, extra: { minWage?: number } = {}): NegotiationReply | undefined {
  const n = params.squadCycle.contracts.negotiation;
  let state = negotiationOf(repo, season, person);
  const today = repo.meta("date.today") ?? "";
  if (state.closed) {
    // o agente só volta a falar passado um mês; depois recomeça-se do zero
    if (state.reopens && today >= state.reopens) { state = { round: 0 }; saveNegotiation(repo, season, person, state); }
    else return { status: "closed", reason: state.closed, ...(state.reopens ? { reopens: state.reopens } : {}) };
  }
  const ask = renewalAsk(repo, data, params, club, person);
  if (!ask) return undefined;
  const interest = renewalInterest(repo, data, params, club, person);
  if (!interest.interested) {
    const reopens = monthAfter(today);
    saveNegotiation(repo, season, person, { ...state, closed: interest.reason, ...(reopens ? { reopens } : {}) });
    return { status: "closed", reason: interest.reason, ...(reopens ? { reopens } : {}) };
  }
  const years = clamp(Math.round(offer.years), 1, n.maxYears);
  const reference = ask.release ?? 0;
  const clause = offer.release !== null && offer.release > ask.releaseCeiling ? ask.releaseCeiling : offer.release;
  const clauseOk = clause === offer.release;
  const base = Math.round((ask.wage * acceptFloor(repo, params, club, person) * clauseFactor(params, offer.release, reference)) / 10) * 10;
  const floorWage = Math.max(interest.minWage ?? 0, extra.minWage ?? 0) || undefined;
  const reserve = Math.max(base, floorWage ?? 0);
  const distanceBound = floorWage !== undefined && floorWage >= base;
  if (offer.wage >= reserve && clauseOk) {
    saveNegotiation(repo, season, person, { ...state, accepted: true });
    return { status: "accepted", terms: { wage: Math.round(offer.wage), years, release: offer.release } };
  }
  const round = state.round + 1;
  if ((offer.wage < reserve && offer.wage < ask.wage * n.walkAway) || round > n.maxRounds) {
    const reason = distanceBound ? "distance" : "refused";
    const reopens = monthAfter(today);
    saveNegotiation(repo, season, person, { round, closed: reason, ...(reopens ? { reopens } : {}) });
    return { status: "closed", reason, ...(reopens ? { reopens } : {}) };
  }
  const demand = ask.wage * clauseFactor(params, clause, reference);
  const wage = offer.wage >= reserve ? Math.round(offer.wage) : Math.max(reserve, Math.round((offer.wage + (demand - offer.wage) * n.concession ** round) / 10) * 10);
  const counterYears = Math.abs(years - ask.years) >= 2 ? ask.years : years;
  saveNegotiation(repo, season, person, { round });
  return { status: "counter", terms: { wage, years: counterYears, release: clause }, round, roundsLeft: n.maxRounds - round, ...(distanceBound ? { reason: "distance" as const } : {}) };
}

/** Jogadores do clube cujo contrato acaba antes do início da próxima época. */
export function expiringPlayers(repo: Repository, club: string, nextSeasonStart: IsoDate): string[] {
  return repo.clubPlayers(club).filter((j) => (repo.contract(j.person)?.end ?? "9999-12-31") < nextSeasonStart).map((j) => j.person);
}
