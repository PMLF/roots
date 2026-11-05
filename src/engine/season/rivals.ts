/**
 * Rivais do clube do gamer (RZ-174): só os resultados contra rivais vão para a caixa de entrada.
 * Rival geográfico: o rival principal do clube ou uma rivalidade mútua / do mesmo concelho nos dados.
 * Rival direto: clube perto na tabela, em pontos ou em lugares, quando já se jogou o suficiente.
 */
import type { Params } from "../config/parameters";
import type { BaseData } from "../data/types";
import type { Repository } from "../persistence/repository";
import type { IsoDate, NewEvent } from "../persistence/types";

export type RivalReason = "geografico" | "table";

function geographicRival(data: BaseData, a: string, b: string): boolean {
  const ca = data.clubs.find((c) => c.id === a);
  const cb = data.clubs.find((c) => c.id === b);
  if (ca?.rival === b || cb?.rival === a) return true;
  return data.rivalries.some((r) => ((r.a === a && r.b === b) || (r.a === b && r.b === a)) && (r.mutual || r.sameMunicipality));
}

/** Motivo pelo qual `outro` é rival de `meu` neste momento (antes do jogo), ou `undefined`. */
export function rivalReason(repo: Repository, data: BaseData, params: Params, competition: string, season: number, mine: string, other: string): RivalReason | undefined {
  if (geographicRival(data, mine, other)) return "geografico";
  const table = [...repo.standings(competition, season)].sort((x, y) => y.points - x.points || (y.scoredGoals - y.concededGoals) - (x.scoredGoals - x.concededGoals) || y.scoredGoals - x.scoredGoals);
  const i = table.findIndex((l) => l.club === mine);
  const j = table.findIndex((l) => l.club === other);
  if (i < 0 || j < 0) return undefined;
  const { pointsRival, placesRival, matchesMinRival } = params.inbox;
  const a = table[i]!;
  const b = table[j]!;
  if (a.matches < matchesMinRival || b.matches < matchesMinRival) return undefined;
  return Math.abs(a.points - b.points) <= pointsRival || Math.abs(i - j) <= placesRival ? "table" : undefined;
}

/** Marca um jogo do gamer como contra um rival (a caixa de entrada só mostra estes resultados). */
export function rivalEvent(match: string, home: string, away: string, date: IsoDate, season: number, round: number, cause: number, reason: RivalReason): NewEvent {
  return { type: "RIVAL_MATCH", date, season, round, visibility: "private", cause, entities: [{ k: "club", id: home, roleKind: "home" }, { k: "club", id: away, roleKind: "away" }, { k: "match", id: match }], data: { reason } };
}
