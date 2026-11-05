/**
 * Mercado de treinadores (RZ-157; decidido a 15-10-2026): o gamer escolhe um clube para começar e só muda se se demitir
 * (o despedimento chega com o sistema de presidente, RZ-210). Sem clube, o tempo continua e todas as segundas-feiras
 * chegam ofertas de clubes de reputação igual ou inferior à do clube que deixou, mais uma surpresa acima.
 * Estado no save (meta; texto vazio = sem valor): `gamer.club`, `gamer.previous`, `gamer.offers`.
 */
import { Rng } from "../random/rng";
import type { Params } from "../config/parameters";
import type { BaseClub, BaseData } from "../data/types";
import type { Repository } from "../persistence/repository";
import type { IsoDate } from "../persistence/types";
import { isInSecondDistrict } from "./districts";
import { currentSeason } from "./seasonPyramid";
import { prepareSeason } from "./prepare";
import { acceptableRatio, budgetOf, clauseAmount, clauseMonthsOf, contractOf, referenceWage, signRenewal, type Terms } from "./gamerContract";
import { bankOf, deposit } from "../personal/bank";
import { post } from "../club/finances";

export type Offer = { club: string; since: IsoDate };

export const gamerOffers = (repo: Repository): Offer[] => {
  const raw = repo.meta("gamer.offers");
  return raw ? (JSON.parse(raw) as Offer[]) : [];
};

/** Sem clube: despedido ou demitido (`gamer.previous`) ou a começar o jogo sem clube (`gamer.unemployed`, RZ-501). */
export const isUnemployed = (repo: Repository): boolean => !repo.meta("gamer.club") && (!!repo.meta("gamer.previous") || repo.meta("gamer.unemployed") === "1");

/** Renova as ofertas (determinístico por save e data). `dados` já traz as ligas atuais. */
export function updateOffers(repo: Repository, data: BaseData, params: Params, today: IsoDate): Offer[] {
  const previous = repo.meta("gamer.previous");
  const ref = data.clubs.find((c) => c.id === previous)?.reputation ?? params.coach.unemployedStartReputation;
  // quem começa sem clube só vê ofertas da região onde diz que vive (se houver clubes que cheguem)
  const region = repo.meta("gamer.region");
  const cityHub = new Map(data.cities.map((c) => [c.id, c.hub] as const));
  const rng = new Rng(repo.meta("seed") ?? "?", `ofertas/${today}`);
  const take = (pool: typeof data.clubs, n: number) => {
    const p = [...pool];
    const out: typeof data.clubs = [];
    while (out.length < n && p.length > 0) out.push(p.splice(rng.integer(0, p.length - 1), 1)[0]!);
    return out;
  };
  const everywhere = data.clubs.filter((c) => c.id !== previous && !isInSecondDistrict(c.league));
  const near = region ? everywhere.filter((c) => cityHub.get(c.city) === region) : everywhere;
  const others = near.filter((c) => c.reputation <= ref + params.coach.surpriseMargin).length >= params.coach.offers + params.coach.surprises ? near : everywhere;
  const normal = take(others.filter((c) => c.reputation <= ref), params.coach.offers);
  const ids = new Set(normal.map((c) => c.id));
  const surprises = take(others.filter((c) => !ids.has(c.id) && c.reputation > ref && c.reputation <= ref + params.coach.surpriseMargin), params.coach.surprises);
  const offers = [...normal, ...surprises].map((c): Offer => ({ club: c.id, since: today }));
  repo.setMeta("gamer.offers", JSON.stringify(offers));
  // cada oferta é uma mensagem na caixa de entrada com estado e botões (RZ-164)
  const surpriseIds = new Set(surprises.map((c) => c.id));
  for (const o of offers) repo.appendEvent({ type: "CLUB_OFFER", date: today, season: currentSeason(repo), visibility: "exposed", origin: "generated", entities: [{ k: "club", id: o.club, roleKind: "offer" }, ...(previous ? [{ k: "club" as const, id: previous, roleKind: "previous" }] : [])], data: { surprise: surpriseIds.has(o.club) } });
  return offers;
}

/**
 * Quanto custa ao gamer demitir-se agora: a cláusula de rescisão do contrato (paga da conta pessoal, no máximo o saldo), ou nada
 * se o contrato já acabou ou não existe.
 */
export function resignCost(repo: Repository, params: Params, today: IsoDate): number {
  const contract = contractOf(repo);
  if (!contract || contract.club !== repo.meta("gamer.club") || today >= contract.end) return 0;
  return Math.min(clauseAmount(params, contract), Math.max(0, bankOf(repo, params, today).balance));
}

