/**
 * Propostas da IA por jogadores do gamer (RZ-232). Só com a janela aberta, de vez em quando, um clube que precisa e pode
 * pagar faz uma proposta pelo valor; o gamer aceita, rejeita ou contrapropõe (o comprador cede até um teto). Se o valor
 * fica acordado, o jogador ainda tem de aceitar o contrato do comprador; só então se muda.
 * As propostas guardam-se em meta (`market.offers`) e as pendentes aparecem em «Exige decisão».
 */
import { addDays } from "../calendar/dates";
import { clubBalance, post } from "../club/finances";
import { clubBudget } from "../club/budget";
import type { Params, Tier } from "../config/parameters";
import type { BaseClub, BaseData } from "../data/types";
import type { Repository } from "../persistence/repository";
import type { IsoDate } from "../persistence/types";
import { Rng } from "../random/rng";
import { isInSecondDistrict } from "../season/districts";
import { readPlan, savePlan } from "../season/gamePlan";
import { renewalAsk, renewalInterest } from "../squad/renewals";
import { contractDates } from "../squad/youth";
import { currentQuality } from "../world/player";
import type { Attributes, Position } from "../world/types";
import { valueOf } from "./bids";
import { windowAt } from "./market";
import { isImportantFee } from "./newsworthy";

export type OfferStatus = "pending" | "done" | "rejected" | "expired" | "withdrawn" | "refused" | "gone";
export type Offer = {
  id: number;
  person: string;
  buyer: string;
  fee: number;
  /** Valores que o gamer pode pedir (dropdown): fixos durante toda a negociação; a IA só contrapropõe com eles. */
  grid?: number[];
  wage: number;
  years: number;
  release: number | null;
  created: IsoDate;
  expires: IsoDate;
  round: number;
  status: OfferStatus;
};

const KEY = "market.offers";
const TIER_ORDER: Tier[] = ["firstLeague", "secondLeague", "thirdLeague", "cp", "district"];
export const offers = (repo: Repository): Offer[] => {
  const raw = repo.meta(KEY);
  return raw ? (JSON.parse(raw) as Offer[]) : [];
};
const save = (repo: Repository, list: Offer[]) => repo.setMeta(KEY, JSON.stringify(list));
const update = (repo: Repository, o: Offer) => save(repo, offers(repo).map((x) => (x.id === o.id ? o : x)));
export const pendingOffers = (repo: Repository): Offer[] => offers(repo).filter((o) => o.status === "pending");

const round1000 = (v: number) => Math.round(v / 1000) * 1000;

/** Último dia da janela aberta em `date`. */
function windowEnd(params: Params, date: IsoDate): IsoDate {
  let d = date;
  for (let i = 0; i < 120; i++) {
    const next = addDays(d, 1);
    if (!windowAt(next, params)) return d;
    d = next;
  }
  return d;
}

const SALE_KEY = "market.forSale";
/** Jogadores que o gamer pôs à venda: mais propostas, por um valor um pouco mais baixo. */
export const forSale = (repo: Repository): Set<string> => new Set(JSON.parse(repo.meta(SALE_KEY) ?? "[]") as string[]);
export function setForSale(repo: Repository, person: string, on: boolean): void {
  const set = forSale(repo);
  if (on) set.add(person); else set.delete(person);
  repo.setMeta(SALE_KEY, JSON.stringify([...set]));
}

/** Teto do comprador: o valor de mercado vezes `maxMult`, limitado pelo que pode gastar. */
export function buyerCeiling(repo: Repository, data: BaseData, params: Params, today: IsoDate, season: number, o: Offer): number {
  const buyer = data.clubs.find((c) => c.id === o.buyer);
  if (!buyer) return 0;
  const spend = Math.min(clubBalance(repo, buyer), clubBudget(repo, buyer, params, season).transfers);
  return Math.max(0, Math.min(valueOf(repo, params, o.person, today) * params.market.offers.maxMult, spend));
}

