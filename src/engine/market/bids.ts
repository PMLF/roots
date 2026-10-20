/**
 * Propostas do gamer por jogadores de outros clubes (RZ-231). Duas conversas, uma a seguir à outra:
 * 1. com o clube vendedor, sobre o valor (livres saltam este passo; pagar a cláusula de rescisão dispensa o acordo do clube);
 * 2. com o agente do jogador, sobre o contrato (o mesmo motor das renovações, com o clube do gamer como comprador).
 * Com acordo, o jogador muda-se já se a janela está aberta; senão fica combinado («vai mudar-se para X em Y») e muda na abertura.
 * Quanto mais se sabe do jogador (observações do olheiro), mais certeiras são as sugestões de valores do popup.
 */
import { addDays } from "../calendar/dates";
import { clubBalance, monthlyWageBill, post } from "../club/finances";
import { adjustTransfers, clubBudget } from "../club/budget";
import type { Params, Tier } from "../config/parameters";
import type { BaseClub, BaseData } from "../data/types";
import type { Repository } from "../persistence/repository";
import type { ContractClauses, IsoDate } from "../persistence/types";
import { Rng, clamp } from "../random/rng";
import { scoutedLevel } from "../scouting/scouting";
import { agentTraits } from "../agent/assign";
import { contractDates } from "../squad/youth";
import { acceptFloor, negotiateRenewal, negotiationOf, renewalAsk, renewalSuggestions, type NegotiationReply, type RenewalTerms } from "../squad/renewals";
import { currentQuality } from "../world/player";
import { isForeignClub } from "../world/foreign";
import type { Attributes, Position } from "../world/types";
import { foreignClubList } from "../squad/foreign";
import { localBlock, lockLocalSigning } from "../squad/localPriority";
import { marketValue } from "./value";
import { windowAt } from "./market";
import { isImportantFee } from "./newsworthy";

export type BidStage = "club" | "agent" | "agreed" | "closed" | "done";
export type BidClosed = "refused" | "squad" | "level" | "distance" | "cash" | "gone";
export type Bid = {
  id: number;
  person: string;
  /** Clube vendedor (nacional ou estrangeiro); sem valor = livre. */
  seller?: string;
  stage: BidStage;
  created: IsoDate;
  clubRound: number;
  /** Valor acordado com o clube. */
  fee?: number;
  /** Último pedido do clube (contraproposta). */
  ask?: number;
  terms?: RenewalTerms;
  commission?: number;
  closed?: BidClosed;
  /** Proposta enviada à espera de resposta: chega na data `due` (um a dois dias; no último dia da janela é logo). */
  pending?: { kind: "fee"; fee: number; due: IsoDate } | { kind: "terms"; terms: RenewalTerms; due: IsoDate };
  /** Última resposta recebida (para o popup e a caixa de entrada). */
  lastReply?: { status: "accepted" | "counter" | "closed" | "blocked"; kind: "fee" | "terms"; date: IsoDate; reason?: string; terms?: RenewalTerms };
  /** Últimas condições que o gamer enviou ao agente (para assinalar o que o agente mexeu). */
  lastTerms?: RenewalTerms;
  /** Dia em que o agente aceitou: o gamer tem `bids.confirmDays` para confirmar a transferência. */
  agreedOn?: IsoDate;
  /** Acordo com o clube: o agente só atende a partir desta data (no dia seguinte; no último dia da janela é logo). */
  agentFrom?: IsoDate;
  /** Acordo com o agente: a transferência só se confirma a partir desta data (no dia seguinte; no último dia da janela é logo). */
  confirmFrom?: IsoDate;
  /** A mensagem do acordo com o agente já foi para a caixa de entrada. */
  notified?: boolean;
  /** O clube/agente só volta a falar depois desta data. */
  reopens?: IsoDate;
  /** Acordo fechado fora da janela: o jogador muda-se nesta data. */
  moving?: { club: string; date: IsoDate };
};

