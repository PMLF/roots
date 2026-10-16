/**
 * Finanças do clube (RZ-114; docs/EVENT_HISTORY.md §5.1). O dinheiro de cada clube é um livro de lançamentos:
 * - `balance.<clube>` (meta) é a derivada do saldo; arranca no capital inicial do CSV (`ClubeBase.financas`);
 * - `lancar` soma um valor (receita > 0, despesa < 0) a uma categoria do mês corrente (`month.<clube>`);
 * - `fecharMes` grava o evento privado `FECHO_FINANCEIRO` por clube com o saldo e o resumo do mês, e zera o mês.
 * Valores em `parametros.financas.modelo`. A UI nunca lê isto: só o clube do gamer em exato e, para os outros, a palavra de `estadoFinanceiro`.
 */
import { Rng } from "../random/rng";
import type { Tier, Params } from "../config/parameters";
import type { BaseClub, BaseData } from "../data/types";
import type { Repository } from "../persistence/repository";
import type { IsoDate } from "../persistence/types";

/**
 * `transferencias` (compra e venda de jogadores) e `compensacoes` (rescisões e passes de staff) levam os dois sinais: o que
 * entra e o que sai no mesmo mês somam-se. Os patrocínios passam a vir de contratos de patrocínio reais (RZ-311/RZ-219); até lá
 * vêm da fórmula por escalão e reputação.
 */
export type FinancialCategory = "ticketing" | "sponsorships" | "commercial" | "prizes" | "transfers" | "compensations" | "wages" | "staff" | "stadium" | "fixed";
export type Month = Partial<Record<FinancialCategory, number>>;


export function clubBalance(repo: Repository, club: BaseClub): number {
  const v = repo.meta(`balance.${club.id}`);
  return v === undefined ? club.finances : Number(v);
}

export function clubMonth(repo: Repository, club: string): Month {
  const v = repo.meta(`month.${club}`);
  return v ? (JSON.parse(v) as Month) : {};
}

/** Regista um lançamento: soma ao saldo e ao mês. Receitas positivas, despesas negativas. */
export function post(repo: Repository, club: BaseClub, category: FinancialCategory, value: number): void {
  if (!value) return;
  repo.setMeta(`balance.${club.id}`, String(Math.round(clubBalance(repo, club) + value)));
  const month = clubMonth(repo, club.id);
  month[category] = Math.round((month[category] ?? 0) + value);
  repo.setMeta(`month.${club.id}`, JSON.stringify(month));
}

/** Razão reputação / referência do escalão, com limites e expoente: o quanto o clube vale acima ou abaixo do típico. */
export function factorReputation(club: BaseClub, params: Params): number {
  const m = params.finances.model;
  const r = Math.min(m.ratioReputation.max, Math.max(m.ratioReputation.min, club.reputation / m.refReputation[club.tier]));
  return r ** m.exponentReputation;
}

export function monthlyWageBill(repo: Repository, club: string): number {
  return repo.clubPlayers(club).reduce((t, j) => t + (repo.contract(j.person)?.monthlyWage ?? 0), 0);
}

/** Custos mensais (salários + staff + estádio + fixos), sempre positivos. */
export function monthlyCosts(repo: Repository, club: BaseClub, params: Params): Record<"wages" | "staff" | "stadium" | "fixed", number> {
  const m = params.finances.model;
  const e: Tier = club.tier;
  return { wages: monthlyWageBill(repo, club.id), staff: m.monthlyStaff[e], stadium: Math.round((club.stadium.capacity * m.stadiumPerPlaceYear[e]) / 12), fixed: m.monthlyFixed[e] };
}

/** Receitas anuais fixas esperadas (patrocínios e comercial); a bilheteira e os prémios variam. */
export function annualFixedRevenues(club: BaseClub, params: Params): { sponsorships: number; commercial: number } {
  const m = params.finances.model;
  const f = factorReputation(club, params);
  return { sponsorships: Math.round(m.annualSponsorship[club.tier] * f), commercial: Math.round(m.annualCommercial[club.tier] * f) };
}

/**
 * Fecha o mês que acabou: salários, staff, estádio e fixos saem; patrocínios e comercial entram (1/12 do ano).
 * Grava `FECHO_FINANCEIRO` por clube. Os clubes fora da pirâmide (segunda distrital) não têm movimentos.
 */
export function closeMonth(repo: Repository, data: BaseData, params: Params, date: IsoDate, season: number, active: (club: BaseClub) => boolean): void {
  for (const c of data.clubs) {
    if (!active(c)) continue;
    const costs = monthlyCosts(repo, c, params);
    const fixed = annualFixedRevenues(c, params);
    post(repo, c, "sponsorships", fixed.sponsorships / 12);
    post(repo, c, "commercial", fixed.commercial / 12);
    post(repo, c, "wages", -costs.wages);
    post(repo, c, "staff", -costs.staff);
    post(repo, c, "stadium", -costs.stadium);
    post(repo, c, "fixed", -costs.fixed);
    const month = clubMonth(repo, c.id);
    const revenues = Object.values(month).reduce((t, v) => t + Math.max(0, v as number), 0);
    const expenses = Object.values(month).reduce((t, v) => t + Math.min(0, v as number), 0);
    repo.appendEvent({ type: "FINANCIAL_CLOSE", date, season, visibility: "private", origin: "match", entities: [{ k: "club", id: c.id, roleKind: "club" }], data: { revenues, expenses, balance: clubBalance(repo, c), month } });
    repo.setMeta(`month.${c.id}`, "{}");
  }
}