/** Todos os dias com a janela aberta: fecha as vencidas e, com alguma probabilidade, chega uma proposta nova por jogador. */
export function dailyOffers(repo: Repository, data: BaseData, params: Params, gamer: BaseClub, today: IsoDate, season: number): Offer[] {
  const created: Offer[] = [];
  const cfg = params.market.offers;
  // vencidas, ou o jogador já não é do clube
  for (const o of pendingOffers(repo)) {
    if (repo.player(o.person)?.club !== gamer.id) update(repo, { ...o, status: "gone" });
    else if (o.expires < today) update(repo, { ...o, status: "expired" });
  }
  if (!windowAt(today, params) || repo.peopleTotal() === 0) return created;
  const rng = new Rng(repo.meta("seed") ?? "?", `offers/${today}`);
  const gamerIdx = TIER_ORDER.indexOf(gamer.tier);
  const buyers = data.clubs.filter((c) => c.id !== gamer.id && !isInSecondDistrict(c.league) && Math.abs(TIER_ORDER.indexOf(c.tier) - gamerIdx) <= 1);
  const onSale = forSale(repo);
  for (const j of repo.clubPlayers(gamer.id)) {
    const sale = onSale.has(j.person);
    if (j.state !== "active" || !rng.prob(cfg.dailyChance * (sale ? cfg.forSaleChance : 1))) continue;
    const p = repo.person(j.person);
    const pos = j.positions[0]?.pos as Position | undefined;
    if (!p || !pos) continue;
    const age = (Date.parse(today) - Date.parse(p.birth)) / (365.25 * 86400000);
    if (age < cfg.minAge) continue;
    const recent = offers(repo).some((o) => o.person === j.person && (o.status === "pending" || addDays(o.created, cfg.sameWindowDays) > today));
    if (recent) continue;
    const quality = currentQuality(j.attributes as Attributes, pos);
    const value = valueOf(repo, params, j.person, today);
    if (value <= 0) continue;
    const fee = round1000(value * (sale ? cfg.forSaleFee : 1) * (cfg.feeSpread[0] + rng.float() * (cfg.feeSpread[1] - cfg.feeSpread[0])));
    // um comprador que precisa dele (nível útil), pode pagar e a quem o jogador aceitaria juntar-se
    const buyer = rng.shuffle([...buyers]).find((c) => {
      const tq = params.world.targetQuality[c.tier];
      if (quality < tq.mean - 0.5 * tq.deviation) return false;
      if (Math.min(clubBalance(repo, c), clubBudget(repo, c, params, season).transfers) < fee) return false;
      return renewalInterest(repo, data, params, c, j.person).interested;
    });
    if (!buyer) continue;
    const ask = renewalAsk(repo, data, params, buyer, j.person);
    if (!ask) continue;
    const list = offers(repo);
    const grid = [...new Set([1.1, 1.25, 1.4, 1.6, 2].map((m) => Math.round((Math.max(fee, value) * m) / 1000) * 1000))].sort((a, b) => a - b);
    const offer: Offer = { id: Math.max(0, ...list.map((x) => x.id)) + 1, person: j.person, buyer: buyer.id, fee, grid, wage: ask.wage, years: ask.years, release: ask.release, created: today, expires: [addDays(today, cfg.validDays), windowEnd(params, today)].sort()[0] as IsoDate, round: 0, status: "pending" };
    save(repo, [...list, offer]);
    repo.appendEvent({ type: "TRANSFER_OFFER", date: today, season, visibility: "exposed", origin: "generated", entities: [{ k: "person", id: j.person, roleKind: "player" }, { k: "club", id: buyer.id, roleKind: "buyer" }, { k: "club", id: gamer.id }], data: { fee } });
    created.push(offer);
  }
  return created;
}

export type OfferReply =
  | { status: "done" }
  | { status: "counter"; fee: number; roundsLeft: number }
  | { status: "refused" | "withdrawn" | "rejected" | "expired" };

