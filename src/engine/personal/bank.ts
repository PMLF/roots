/**
 * Finanças pessoais do gamer (RZ-162, 1.ª fatia): custo de vida da cidade, conta bancária e donativos.
 * As contas dele não aparecem no jogo: todos os meses entra na conta a sobra do ordenado (líquido menos o custo de vida) e nunca fica
 * negativa. Sem clube, o custo de vida sai da conta até ela chegar a zero. Os donativos saem da conta pessoal, nunca do clube.
 * Estado no save: meta `gamer.bank` (JSON) e `gamer.donations` (data do último donativo a cada empresa).
 */
import { addDays } from "../calendar/dates";
import { cityHistoryWithPast } from "../city/cities";
import type { Params } from "../config/parameters";
import type { BaseData } from "../data/types";
import type { Repository } from "../persistence/repository";
import type { IsoDate } from "../persistence/types";
import { currentSeason } from "../season/seasonPyramid";
import { contractOf } from "../season/gamerContract";

export type Bank = { balance: number; /** Último mês (AAAA-MM) já lançado. */ upTo: string };

const parse = <T>(raw: string | undefined, fallback: T): T => (raw ? (JSON.parse(raw) as T) : fallback);
export const bankOf = (repo: Repository, params: Params, today: IsoDate): Bank => parse(repo.meta("gamer.bank"), { balance: params.personal.startBalance, upTo: today.slice(0, 7) });

/** Custo de vida mensal na cidade: sobe com a dimensão da cidade e com a dificuldade de arranjar casa. */
export function livingCost(repo: Repository, data: BaseData, params: Params, city: string): number {
  const p = params.personal.living;
  const c = data.cities.find((x) => x.id === city);
  const state = cityHistoryWithPast(repo, data, params, city).at(-1)?.state;
  const size = 1 + p.sizeFactor * Math.log10(Math.max(1, (state?.population ?? c?.population ?? 15_000) / 15_000));
  const housing = 1 + p.housingFactor * ((50 - (state?.housing ?? 50)) / 50);
  return Math.round((p.base * Math.max(0.6, size) * housing) / 10) * 10;
}

/** Poupança mensal de quem tem este ordenado: líquido menos o custo de vida, nunca negativa. */
export const monthlySavings = (wage: number, living: number, params: Params): number => Math.max(0, Math.round((wage * params.personal.netShare - living) / 10) * 10);

const nextMonth = (m: string): string => { const [a, mm] = m.split("-").map(Number) as [number, number]; return mm === 12 ? `${a + 1}-01` : `${a}-${String(mm + 1).padStart(2, "0")}`; };

/** Lança os meses em atraso até ao mês de `today`. Chamada todos os dias; só faz algo ao virar o mês. */
export function accrueBank(repo: Repository, data: BaseData, params: Params, today: IsoDate): void {
  const bank = bankOf(repo, params, today);
  const target = today.slice(0, 7);
  if (bank.upTo >= target) { if (!repo.meta("gamer.bank")) repo.setMeta("gamer.bank", JSON.stringify(bank)); return; }
  const contract = contractOf(repo);
  const club = repo.meta("gamer.club");
  const previous = repo.meta("gamer.previous");
  // saves antigos sem contrato do gamer, ou ainda sem clube escolhido: não há ordenado nem conta a mexer
  if ((club && !contract) || (!club && !previous)) { repo.setMeta("gamer.bank", JSON.stringify({ ...bank, upTo: target })); return; }
  const homeClub = data.clubs.find((c) => c.id === (club ?? previous));
  const living = homeClub ? livingCost(repo, data, params, homeClub.city) : params.personal.living.base;
  const employed = !!club && !!contract && contract.club === club;
  let { balance, upTo } = bank;
  while (upTo < target) {
    upTo = nextMonth(upTo);
    balance = employed ? balance + monthlySavings(contract!.monthlyWage, living, params) : Math.max(0, balance - living);
  }
  repo.setMeta("gamer.bank", JSON.stringify({ balance: Math.round(balance), upTo } satisfies Bank));
}

export type DonationResult = { ok: true; balance: number; boost: number } | { ok: false; reason: "amount" | "funds" | "company" | "cooldown" };

/** Doação pessoal a uma empresa: o capital sobe `eficiência × valor` (limitado a uma fração do capital). Efeito relativo ao tamanho da empresa. */
export function donate(repo: Repository, params: Params, today: IsoDate, company: string, amount: number): DonationResult {
  const d = params.personal.donation;
  const value = Math.floor(amount);
  if (!(value >= d.min)) return { ok: false, reason: "amount" };
  const c = repo.companies({ state: "active" }).find((x) => x.id === company);
  if (!c) return { ok: false, reason: "company" };
  const bank = bankOf(repo, params, today);
  if (value > bank.balance) return { ok: false, reason: "funds" };
  const last = parse<Record<string, IsoDate>>(repo.meta("gamer.donations"), {})[company];
  if (last && addDays(last, d.cooldownDays) > today) return { ok: false, reason: "cooldown" };
  const gain = Math.min(c.capital * d.maxShare, value * d.efficiency);
  const boost = gain / c.capital;
  repo.transaction(() => {
    repo.updateCompany(company, { capital: Math.round(c.capital + gain) });
    repo.setMeta("gamer.bank", JSON.stringify({ ...bank, balance: bank.balance - value }));
    const log = parse<Record<string, IsoDate>>(repo.meta("gamer.donations"), {});
    repo.setMeta("gamer.donations", JSON.stringify({ ...log, [company]: today }));
    repo.appendEvent({
      type: "DONATION", date: today, season: currentSeason(repo), visibility: "exposed", origin: "match",
      entities: [{ k: "company", id: company, roleKind: "company" }, ...(c.owner ? [{ k: "person" as const, id: c.owner, roleKind: "owner" }] : [])],
      data: { amount: value, boost: Math.round(boost * 1000) / 1000 },
    });
  });
  return { ok: true, balance: bank.balance - value, boost };
}