// --- estado descritivo público (HISTORICO_EVENTOS §5.1) ---

export type Health = "nearBankruptcy" | "atRisk" | "tight";
export type Wealth = "powerful" | "veryRich" | "rich" | "comfortable" | "wellOff" | "stable" | "modest" | "poor";
export type FinancialState = { state: Health | Wealth; /** O gamer vê exato: sem erro de estimativa. */ exact: boolean };

const BANDS: Record<Tier, [Wealth, Wealth, Wealth, Wealth, Wealth]> = {
  firstLeague: ["powerful", "rich", "wellOff", "modest", "poor"],
  secondLeague: ["veryRich", "rich", "stable", "modest", "poor"],
  thirdLeague: ["veryRich", "rich", "stable", "modest", "poor"],
  cp: ["rich", "comfortable", "stable", "modest", "poor"],
  district: ["rich", "comfortable", "stable", "modest", "poor"],
};

type Measure = { club: BaseClub; balance: number; costs: number; revenues: number };

/** Receitas anuais esperadas (patrocínios + comercial + bilheteira típica de ~15 jogos em casa): serve o estado público e o orçamento. */
export function estimatedAnnualRevenue(c: BaseClub, params: Params): number {
  const m = params.finances.model;
  const fixed = annualFixedRevenues(c, params);
  return fixed.sponsorships + fixed.commercial + c.stadium.capacity * m.occupancy[c.tier] * m.ticketPrice[c.tier] * 15;
}

function measure(repo: Repository, c: BaseClub, params: Params): Measure {
  const cm = monthlyCosts(repo, c, params);
  return { club: c, balance: clubBalance(repo, c), costs: cm.wages + cm.staff + cm.stadium + cm.fixed, revenues: estimatedAnnualRevenue(c, params) };
}

/**
 * A palavra pública sobre as finanças de um clube. Saúde primeiro (meses de folga e dívida), depois riqueza como percentil de
 * `receitas anuais + saldo` entre os clubes do mesmo escalão. Para um clube que não é o do gamer, com probabilidade
 * `probErroEstimativaRival` a banda de riqueza vem uma ao lado (estável por seed, clube e época).
 */
export function financialState(repo: Repository, data: BaseData, params: Params, club: BaseClub, options: { own: boolean; season: number; seed: string }): FinancialState {
  const p = params.finances;
  const eu = measure(repo, club, params);
  const bye = eu.costs > 0 ? eu.balance / eu.costs : Infinity;
  const debt = Math.max(0, -eu.balance);
  if (bye < 0 && debt > p.bankruptcyRevenueAboutDebt * eu.revenues) return { state: "nearBankruptcy", exact: options.own };
  if (bye < p.riskMonthsBye || eu.balance < 0) return { state: "atRisk", exact: options.own };
  if (bye < p.tightMonthsBye) return { state: "tight", exact: options.own };
  const equal = data.clubs.filter((c) => c.tier === club.tier).map((c) => (c.id === club.id ? eu : measure(repo, c, params)));
  const resources = (x: Measure) => x.revenues + x.balance;
  const below = equal.filter((x) => resources(x) < resources(eu)).length;
  const percentile = equal.length > 1 ? (below / (equal.length - 1)) * 100 : 50;
  const [a, b, c2, d] = p.wealthPercentiles;
  let band = percentile >= a ? 0 : percentile >= b ? 1 : percentile >= c2 ? 2 : percentile >= d ? 3 : 4;
  if (!options.own) {
    const rng = new Rng(options.seed, `financas/${club.id}/${options.season}`);
    if (rng.float() < p.rivalEstimateErrorProb) band = Math.min(4, Math.max(0, band + (rng.float() < 0.5 ? -1 : 1)));
  }
  return { state: BANDS[club.tier][band] as Wealth, exact: options.own };
}

const nextMonth = (rowKey: string): string => {
  const [a, m] = rowKey.split("-").map(Number) as [number, number];
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`;
};

/**
 * Fecha todos os meses em atraso até ao mês de `data` (inclusive: o fecho do dia 1 fecha o mês anterior). Corre ao passar para
 * o dia 1 de cada mês e ao mudar de época, para que os meses sem jogos (junho, julho) também paguem os custos.
 */
export function closeUntilMonths(repo: Repository, data: BaseData, params: Params, date: IsoDate, season: number, active: (club: BaseClub) => boolean): void {
  const target = date.slice(0, 7);
  const last = repo.meta("finances.closedUntil");
  if (last === undefined) { repo.setMeta("finances.closedUntil", target); return; }
  let m = last;
  while (m < target) {
    m = nextMonth(m);
    closeMonth(repo, data, params, `${m}-01`, season, active);
  }
  repo.setMeta("finances.closedUntil", m);
}

/**
 * Pagamento entre dois clubes (compra de um jogador, passe de staff, indemnização): o comprador paga e o vendedor recebe, na
 * mesma transação. `categoria` é `transferencias` (jogadores) ou `compensacoes` (staff). Quem chama grava o evento da transferência.
 */
export function settle(repo: Repository, buyer: BaseClub, seller: BaseClub, value: number, category: "transfers" | "compensations"): void {
  if (!(value > 0)) return;
  repo.transaction(() => {
    post(repo, buyer, category, -value);
    post(repo, seller, category, value);
  });
}