/** O jogador aceita o contrato do comprador (se não vir nele o nível que procura, recusa) e a transferência executa-se. */
function settle(repo: Repository, data: BaseData, params: Params, gamer: BaseClub, today: IsoDate, season: number, o: Offer): OfferReply {
  const buyer = data.clubs.find((c) => c.id === o.buyer);
  if (!buyer || !windowAt(today, params) || repo.player(o.person)?.club !== gamer.id) { update(repo, { ...o, status: "expired" }); return { status: "expired" }; }
  if (!renewalInterest(repo, data, params, buyer, o.person).interested || clubBalance(repo, buyer) < o.fee) { update(repo, { ...o, status: "refused" }); return { status: "refused" }; }
  post(repo, gamer, "transfers", o.fee);
  post(repo, buyer, "transfers", -o.fee);
  repo.updatePlayer(o.person, { club: buyer.id, state: "active" });
  repo.saveContract({ person: o.person, club: buyer.id, monthlyWage: o.wage, ...contractDates(today, o.years), ...(o.release !== null ? { clauses: { release: o.release } } : {}) });
  const plan = readPlan(repo, gamer.id);
  if (plan.lineup?.some((x) => x.player === o.person)) savePlan(repo, gamer.id, { tactic: plan.tactic });
  const agent = repo.player(o.person)?.agent;
  repo.appendEvent({
    type: "TRANSFER", date: today, season, visibility: "exposed", origin: "generated",
    entities: [{ k: "person", id: o.person, roleKind: "player" }, { k: "club", id: gamer.id, roleKind: "seller" }, { k: "club", id: buyer.id, roleKind: "buyer" }, ...(agent ? [{ k: "person" as const, id: agent, roleKind: "agent" }] : [])],
    data: { fee: o.fee, wage: o.wage, years: o.years, window: windowAt(today, params)?.id ?? "", ...(isImportantFee(params, o.fee) ? { important: 1 } : {}) },
  });
  update(repo, { ...o, status: "done" });
  for (const x of pendingOffers(repo)) if (x.person === o.person) update(repo, { ...x, status: "gone" });
  return { status: "done" };
}

/** A resposta do gamer: aceitar o valor proposto, rejeitar, ou contrapropor outro valor. */
export function respondOffer(repo: Repository, data: BaseData, params: Params, gamer: BaseClub, today: IsoDate, season: number, id: number, action: { kind: "accept" } | { kind: "reject" } | { kind: "counter"; fee: number }): OfferReply | undefined {
  const o = offers(repo).find((x) => x.id === id && x.status === "pending");
  if (!o) return undefined;
  if (o.expires < today) { update(repo, { ...o, status: "expired" }); return { status: "expired" }; }
  if (action.kind === "reject") { update(repo, { ...o, status: "rejected" }); return { status: "rejected" }; }
  if (action.kind === "accept") return settle(repo, data, params, gamer, today, season, o);
  const cfg = params.market.offers;
  const ceiling = buyerCeiling(repo, data, params, today, season, o);
  if (action.fee <= o.fee) return settle(repo, data, params, gamer, today, season, o);
  if (action.fee <= ceiling) return settle(repo, data, params, gamer, today, season, { ...o, fee: action.fee });
  const round = o.round + 1;
  if (round > cfg.maxRounds || action.fee > ceiling * 1.5 || ceiling <= o.fee) { update(repo, { ...o, status: "withdrawn" }); return { status: "withdrawn" }; }
  const target = round1000(o.fee + (ceiling - o.fee) * (1 - cfg.concession ** round));
  // a IA só contrapropõe com valores do dropdown
  const fee = (o.grid ?? []).filter((v) => v > o.fee && v <= target).pop();
  if (fee === undefined) { update(repo, { ...o, status: "withdrawn" }); return { status: "withdrawn" }; }
  update(repo, { ...o, round, fee });
  return { status: "counter", fee, roundsLeft: cfg.maxRounds - round };
}
