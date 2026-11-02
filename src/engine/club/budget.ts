/**
 * Orçamento anual do clube (RZ-114): a massa salarial máxima (euros por ano) e o dinheiro para transferências (jogadores e
 * staff, líquido). Cada época os clubes ganham um orçamento por defeito calculado das receitas esperadas e da folga de caixa;
 * o gamer pode alterá-lo no seu clube. As transferências e as renovações (RZ-205 a RZ-207) respeitam-no.
 */
import type { Params } from "../config/parameters";
import type { BaseClub, BaseData } from "../data/types";
import type { Repository } from "../persistence/repository";
import { readManagement } from "../squad/management";
import { stadiumTotal } from "./stadiumState";
import { budgetOf, contractOf } from "../season/gamerContract";
import { monthlyCosts, monthlyWageBill, estimatedAnnualRevenue, clubBalance } from "./finances";

export type Budget = { season: number; wageBillMax: number; transfers: number };

const round = (v: number) => Math.round(v / 1000) * 1000;
const roundUp = (v: number) => Math.ceil(v / 1000) * 1000;

/** O orçamento por defeito: a massa não fica abaixo da atual (ninguém tem de despedir) e só ganha folga enquanto não passa de `wageShareMax` das receitas (sem catraca) nem do peso máximo sobre as receitas. */
export function defaultBudget(repo: Repository, c: BaseClub, params: Params, season: number): Budget {
  const o = params.finances.budget;
  const currentBill = monthlyWageBill(repo, c.id) * 12;
  const costs = monthlyCosts(repo, c, params);
  const revenue = estimatedAnnualRevenue(c, params, stadiumTotal(repo, c, params));
  const reserve = o.monthsReserve * (costs.wages + costs.staff + costs.stadium + costs.fixed);
  const spend = 1 + o.overspend * Math.max(0, -(readManagement(repo)[c.id] ?? 0));
  return {
    season,
    // arredonda para cima: arredondar para baixo deixava o teto uns euros abaixo da massa atual (margem negativa logo no início)
    wageBillMax: roundUp(Math.max(currentBill, Math.min(currentBill * (1 + o.wageHeadroom), revenue * o.wageShareMax * spend), revenue * o.revenueAboutBill * spend)),
    transfers: round(Math.max(0, clubBalance(repo, c) - reserve) * o.transfersBye),
  };
}

/** O orçamento em vigor: o guardado para esta época ou, se ainda não houver, o que seria por defeito. */
export function clubBudget(repo: Repository, c: BaseClub, params: Params, season: number): Budget {
  const v = repo.meta(`budget.${c.id}`);
  if (v) {
    const o = JSON.parse(v) as Budget;
    if (o.season === season) return o;
  }
  return defaultBudget(repo, c, params, season);
}

/** No arranque de cada época dá a todos os clubes o orçamento por defeito (guarda o que o gamer escolheu até ao fim da época). */
export function ensureBudgets(repo: Repository, data: BaseData, params: Params, season: number): void {
  if (repo.meta("budget.season") === String(season)) return;
  for (const c of data.clubs) repo.setMeta(`budget.${c.id}`, JSON.stringify(defaultBudget(repo, c, params, season)));
  repo.setMeta("budget.season", String(season));
  // o orçamento de plantel acordado no contrato do gamer vale em todas as épocas do contrato
  const mine = repo.meta("gamer.club");
  const club = mine ? data.clubs.find((c) => c.id === mine) : undefined;
  if (club) applyContractBudget(repo, club, params, season);
}

export type BudgetRequest = { wageBillMax: number; transfers: number };

/** O gamer redefine o orçamento do seu clube. As transferências não passam do que há em caixa. */
export function setBudget(repo: Repository, c: BaseClub, params: Params, season: number, pendingRequest: BudgetRequest): Budget {
  for (const [k, v] of Object.entries(pendingRequest)) if (!Number.isFinite(v) || v < 0) throw new Error(`Orçamento inválido: ${k}`);
  if (pendingRequest.transfers > Math.max(0, clubBalance(repo, c))) throw new Error("As transferências não podem passar do que há em caixa");
  const o: Budget = { season, wageBillMax: round(pendingRequest.wageBillMax), transfers: round(pendingRequest.transfers) };
  repo.setMeta(`budget.${c.id}`, JSON.stringify(o));
  return o;
}

/** Vendas somam e compras gastam a verba de transferências do clube (nunca abaixo de zero). */
export function adjustTransfers(repo: Repository, c: BaseClub, params: Params, season: number, delta: number): void {
  const b = clubBudget(repo, c, params, season);
  repo.setMeta(`budget.${c.id}`, JSON.stringify({ ...b, transfers: Math.max(0, Math.round(b.transfers + delta)) }));
}

/** O orçamento do clube do gamer segundo o contrato: o por defeito vezes os múltiplos acordados (a verba de transferências nunca passa do que há em caixa). */
export function applyContractBudget(repo: Repository, c: BaseClub, params: Params, season: number): void {
  const contract = contractOf(repo);
  if (!contract || contract.club !== c.id) return;
  const m = budgetOf(contract);
  if (m.wage === 1 && m.transfers === 1) return;
  const base = defaultBudget(repo, c, params, season);
  const o: Budget = { season, wageBillMax: round(base.wageBillMax * m.wage), transfers: round(Math.min(base.transfers * m.transfers, Math.max(0, clubBalance(repo, c)))) };
  repo.setMeta(`budget.${c.id}`, JSON.stringify(o));
}