const KEY = "market.bids";
export const bids = (repo: Repository): Bid[] => {
  const raw = repo.meta(KEY);
  return raw ? (JSON.parse(raw) as Bid[]) : [];
};
const save = (repo: Repository, list: Bid[]) => repo.setMeta(KEY, JSON.stringify(list));
const update = (repo: Repository, bid: Bid) => save(repo, bids(repo).map((b) => (b.id === bid.id ? bid : b)));
export const bidFor = (repo: Repository, person: string): Bid | undefined => bids(repo).filter((b) => b.person === person && b.stage !== "done").pop();
/** Jogadores com um acordo fechado: o mercado da IA não lhes toca. */
export const lockedPlayers = (repo: Repository): Set<string> => new Set(bids(repo).filter((b) => b.stage === "agreed").map((b) => b.person));
export const bidKey = (b: Bid): string => `bid.${b.id}`;

const TIER_ORDER: Tier[] = ["firstLeague", "secondLeague", "thirdLeague", "cp", "district"];

const monthsLeft = (repo: Repository, person: string, today: IsoDate): number => {
  const c = repo.contract(person);
  return c ? Math.max(0, (Date.parse(c.end) - Date.parse(today)) / (30.44 * 86400000)) : 0;
};

/** Valor de mercado do jogador hoje (livres valem zero em transferência). */
export function valueOf(repo: Repository, params: Params, person: string, today: IsoDate): number {
  const j = repo.player(person);
  const p = repo.person(person);
  const ct = repo.contract(person);
  const pos = j?.positions[0]?.pos;
  if (!j || !p || !ct || !pos || j.club === undefined) return 0;
  const age = (Date.parse(today) - Date.parse(p.birth)) / (365.25 * 86400000);
  return marketValue({ quality: currentQuality(j.attributes as Attributes, pos as Position), potential: j.potential, age, monthlyWage: ct.monthlyWage, monthsLeft: monthsLeft(repo, person, today) }, params);
}

const presidentGreed = (repo: Repository, club: string): number => {
  const p = repo.publicRoles({ club }).find((x) => x.fn === "president");
  return (p ? repo.person(p.id)?.personality.greed : undefined) ?? 10;
};

/** Preço pedido pelo clube vendedor: valor × (base + ganância do presidente); mais 25 % se for dos titulares. */
export function sellerAsk(repo: Repository, data: BaseData, params: Params, bid: Bid, today: IsoDate): number {
  if (!bid.seller) return 0;
  const mk = params.market;
  const value = valueOf(repo, params, bid.person, today);
  const greed = isForeignClub(bid.seller) ? 10 : presidentGreed(repo, bid.seller);
  const pos = repo.player(bid.person)?.positions[0]?.pos;
  const quality = (id: string) => { const j = repo.player(id); const ps = j?.positions[0]?.pos; return j && ps ? currentQuality(j.attributes as Attributes, ps as Position) : 0; };
  const squad = repo.clubPlayers(bid.seller);
  const mine = quality(bid.person);
  const better = squad.filter((x) => x.person !== bid.person && quality(x.person) > mine).length;
  const mates = squad.filter((x) => x.positions[0]?.pos === pos);
  const starter = mates.filter((x) => quality(x.person) > mine).length < 2;
  const importance = mk.bids.importance.find(([rank]) => better <= rank)?.[1] ?? 1;
  const seller = data.clubs.find((c) => c.id === bid.seller);
  const tq = seller ? params.world.targetQuality[seller.tier] : undefined;
  const premium = tq ? 1 + mk.bids.qualityPremium * Math.max(0, (mine - tq.mean) / tq.deviation) : 1;
  const mult = isForeignClub(bid.seller) ? 1 : importance * (starter ? 1.1 : 1) * premium;
  return Math.round((value * (mk.askBase + mk.askByGreed * (greed - 10)) * mult) / 1000) * 1000;
}

export type OpenError = "own" | "invalid" | "retired" | "prospect" | "locked";

