/**
 * O que a Câmara faz com o prémio do Estado (docs/DESIGN_RULES.md §3): o milhão não vai automaticamente para o clube. O autarca reparte-o
 * pelas áreas da Câmara pela mesma agenda do orçamento (traços dele e necessidade da cidade: o serviço que está pior pesa mais), e
 * parte pode perder-se pelo caminho com pouca integridade (a rotunda).
 * Desporto: dinheiro para o clube (no clube do gamer, uma reserva para obras no estádio que ele tem de pedir).
 * Saúde, educação (escolas e universidades), mobilidade, habitação, segurança e lazer (que inclui o turismo): pontos que se somam ao alvo do
 * serviço da cidade no fecho da época.
 */
import { post } from "../club/finances";
import { cityStateNow } from "../city/cities";
import { COUNCIL_AREAS, type CityService, type CouncilArea, type Params } from "../config/parameters";
import type { BaseClub, BaseData } from "../data/types";
import type { Repository } from "../persistence/repository";
import { AREA_SERVICE, agendaOf, mayorOf } from "./agenda";
import { relationOf } from "./relation";

const CREDIT = (club: string) => `council.credit.${club}`;
const INVEST = (city: string) => `council.invest.${city}`;
/** Dinheiro da Câmara reservado para uma obra no estádio do clube (€). */
export const stadiumCredit = (repo: Repository, club: string): number => Number(repo.meta(CREDIT(club)) ?? 0);
export const useStadiumCredit = (repo: Repository, club: string, amount: number): void => repo.setMeta(CREDIT(club), String(Math.max(0, Math.round(stadiumCredit(repo, club) - amount))));

/** Pontos que o prémio investido soma ao alvo de cada serviço da cidade no fecho desta época. */
export const prizeInvestment = (repo: Repository, city: string): Partial<Record<CityService, number>> => JSON.parse(repo.meta(INVEST(city)) ?? "{}") as Partial<Record<CityService, number>>;
export const clearPrizeInvestment = (repo: Repository, city: string): void => { if (repo.meta(INVEST(city))) repo.setMeta(INVEST(city), "{}"); };

export type PrizeUse = {
  /** Quanto foi para cada área (€). */
  areas: Record<CouncilArea, number>;
  /** O que se perdeu pelo caminho (€). */
  leaked: number;
  /** A área que recebeu mais. */
  top: CouncilArea;
};

/** Reparte o prémio da Câmara e aplica-o: dinheiro ao clube, reserva para o estádio, pontos nos serviços da cidade. */
export function usePrize(repo: Repository, data: BaseData, params: Params, club: BaseClub, isGamer: boolean, season: number): PrizeUse {
  const cfg = params.prizes.council;
  const amount = params.prizes.city;
  const mayor = mayorOf(repo, data, club.city);
  const zero = Object.fromEntries(COUNCIL_AREAS.map((a) => [a, 0])) as Record<CouncilArea, number>;
  if (!mayor) { post(repo, club, "subsidies", amount); return { areas: { ...zero, sport: amount }, leaked: 0, top: "sport" }; }

  const state = cityStateNow(repo, data, params, club.city);
  const agenda = agendaOf(repo.meta("seed") ?? "?", mayor, state, params);
  const share = { ...agenda.share };
  // quem está de bem com o autarca (no clube do gamer) vê mais dinheiro a ir para o clube
  if (isGamer) share.sport *= Math.max(0.2, 1 + cfg.relationToSport * (relationOf(repo, params, mayor.person).value - 50) / 50);
  const total = COUNCIL_AREAS.reduce((s, a) => s + share[a], 0);
  const leak = Math.min(cfg.leak.max, Math.max(0, cfg.leak.base + cfg.leak.integrity * (10 - mayor.traits.integrity) / 10));
  const leaked = Math.round(amount * leak);
  const spend = amount - leaked;
  const areas = Object.fromEntries(COUNCIL_AREAS.map((a) => [a, Math.round((spend * share[a]) / total)])) as Record<CouncilArea, number>;

  if (areas.sport > 0) {
    if (isGamer) repo.setMeta(CREDIT(club.id), String(stadiumCredit(repo, club.id) + areas.sport));
    else post(repo, club, "subsidies", areas.sport);
  }
  const population = Math.max(1000, state?.population ?? 15_000);
  const invest = prizeInvestment(repo, club.city);
  for (const a of COUNCIL_AREAS) {
    const service = AREA_SERVICE[a];
    if (service && areas[a] > 0) invest[service] = Math.min(cfg.invest.maxPoints, (invest[service] ?? 0) + Math.min(cfg.invest.maxPoints, cfg.invest.pointsPer * (areas[a] / population) * 100));
  }
  repo.setMeta(INVEST(club.city), JSON.stringify(invest));
  const top = [...COUNCIL_AREAS].sort((a, b) => areas[b] - areas[a])[0]!;
  repo.setMeta(`council.prize.${club.city}`, JSON.stringify({ season, areas, leaked }));
  return { areas, leaked, top };
}