/** O gamer demite-se do clube atual: paga a cláusula de rescisão, fica sem clube e recebe as primeiras ofertas. */
export function resign(repo: Repository, data: BaseData, params: Params): { club: string; paid: number } {
  const club = repo.meta("gamer.club");
  if (!club) throw new Error("Não tens clube de que te demitir");
  const { today } = prepareSeason(repo, data, params);
  const paid = resignCost(repo, params, today);
  repo.transaction(() => {
    if (paid > 0) {
      deposit(repo, params, today, -paid);
      const base = data.clubs.find((c) => c.id === club);
      if (base) post(repo, base, "compensations", paid);
    }
    repo.appendEvent({ type: "GAMER_RESIGNATION", date: today, season: currentSeason(repo), visibility: "exposed", origin: "match", entities: [{ k: "club", id: club, roleKind: "deixado" }], data: { paid } });
    repo.setMeta("gamer.previous", club);
    repo.setMeta("gamer.club", "");
    updateOffers(repo, data, params, today);
  });
  return { club, paid };
}

/**
 * A direção perdeu a confiança no gamer (RZ-210): despede-o e paga a cláusula de rescisão (do clube para a conta pessoal do gamer).
 * O gamer fica sem clube, com ofertas, e a direção guarda a data.
 */
export function sackByResults(repo: Repository, data: BaseData, params: Params, club: string, date: IsoDate, season: number): void {
  if (repo.meta("gamer.club") !== club) return;
  const contract = contractOf(repo);
  const amount = contract && contract.club === club && date < contract.end ? clauseAmount(params, contract) : 0;
  repo.transaction(() => {
    const base = data.clubs.find((c) => c.id === club);
    if (amount > 0) {
      deposit(repo, params, date, amount);
      if (base) post(repo, base, "compensations", -amount);
    }
    repo.appendEvent({ type: "GAMER_RESIGNATION", date, season, visibility: "exposed", origin: "match", entities: [{ k: "club", id: club, roleKind: "deixado" }], data: { reason: "results", compensation: amount } });
    repo.setMeta("gamer.previous", club);
    repo.setMeta("gamer.club", "");
    updateOffers(repo, data, params, date);
  });
}

/** Aceita uma das ofertas em vigor. */
export function acceptOffer(repo: Repository, club: string): void {
  if (!isUnemployed(repo)) throw new Error("Já tens clube");
  if (!gamerOffers(repo).some((o) => o.club === club)) throw new Error("Esse clube não te fez nenhuma oferta");
  const today = (repo.meta("date.today") ?? "") as IsoDate;
  repo.transaction(() => {
    repo.appendEvent({ type: "GAMER_HIRED", date: today, season: currentSeason(repo), visibility: "exposed", origin: "match", entities: [{ k: "club", id: club, roleKind: "contratou" }], data: { previous: repo.meta("gamer.previous") ?? "" } });
    repo.setMeta("gamer.club", club);
    repo.setMeta("gamer.previous", "");
    repo.setMeta("gamer.unemployed", "");
    repo.setMeta("gamer.offers", "");
  });
}

/** O clube do gamer desceu à segunda distrital: despede-o automaticamente e deixa de ser jogável até voltar à pirâmide. */
export function sackByRelegation(repo: Repository, data: BaseData, params: Params, club: string, date: IsoDate, season: number): void {
  if (repo.meta("gamer.club") !== club) return;
  repo.transaction(() => {
    repo.appendEvent({ type: "GAMER_RESIGNATION", date, season, visibility: "exposed", origin: "match", entities: [{ k: "club", id: club, roleKind: "deixado" }], data: { reason: "secondDistrict" } });
    repo.setMeta("gamer.previous", club);
    repo.setMeta("gamer.club", "");
    updateOffers(repo, data, params, date);
  });
}

/** Condições em que o presidente renovava hoje (mantém o salário ou sobe até ao que aceita; a cláusula e o orçamento ficam), ou `undefined` se não quer renovar. */
export function renewalTerms(repo: Repository, data: BaseData, params: Params, club: BaseClub, today: IsoDate): Terms | undefined {
  const contract = contractOf(repo);
  if (!contract || contract.club !== club.id) return undefined;
  const { max } = acceptableRatio(repo, data, params, club, today, true);
  if (max < params.coach.contract.expiry.renewMinRatio) return undefined;
  const wage = Math.max(contract.monthlyWage, Math.floor((Math.min(max, 1.15) * referenceWage(club, params)) / 10) * 10);
  return { monthlyWage: wage, years: params.coach.contract.defaultYears, clauseMonths: clauseMonthsOf(params, contract), budget: budgetOf(contract) };
}

/** Proposta de renovação do presidente (RZ-164): feita no aviso de fim do contrato; o gamer aceita, negocia ou recusa. */
export type Renewal = { date: IsoDate; contractStart: IsoDate; terms: Terms; status: "pending" | "accepted" | "declined" };
/** A última proposta guardada (mesmo que seja de um contrato anterior). */
export const lastRenewal = (repo: Repository): Renewal | undefined => { const raw = repo.meta("gamer.renewal"); return raw ? (JSON.parse(raw) as Renewal) : undefined; };
/** A proposta do contrato em vigor. */
export const renewalOf = (repo: Repository): Renewal | undefined => { const r = lastRenewal(repo); const c = contractOf(repo); return r && c && r.contractStart === c.start ? r : undefined; };

