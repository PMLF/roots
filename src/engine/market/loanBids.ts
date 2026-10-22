/**
 * Empréstimos pedidos pelo gamer (RZ-269): em vez de comprar, o gamer propõe pagar uma percentagem do ordenado do jogador até ao fim da época.
 * Responde logo o clube dono (só empresta quem não é indispensável: excedentes e jovens sem lugar no onze; o escalão do clube dono não pode
 * ser inferior ao do gamer; exige uma parte mínima do ordenado) e depois o jogador, que tem a palavra final (`appeal.decideLoan`).
 * Só com a janela aberta. O jogador mantém o contrato com o clube dono; o gamer paga a sua parte do ordenado (e uma taxa de empréstimo, se a houver).
 */
import type { Params, Tier } from "../config/parameters";
import type { BaseClub, BaseData } from "../data/types";
import { adjustTransfers, clubBudget } from "../club/budget";
import { clubBalance, monthlyWageBill, post } from "../club/finances";
import { loanEnd, loanOf, startLoan } from "../loans/loans";
import type { Repository } from "../persistence/repository";
import type { IsoDate } from "../persistence/types";
import { Rng } from "../random/rng";
import { distributePositions } from "../world/generateWorld";
import { currentQuality } from "../world/player";
import type { Attributes, Position } from "../world/types";
import { makeAppeal } from "./appeal";
import { valueOf } from "./bids";
import { windowAt } from "./market";

const TIER_ORDER: Tier[] = ["firstLeague", "secondLeague", "thirdLeague", "cp", "district"];

export type LoanReason = "window" | "club" | "level" | "key" | "squad" | "player" | "cash" | "wageBudget" | "contract";
export type LoanReply = { status: "accepted"; fee: number; until: string } | { status: "counter"; share: number } | { status: "closed"; reason: LoanReason };

/** O que o clube dono pensa do jogador: pode emprestá-lo e quanto pede. */
export type LoanTerms = { lender: BaseClub; wage: number; minShare: number; fee: number; until: IsoDate; months: number; prospect: boolean; surplus: boolean };

const slotsAt = (params: Params, tier: Tier, pos: string): number => distributePositions(params.world.squad[tier], params.world.placesByPosition).filter((q) => q === pos).length;
const ageAt = (repo: Repository, person: string, today: IsoDate): number => (Date.parse(today) - Date.parse(repo.person(person)?.birth ?? today)) / (365.25 * 86400000);

/** Posição do jogador no plantel do clube: quantos da mesma posição são melhores que ele. */
export function rankInSquad(repo: Repository, club: string, person: string): { rank: number; pos: string } | undefined {
  const j = repo.player(person);
  const pos = j?.positions[0]?.pos as Position | undefined;
  if (!j || !pos) return undefined;
  const q = currentQuality(j.attributes as Attributes, pos);
  const rank = repo.clubPlayers(club).filter((x) => x.person !== person && x.state === "active" && x.positions[0]?.pos === pos && currentQuality(x.attributes as Attributes, pos) > q).length;
  return { rank, pos };
}

/**
 * Um clube só empresta quem não é indispensável: excedentes (mais jogadores da posição do que as vagas do plantel) e jovens com futuro
 * que ainda não têm lugar no onze. Devolve `undefined` se o jogador conta para o clube.
 */
export function lendable(repo: Repository, params: Params, club: BaseClub, person: string, today: IsoDate): "surplus" | "prospect" | undefined {
  const j = repo.player(person);
  const r = rankInSquad(repo, club.id, person);
  if (!j || !r) return undefined;
  const lc = params.market.loans;
  const slots = slotsAt(params, club.tier, r.pos);
  if (r.rank >= slots) return "surplus";
  const starters = Math.max(1, Math.round((slots * 11) / params.world.squad[club.tier]));
  const young = ageAt(repo, person, today) <= lc.prospectAgeMax && j.potential - currentQuality(j.attributes as Attributes, r.pos as Position) >= lc.prospectGap;
  return young && r.rank >= starters ? "prospect" : undefined;
}

/** Condições do clube dono para emprestar (ou a razão pela qual não empresta). */
export function loanTermsOf(repo: Repository, data: BaseData, params: Params, club: BaseClub, today: IsoDate, person: string): LoanTerms | LoanReason {
  const j = repo.player(person);
  const ct = repo.contract(person);
  if (!j || !ct || !j.club || j.state !== "active" || loanOf(repo, person)) return "club";
  const lender = data.clubs.find((c) => c.id === j.club);
  if (!lender) return "club";
  if (TIER_ORDER.indexOf(lender.tier) > TIER_ORDER.indexOf(club.tier)) return "level";
  const lc = params.market.loans;
  const until = loanEnd(today);
  if (ct.end <= until) return "contract";
  const kind = lendable(repo, params, lender, person, today);
  if (!kind) return "key";
  const surplus = kind === "surplus";
  const prospect = kind === "prospect";
  if (repo.clubPlayers(lender.id).length - 1 < params.world.squad[lender.tier] - lc.lenderMinSquad) return "squad";
  const fee = prospect ? 0 : Math.round((valueOf(repo, params, person, today) * lc.feeRate) / 1000) * 1000;
  const months = Math.max(1, Math.round((Date.parse(until) - Date.parse(today)) / (30.44 * 86400000)));
  return { lender, wage: ct.monthlyWage, minShare: lc.wageShares[0] ?? 0.5, fee, until, months, prospect, surplus };
}

/** O gamer propõe pagar `share` (0-1) do ordenado do jogador até ao fim da época. */
export function proposeLoan(repo: Repository, data: BaseData, params: Params, club: BaseClub, today: IsoDate, season: number, person: string, share: number): LoanReply {
  if (!windowAt(today, params)) return { status: "closed", reason: "window" };
  const t = loanTermsOf(repo, data, params, club, today, person);
  if (typeof t === "string") return { status: "closed", reason: t };
  if (!(share > 0 && share <= 1)) return { status: "closed", reason: "club" };
  if (share < t.minShare) return { status: "counter", share: t.minShare };
  const budget = clubBudget(repo, club, params, season);
  if (Math.min(clubBalance(repo, club), budget.transfers) < t.fee) return { status: "closed", reason: "cash" };
  if (monthlyWageBill(repo, club.id) * 12 + t.wage * share * 12 > budget.wageBillMax * (1 + params.market.wageSlack)) return { status: "closed", reason: "wageBudget" };
  // o jogador tem a palavra final: quer jogar mais e custa-lhe descer de escalão
  const r = rankInSquad(repo, t.lender.id, person);
  const mine = rankInSquad(repo, club.id, person);
  const appeal = makeAppeal(repo, data, params);
  const will = appeal.decideLoan({ person, from: t.lender, to: club, starter: (mine?.rank ?? 99) < slotsAt(params, club.tier, mine?.pos ?? r?.pos ?? ""), benchwarmer: true });
  if (!new Rng(repo.meta("seed") ?? "?", `loanbid/${person}/${today}`).prob(will)) return { status: "closed", reason: "player" };
  startLoan(repo, { person, from: t.lender.id, to: club.id, start: today, end: t.until, season, wageShare: share, fee: t.fee }, today);
  if (t.fee > 0) {
    post(repo, club, "transfers", -t.fee);
    post(repo, t.lender, "transfers", t.fee);
    adjustTransfers(repo, club, params, season, -t.fee);
  }
  return { status: "accepted", fee: t.fee, until: t.until };
}