export function openBid(repo: Repository, data: BaseData, params: Params, club: BaseClub, today: IsoDate, person: string): { ok: true; bid: Bid } | { ok: false; reason: OpenError } {
  const j = repo.player(person);
  if (!j || !repo.person(person)) return { ok: false, reason: "invalid" };
  if (j.state === "retired") return { ok: false, reason: "retired" };
  if (j.club === club.id) return { ok: false, reason: "own" };
  // a terra tem a primeira escolha dos seus jovens (RZ-256)
  const blocked = localBlock(repo, person, club, today);
  if (blocked) return { ok: false, reason: blocked };
  const open = bidFor(repo, person);
  // negociação em curso, ou porta fechada há menos de um mês: mostra-se o estado atual
  if (open && (open.stage !== "closed" || (open.reopens && today < open.reopens))) return { ok: true, bid: open };
  const bid: Bid = { id: Math.max(0, ...bids(repo).map((x) => x.id)) + 1, person, ...(j.club ? { seller: j.club } : {}), stage: j.club ? "club" : "agent", created: today, clubRound: 0 };
  save(repo, [...bids(repo).filter((x) => x.id !== open?.id), bid]);
  return { ok: true, bid };
}

/** Desistir: sem rondas feitas apaga a proposta; com rondas, a porta fecha um mês. */
export function cancelBid(repo: Repository, params: Params, today: IsoDate, bid: Bid): void {
  if (bid.stage === "done" || (bid.stage === "agreed" && bid.moving)) return;
  if (bid.stage === "agreed") { update(repo, { ...bid, stage: "closed", closed: "refused", reopens: addDays(today, params.market.bids.waitDays) }); return; }
  const started = bid.clubRound > 0 || negotiationOf(repo, bidKey(bid), bid.person).round > 0;
  if (!started) save(repo, bids(repo).filter((x) => x.id !== bid.id));
  else update(repo, { ...bid, stage: "closed", closed: "refused", reopens: addDays(today, params.market.bids.waitDays) });
}

/** Quanta informação o gamer tem sobre o jogador, 0-1. */
export const informationOf = (repo: Repository, person: string): number => (scoutedLevel(repo, person) === "month" ? 1 : scoutedLevel(repo, person) === "week" ? 0.5 : 0);

const nice = (v: number) => {
  const step = 10 ** Math.max(2, Math.floor(Math.log10(Math.max(v, 100))) - 1);
  return Math.max(0, Math.round(v / step) * step);
};

/** Valores sugeridos para o clube: à volta do pedido, deslocados pelo erro de quem sabe pouco (sem informação, até ±`suggestionNoise`). */
export function feeSuggestions(repo: Repository, data: BaseData, params: Params, bid: Bid, today: IsoDate): number[] {
  const ask = bid.ask ?? sellerAsk(repo, data, params, bid, today);
  const sigma = params.market.bids.suggestionNoise * (1 - informationOf(repo, bid.person));
  const shift = sigma > 0 ? clamp(new Rng(repo.meta("seed") ?? "?", `bid/${bid.person}`).gauss(0, sigma), -sigma * 2, sigma * 2) : 0;
  return [...new Set([0.7, 0.85, 1, 1.15, 1.3].map((m) => nice(ask * (1 + shift) * m)))].filter((v) => v > 0).sort((a, b) => a - b);
}

export type ClubReply =
  | { status: "accepted"; fee: number }
  | { status: "counter"; fee: number; round: number; roundsLeft: number }
  | { status: "closed"; reason: BidClosed; reopens?: IsoDate };

