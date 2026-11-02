/**
 * O que a Câmara faz com o prémio do Estado (docs/DESIGN_RULES.md §3): não vai automaticamente para o clube, o autarca decide pela
 * personalidade (apoio ao desporto, vaidade, ambição, integridade) e, no clube do gamer, pela relação com ele.
 * `club`: entrega-o ao clube; `stadium`: reserva-o para uma obra no estádio (só no clube do gamer, que tem de a pedir); `vanish`: some-se em obras
 * de fachada (a famosa rotunda).
 */
import { post } from "../club/finances";
import type { BaseClub, BaseData } from "../data/types";
import type { Params } from "../config/parameters";
import type { Repository } from "../persistence/repository";
import { Rng } from "../random/rng";
import { mayorOf } from "./agenda";
import { relationOf } from "./relation";

export type PrizeChoice = "club" | "stadium" | "vanish";

const CREDIT = (club: string) => `council.credit.${club}`;
/** Dinheiro da Câmara reservado para uma obra no estádio do clube (€). */
export const stadiumCredit = (repo: Repository, club: string): number => Number(repo.meta(CREDIT(club)) ?? 0);
export const useStadiumCredit = (repo: Repository, club: string, amount: number): void => repo.setMeta(CREDIT(club), String(Math.max(0, Math.round(stadiumCredit(repo, club) - amount))));

/** A escolha do autarca: sorteio ponderado pelos traços (determinístico por cidade e época). */
export function choosePrize(repo: Repository, data: BaseData, params: Params, club: BaseClub, isGamer: boolean, season: number): PrizeChoice {
  const mayor = mayorOf(repo, data, club.city);
  if (!mayor) return "club";
  const w = params.prizes.council;
  const t = mayor.traits;
  const sport = (mayor.sportSupport - 5.5) / 4.5;
  const relation = isGamer ? (relationOf(repo, params, mayor.person).value - 50) / 50 : 0;
  const weights: Record<PrizeChoice, number> = {
    club: w.club.base + w.club.sport * sport + w.club.vanity * (t.vanity - 10) / 10 + w.club.relation * relation,
    stadium: isGamer ? w.stadium.base + w.stadium.ambition * (t.ambition - 10) / 10 + w.stadium.sport * sport : 0,
    vanish: w.vanish.base + w.vanish.integrity * (10 - t.integrity) / 10 + w.vanish.ambition * (t.ambition - 10) / 10 - w.vanish.sport * sport,
  };
  const entries = (Object.entries(weights) as [PrizeChoice, number][]).map(([k, v]) => [k, k === "stadium" && !isGamer ? 0 : Math.max(0.02, v)] as const);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  let x = new Rng(repo.meta("seed") ?? "?", `prize/council/${club.city}/${season}`).float() * total;
  for (const [k, v] of entries) { x -= v; if (x < 0) return k; }
  return "club";
}

/** Aplica a escolha: dinheiro para o clube, crédito para o estádio ou nada. Devolve o que se fez. */
export function applyPrize(repo: Repository, data: BaseData, params: Params, club: BaseClub, isGamer: boolean, season: number): { choice: PrizeChoice; amount: number } {
  const amount = params.prizes.city;
  const choice = choosePrize(repo, data, params, club, isGamer, season);
  if (choice === "club") post(repo, club, "subsidies", amount);
  else if (choice === "stadium") repo.setMeta(CREDIT(club.id), String(stadiumCredit(repo, club.id) + amount));
  repo.setMeta(`council.prize.${club.city}`, JSON.stringify({ season, choice, amount }));
  return { choice, amount };
}
