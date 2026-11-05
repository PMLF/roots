/**
 * Objetivo da época do gamer (RZ-161): o presidente pede uma classificação na liga, calculada pela reputação do clube face aos rivais
 * (`stretch` × posição esperada). No fim da época, cumprir dá um bónus na conta pessoal e confiança (menos ressentimento); falhar deixa
 * ressentimento. Estado no save: meta `gamer.objective` (JSON, só o da época em curso).
 */
import type { Params } from "../config/parameters";
import type { BaseData } from "../data/types";
import { deposit } from "../personal/bank";
import type { Repository } from "../persistence/repository";
import type { IsoDate } from "../persistence/types";
import { addGrudge, contractOf, relieveGrudge } from "./gamerContract";
import { currentSeason } from "./seasonPyramid";

export type Objective = { season: number; club: string; league: string; /** Posição a atingir (1 = campeão). */ rank: number; /** Clubes na liga. */ of: number; /** Bónus em dinheiro se for cumprido. */ bonus: number };

export const objectiveOf = (repo: Repository): Objective | undefined => {
  const raw = repo.meta("gamer.objective");
  return raw ? (JSON.parse(raw) as Objective) : undefined;
};

/** Cria o objetivo da época em curso se ainda não existe (ou é de outro clube/época). Barato: só mexe se for preciso. */
export function ensureObjective(repo: Repository, data: BaseData, params: Params): Objective | undefined {
  const clubId = repo.meta("gamer.club");
  const contract = contractOf(repo);
  const club = clubId ? data.clubs.find((c) => c.id === clubId) : undefined;
  if (!club || !contract || contract.club !== club.id) return undefined;
  const season = currentSeason(repo);
  const current = objectiveOf(repo);
  if (current && current.season === season && current.club === club.id) return current;
  const o = params.coach.contract.objective;
  const league = data.clubs.filter((c) => c.league === club.league).sort((a, b) => b.reputation - a.reputation || (a.id < b.id ? -1 : 1));
  const expected = league.findIndex((c) => c.id === club.id) + 1;
  const rank = Math.min(league.length, Math.max(1, Math.round(expected * o.stretch)));
  const objective: Objective = { season, club: club.id, league: club.league, rank, of: league.length, bonus: Math.round((contract.monthlyWage * o.bonusMonths) / 10) * 10 };
  repo.setMeta("gamer.objective", JSON.stringify(objective));
  return objective;
}

/** Fecho da época: confere a classificação final com o objetivo. Devolve o resultado (ou `undefined` se não havia objetivo desta época). */
export function settleObjective(repo: Repository, params: Params, today: IsoDate, season: number): { met: boolean; rank: number; target: number; bonus: number } | undefined {
  const objective = objectiveOf(repo);
  if (!objective || objective.season !== season || repo.meta("gamer.club") !== objective.club) return undefined;
  const position = repo.standings(objective.league, season).findIndex((l) => l.club === objective.club) + 1;
  if (position === 0) return undefined;
  const o = params.coach.contract.objective;
  const met = position <= objective.rank;
  repo.transaction(() => {
    if (met) {
      deposit(repo, params, today, objective.bonus);
      relieveGrudge(repo, params, today, o.trustGain);
    } else addGrudge(repo, params, today, undefined, o.missGrudge);
    repo.appendEvent({ type: "GAMER_OBJECTIVE", date: today, season, visibility: "exposed", origin: "match", entities: [{ k: "club", id: objective.club, roleKind: "objetivo" }], data: { met, rank: position, target: objective.rank, of: objective.of, bonus: met ? objective.bonus : 0 } });
    repo.setMeta("gamer.objective", "");
  });
  return { met, rank: position, target: objective.rank, bonus: met ? objective.bonus : 0 };
}