/** Uma ronda com o clube vendedor sobre o valor. */
export function clubOffer(repo: Repository, data: BaseData, params: Params, club: BaseClub, today: IsoDate, bid: Bid, fee: number): ClubReply {
  const b = params.market.bids;
  const close = (reason: BidClosed): ClubReply => {
    const reopens = addDays(today, b.waitDays);
    update(repo, { ...bid, stage: "closed", closed: reason, reopens });
    return { status: "closed", reason, reopens };
  };
  const release = repo.contract(bid.person)?.clauses?.release;
  const paid = (v: number) => {
    if (clubBalance(repo, club) < v) return false;
    return true;
  };
  if (release !== undefined && fee >= release) {
    if (!paid(release)) return close("cash");
    update(repo, { ...bid, stage: "agent", fee: release, ask: release, agentFrom: nextPhaseDay(params, today) });
    return { status: "accepted", fee: release };
  }
  const seller = data.clubs.find((c) => c.id === bid.seller);
  if (seller) {
    const size = repo.clubPlayers(seller.id).filter((j) => j.state === "active").length;
    if (size - 1 < params.world.squad[seller.tier] - 2) return close("squad");
  }
  const ask = sellerAsk(repo, data, params, bid, today);
  // quem aceita o que o clube acabou de pedir não leva nova contraproposta
  if (fee >= ask || (bid.clubRound > 0 && bid.ask !== undefined && fee >= bid.ask)) {
    if (!paid(fee)) return close("cash");
    update(repo, { ...bid, stage: "agent", fee, ask: fee, agentFrom: nextPhaseDay(params, today) });
    return { status: "accepted", fee };
  }
  const round = bid.clubRound + 1;
  if (fee < ask * b.walkAway || round > b.maxRounds + (fee >= ask * b.closeBonus ? 1 : 0)) return close("refused");
  const counter = Math.min(ask, Math.max(fee + 1000, Math.round((ask - (ask - fee) * (1 - b.concession ** round)) / 1000) * 1000));
  update(repo, { ...bid, clubRound: round, ask: counter });
  return { status: "counter", fee: counter, round, roundsLeft: b.maxRounds - round };
}

/** Descer de escalão: o jogador só vem por mais dinheiro (fim de carreira e jogadores da terra do clube são exceção). */
export function stepBackWage(repo: Repository, data: BaseData, params: Params, club: BaseClub, person: string): number | undefined {
  const j = repo.player(person);
  const p = repo.person(person);
  const ct = repo.contract(person);
  if (!j || !p || !ct || !j.club) return undefined;
  const from = data.clubs.find((c) => c.id === j.club);
  const tierFrom = from ? TIER_ORDER.indexOf(from.tier) : 0; // os estrangeiros contam como Primeira Liga
  if (TIER_ORDER.indexOf(club.tier) <= tierFrom) return undefined;
  const age = (Date.parse(repo.meta("date.today") ?? "") - Date.parse(p.birth)) / (365.25 * 86400000);
  if (age >= params.market.bids.endOfCareerAge || p.birthCity === club.city) return undefined;
  return Math.round((ct.monthlyWage * params.market.bids.stepBackWage) / 10) * 10;
}

export type AgentReply = NegotiationReply | { status: "blocked"; reason: "cash" | "wageBudget" };

/** Uma ronda com o agente sobre o contrato. */
export function agentOffer(repo: Repository, data: BaseData, params: Params, club: BaseClub, today: IsoDate, season: number, bid: Bid, offer: RenewalTerms): AgentReply | undefined {
  const reply = negotiateRenewal(repo, data, params, club, bidKey(bid), bid.person, offer, { ...(stepBackWage(repo, data, params, club, bid.person) ? { minWage: stepBackWage(repo, data, params, club, bid.person) as number } : {}) });
  if (!reply) return undefined;
  if (reply.status === "closed") {
    update(repo, { ...bid, stage: "closed", closed: reply.reason === "refused" ? "refused" : reply.reason, ...(reply.reopens ? { reopens: reply.reopens } : {}) });
    return reply;
  }
  if (reply.status === "accepted") {
    const commission = commissionOf(repo, params, bid.person, reply.terms.wage);
    const budget = clubBudget(repo, club, params, season);
    const payroll = monthlyWageBill(repo, club.id) * 12 + reply.terms.wage * 12;
    if (clubBalance(repo, club) < (bid.fee ?? 0) + commission) return { status: "blocked", reason: "cash" };
    if (payroll > budget.wageBillMax * (1 + params.market.wageSlack)) return { status: "blocked", reason: "wageBudget" };
    update(repo, { ...bid, stage: "agreed", terms: reply.terms, commission, confirmFrom: nextPhaseDay(params, today) });
  }
  return reply;
}

const commissionOf = (repo: Repository, params: Params, person: string, wage: number): number => {
  const ag = agentTraits(repo, repo.player(person)?.agent);
  const a = params.market.agents;
  return ag ? Math.round((wage * 12 * a.commissionRate * (1 + a.commissionByGreed * (ag.greed - a.greedPivot))) / 100) * 100 : 0;
};