/** Dentro do prazo de aviso o presidente propõe a renovação (uma vez por contrato), se a quer fazer: aparece na caixa de entrada. */
export function ensureRenewalProposal(repo: Repository, data: BaseData, params: Params, today: IsoDate): Renewal | undefined {
  const clubId = repo.meta("gamer.club");
  const contract = contractOf(repo);
  const club = clubId ? data.clubs.find((c) => c.id === clubId) : undefined;
  if (!club || !contract || contract.club !== club.id) return undefined;
  const existing = renewalOf(repo);
  if (existing && existing.contractStart === contract.start) return existing;
  const days = (d: string) => Math.floor(Date.parse(`${d}T00:00:00Z`) / 86400000);
  if (days(contract.end) - days(today) > params.coach.contract.expiry.noticeDays || today >= contract.end) return undefined;
  const terms = renewalTerms(repo, data, params, club, today);
  if (!terms) return undefined;
  const r: Renewal = { date: today, contractStart: contract.start, terms, status: "pending" };
  repo.setMeta("gamer.renewal", JSON.stringify(r));
  repo.appendEvent({ type: "CONTRACT_PROPOSAL", date: today, season: currentSeason(repo), visibility: "exposed", origin: "match", entities: [{ k: "club", id: club.id, roleKind: "proposta" }], data: { monthlyWage: terms.monthlyWage, years: terms.years, until: contract.end } });
  return r;
}

/** O gamer responde à proposta de renovação: aceitar renova já nas condições propostas; recusar deixa o contrato caducar no fim. */
export function answerRenewal(repo: Repository, data: BaseData, params: Params, today: IsoDate, accept: boolean): void {
  const r = renewalOf(repo);
  const clubId = repo.meta("gamer.club");
  const club = clubId ? data.clubs.find((c) => c.id === clubId) : undefined;
  if (!r || r.status !== "pending" || !club) throw new Error("Não há proposta de renovação por responder");
  repo.transaction(() => {
    if (accept) signRenewal(repo, params, club, today, r.terms);
    repo.setMeta("gamer.renewal", JSON.stringify({ ...r, status: accept ? "accepted" : "declined" } satisfies Renewal));
  });
}

/**
 * Fim do contrato do gamer (RZ-161): no dia em que acaba, o presidente renova se a aceitação chega a `expiry.renewMinRatio` (mantém o
 * salário ou sobe até ao que aceita, nunca abaixo do atual); senão o contrato caduca, o gamer fica sem clube e recebe ofertas.
 * Devolve o que aconteceu (`undefined` se o contrato ainda não acabou).
 */
export function endOfContract(repo: Repository, data: BaseData, params: Params, today: IsoDate): "renewed" | "left" | undefined {
  const clubId = repo.meta("gamer.club");
  const contract = contractOf(repo);
  const club = clubId ? data.clubs.find((c) => c.id === clubId) : undefined;
  if (!club || !contract || contract.club !== club.id || today < contract.end) return undefined;
  const renewal = renewalTerms(repo, data, params, club, today);
  // o gamer recusou a proposta de renovação (RZ-164): o contrato caduca
  if (renewal && renewalOf(repo)?.status !== "declined") {
    repo.transaction(() => signRenewal(repo, params, club, today, renewal));
    return "renewed";
  }
  repo.transaction(() => {
    repo.appendEvent({ type: "GAMER_RESIGNATION", date: today, season: currentSeason(repo), visibility: "exposed", origin: "match", entities: [{ k: "club", id: club.id, roleKind: "deixado" }], data: { reason: "contractEnd" } });
    repo.setMeta("gamer.previous", club.id);
    repo.setMeta("gamer.club", "");
    updateOffers(repo, data, params, today);
  });
  return "left";
}

/** Começar o jogo sem clube (RZ-501): diz-se a região onde se vive, que dá a cidade de casa e as primeiras ofertas. */
export function startUnemployed(repo: Repository, data: BaseData, params: Params, region: string): { home: string } {
  const home = data.cities.filter((c) => c.hub === region).sort((a, b) => b.population - a.population)[0];
  if (!home) throw new Error("Região desconhecida");
  if (repo.meta("gamer.club")) throw new Error("Já tens clube");
  const { today } = prepareSeason(repo, data, params);
  repo.transaction(() => {
    repo.setMeta("gamer.unemployed", "1");
    repo.setMeta("gamer.region", region);
    repo.setMeta("gamer.home", home.id);
    updateOffers(repo, data, params, today);
  });
  return { home: home.id };
}