/** Sugestões para o contrato: as das renovações, deslocadas pelo mesmo erro de quem sabe pouco. */
export function termSuggestions(repo: Repository, data: BaseData, params: Params, club: BaseClub, bid: Bid): { ask: RenewalTerms; wages: number[]; releases: number[]; minWage?: number } | undefined {
  const ask = renewalAsk(repo, data, params, club, bid.person);
  const ct = repo.contract(bid.person);
  if (!ask) return undefined;
  const s = renewalSuggestions(ask, ct?.monthlyWage ?? ask.wage);
  const sigma = params.market.bids.suggestionNoise * (1 - informationOf(repo, bid.person));
  const shift = sigma > 0 ? clamp(new Rng(repo.meta("seed") ?? "?", `bidwage/${bid.person}`).gauss(0, sigma), -sigma * 2, sigma * 2) : 0;
  const wages = [...new Set(s.wages.map((w) => Math.max(50, Math.round((w * (1 + shift)) / 10) * 10)))].sort((a, b) => a - b);
  const floor = stepBackWage(repo, data, params, club, bid.person);
  return { ask: { wage: ask.wage, years: ask.years, release: ask.release }, wages, releases: s.releases, ...(floor ? { minWage: floor } : {}) };
}

/** Primeiro dia em que a janela volta a abrir. */
export function nextWindowOpen(params: Params, today: IsoDate): IsoDate {
  for (let i = 0; i < 400; i++) {
    const d = addDays(today, i);
    if (windowAt(d, params)) return d;
  }
  return today;
}

export type Finalized = { moved: true } | { moved: false; date: IsoDate } | { moved: false; failed: BidClosed };

/** Com acordo: muda já se a janela está aberta, senão marca a data. */
export function finalizeBid(repo: Repository, data: BaseData, params: Params, club: BaseClub, today: IsoDate, season: number, bid: Bid): Finalized {
  if (windowAt(today, params)) {
    const r = executeBid(repo, data, params, club, today, season, bid);
    return r === true ? { moved: true } : { moved: false, failed: r };
  }
  const date = nextWindowOpen(params, today);
  update(repo, { ...bid, moving: { club: club.id, date } });
  return { moved: false, date };
}

/** Passa o jogador para o clube do gamer: dinheiro, contrato e eventos (como o mercado da IA). */
export function executeBid(repo: Repository, data: BaseData, params: Params, club: BaseClub, today: IsoDate, season: number, bid: Bid): true | BidClosed {
  const j = repo.player(bid.person);
  const terms = bid.terms;
  if (!j || !terms || j.state === "retired" || j.club !== bid.seller) {
    update(repo, { ...bid, stage: "closed", closed: "gone" });
    return "gone";
  }
  const mk = params.market;
  const fee = bid.fee ?? 0;
  const commission = bid.commission ?? 0;
  const p = repo.person(bid.person);
  const age = p ? (Date.parse(today) - Date.parse(p.birth)) / (365.25 * 86400000) : 99;
  const trainer = !bid.seller && j.trainedAt && j.trainedAt !== club.id && age <= mk.training.ageMax ? data.clubs.find((c) => c.id === j.trainedAt) : undefined;
  const compensation = trainer ? Math.round((terms.wage * 12 * mk.training.byTier[trainer.tier]) / 100) * 100 : 0;
  if (clubBalance(repo, club) < fee + commission + compensation) {
    update(repo, { ...bid, stage: "closed", closed: "cash" });
    return "cash";
  }
  const seller = bid.seller ? data.clubs.find((c) => c.id === bid.seller) : undefined;
  post(repo, club, "transfers", -fee);
  adjustTransfers(repo, club, params, season, -(fee + commission + compensation));
  if (seller) post(repo, seller, "transfers", fee);
  if (commission > 0) post(repo, club, "transfers", -commission);
  if (trainer && compensation > 0) { post(repo, club, "transfers", -compensation); post(repo, trainer, "transfers", compensation); }
  const newRelease = terms.release ?? undefined;
  const clauses: ContractClauses = newRelease !== undefined ? { release: newRelease } : {};
  const wasProspect = j.state === "prospect";
  repo.updatePlayer(bid.person, { club: club.id, state: "active", ...(wasProspect ? { trainedAt: club.id } : {}) });
  if (wasProspect) lockLocalSigning(repo, params, bid.person, today);
  repo.saveContract({ person: bid.person, club: club.id, monthlyWage: terms.wage, ...contractDates(today, terms.years), ...(Object.keys(clauses).length > 0 ? { clauses } : {}) });
  const agent = j.agent ? [{ k: "person" as const, id: j.agent, roleKind: "agent" }] : [];
  if (bid.seller) {
    repo.appendEvent({
      type: "TRANSFER", date: today, season, visibility: "exposed", origin: "generated",
      entities: [{ k: "person", id: bid.person, roleKind: "player" }, { k: "club", id: bid.seller, roleKind: "seller" }, { k: "club", id: club.id, roleKind: "buyer" }, ...agent],
      data: { fee, wage: terms.wage, years: terms.years, window: windowAt(today, params)?.id ?? "", ...(isImportantFee(params, fee) ? { important: 1 } : {}), ...(commission > 0 ? { commission } : {}), ...(isForeignClub(bid.seller) ? { foreign: foreignClubList(repo).find((c) => c.id === bid.seller)?.name ?? "" } : {}) },
    });
  } else {
    repo.appendEvent({
      type: "PLAYER_SIGNED", date: today, season, visibility: "exposed", origin: "generated",
      entities: [{ k: "person", id: bid.person, roleKind: "player" }, { k: "club", id: club.id }, ...(trainer && compensation > 0 ? [{ k: "club" as const, id: trainer.id, roleKind: "trainer" }] : []), ...agent],
      data: { from: wasProspect ? "local" : "free", wage: terms.wage, years: terms.years, window: windowAt(today, params)?.id ?? "", ...(commission > 0 ? { commission } : {}), ...(compensation > 0 ? { compensation } : {}) },
    });
  }
  update(repo, { ...bid, stage: "done" });
  return true;
}

export type SubmitInput = { kind: "fee"; fee: number } | { kind: "terms"; terms: RenewalTerms };
export type Resolved = { status: "accepted" | "counter" | "closed" | "blocked"; reason?: string; terms?: RenewalTerms };

/** As rondas da negociação respondem no mesmo dia: a espera é só entre fases (clube → agente → confirmação). */
export const replyDelay = (): number => 0;

/** Primeiro dia em que a fase seguinte avança: amanhã, ou hoje no último dia da janela (deadline day). */
export const nextPhaseDay = (params: Params, today: IsoDate): IsoDate => (windowAt(today, params)?.last ? today : addDays(today, 1));

/** Envia uma proposta: responde logo no último dia da janela, senão fica pendente. Devolve a resposta se já chegou. */
export function submitBid(repo: Repository, data: BaseData, params: Params, club: BaseClub, today: IsoDate, season: number, bid: Bid, input: SubmitInput): Resolved | "pending" {
  const delay = replyDelay();
  const due = addDays(today, delay);
  const pending = input.kind === "fee" ? { kind: "fee" as const, fee: input.fee, due } : { kind: "terms" as const, terms: input.terms, due };
  const next: Bid = { ...bid, pending, ...(input.kind === "terms" ? { lastTerms: input.terms } : {}) };
  update(repo, next);
  if (delay > 0) return "pending";
  return resolvePending(repo, data, params, club, today, season, next) ?? "pending";
}

/** Dá a resposta de uma proposta pendente: guarda-a, assinala-a na caixa de entrada e segue a negociação. */
export function resolvePending(repo: Repository, data: BaseData, params: Params, club: BaseClub, today: IsoDate, season: number, bid: Bid): Resolved | undefined {
  const pend = bid.pending;
  if (!pend) return undefined;
  const cleared: Bid = { ...bid };
  delete cleared.pending;
  update(repo, cleared);
  let reply: Resolved | undefined;
  if (pend.kind === "fee") {
    const r = clubOffer(repo, data, params, club, today, cleared, pend.fee);
    reply = { status: r.status, ...(r.status === "closed" ? { reason: r.reason } : {}) };
  } else {
    const r = agentOffer(repo, data, params, club, today, season, cleared, pend.terms);
    if (!r) return undefined;
    reply = { status: r.status, ...(r.status === "closed" || r.status === "blocked" ? { reason: r.reason } : {}), ...(r.status === "counter" ? { terms: r.terms } : {}) };
  }
  const fresh = bids(repo).find((x) => x.id === bid.id) ?? cleared;
  const agreed = pend.kind === "terms" && reply.status === "accepted";
  const later = agreed && (fresh.confirmFrom ?? today) > today;
  update(repo, { ...fresh, lastReply: { ...reply, kind: pend.kind, date: today }, ...(agreed ? { agreedOn: today, notified: !later } : {}) });
  if (later) return reply; // a mensagem do acordo chega no dia seguinte (dailyBids)
  const seller = bid.seller ? (data.clubs.find((c) => c.id === bid.seller)?.name ?? foreignClubList(repo).find((c) => c.id === bid.seller)?.name ?? "") : "";
  repo.appendEvent({
    type: "BID_REPLY", date: today, season, visibility: "exposed", origin: "generated",
    entities: [{ k: "club", id: club.id }, { k: "person", id: bid.person, roleKind: "target" }],
    data: { status: reply.status, kind: pend.kind, seller, ...(pend.kind === "fee" ? { fee: reply.status === "counter" ? (bids(repo).find((x) => x.id === bid.id)?.ask ?? pend.fee) : pend.fee } : {}), ...(reply.reason ? { reason: reply.reason } : {}) },
  });
  return reply;
}

/** O gamer confirma a transferência acordada: muda já (janela aberta) ou fica marcada. */
export function confirmBid(repo: Repository, data: BaseData, params: Params, club: BaseClub, today: IsoDate, season: number, bid: Bid): Finalized | undefined {
  if (bid.stage !== "agreed" || bid.moving || (bid.confirmFrom && today < bid.confirmFrom)) return undefined;
  return finalizeBid(repo, data, params, club, today, season, bid);
}

/** Todos os dias: executa os acordos que estavam à espera da janela. Devolve os que se concretizaram. */
export function dailyBids(repo: Repository, data: BaseData, params: Params, club: BaseClub, today: IsoDate, season: number): Bid[] {
  const done: Bid[] = [];
  // respostas que chegam hoje
  for (const b of bids(repo)) if (b.pending && b.pending.due <= today) resolvePending(repo, data, params, club, today, season, b);
  // acordos com o agente: a mensagem para confirmar chega no dia seguinte
  for (const b of bids(repo)) {
    if (b.stage !== "agreed" || b.notified || (b.confirmFrom ?? today) > today) continue;
    update(repo, { ...b, notified: true });
    repo.appendEvent({
      type: "BID_REPLY", date: today, season, visibility: "exposed", origin: "generated",
      entities: [{ k: "club", id: club.id }, { k: "person", id: b.person, roleKind: "target" }],
      data: { status: "accepted", kind: "terms", seller: b.seller ? (data.clubs.find((c) => c.id === b.seller)?.name ?? foreignClubList(repo).find((c) => c.id === b.seller)?.name ?? "") : "" },
    });
  }
  // acordos por confirmar que o gamer deixou passar
  for (const b of bids(repo)) {
    if (b.stage === "agreed" && !b.moving && b.agreedOn && addDays(b.agreedOn, params.market.bids.confirmDays) < today) update(repo, { ...b, stage: "closed", closed: "gone" });
  }
  if (!windowAt(today, params)) return done;
  for (const b of bids(repo)) {
    if (b.stage !== "agreed" || !b.moving || b.moving.date > today) continue;
    if (executeBid(repo, data, params, club, today, season, b) === true) done.push(b);
  }
  return done;
}

export const acceptFloorOf = acceptFloor;
export const negotiationStateOf = (repo: Repository, bid: Bid) => negotiationOf(repo, bidKey(bid), bid.person);
