/**
 * Estado físico a partir do histórico (RZ-107): lesões são eventos públicos `LESAO`, nada se apaga.
 * Dados do evento: `{ tipo, gravidade, dias, ate, recaida, jogo?, minuto? }`; `ate` = primeiro dia em que já pode jogar.
 */
import { compare, addDays } from "../calendar/dates";
import { forDays } from "../calendar/dates";
import type { Params } from "../config/parameters";
import type { Repository } from "../persistence/repository";
import type { IsoDate, HistoryEvent, NewEvent } from "../persistence/types";
import type { Injury, InjuryType } from "./injury";

export const INJURY_EVENT = "INJURY";

export type RecordedInjury = Injury & { until: IsoDate; date: IsoDate; match?: string };

export type PhysicalState = {
  player: string;
  /** A lesão que o impede de jogar hoje. */
  injured?: RecordedInjury & { remainingDays: number };
  /** Regressou há menos de `janelaRecaida` dias: o tipo da última lesão e o dia do regresso. */
  returnedNewly?: { type: InjuryType; returnedIn: IsoDate };
  /** Total de lesões no histórico. */
  injuriesInHistory: number;
};

/** O evento `LESAO` de uma lesão sofrida no dia `data` (num jogo ou treino). */
export function injuryEvent(options: { player: string; club: string; date: IsoDate; season: number; round?: number; injury: Injury; match?: string; minute?: number }): NewEvent {
  const { player, club, date, season, round, injury, match, minute } = options;
  return {
    type: INJURY_EVENT,
    date,
    season,
    ...(round !== undefined ? { round } : {}),
    visibility: "exposed",
    origin: "match",
    entities: [
      { k: "person", id: player, roleKind: "injured" },
      { k: "club", id: club },
      ...(match ? [{ k: "match" as const, id: match }] : []),
    ],
    data: { type: injury.type, severity: injury.severity, days: injury.days, until: addDays(date, injury.days), relapse: injury.relapse, ...(match ? { match } : {}), ...(minute !== undefined ? { minute } : {}) },
  };
}

function readInjury(e: HistoryEvent): RecordedInjury {
  const d = e.data as { type: InjuryType; severity: 1 | 2 | 3 | 4 | 5; days: number; until: IsoDate; relapse?: boolean; match?: string };
  return { type: d.type, severity: d.severity, days: d.days, until: d.until, relapse: !!d.relapse, date: e.date, ...(d.match ? { match: d.match } : {}) };
}

/** Estado físico de um jogador no dia `hoje`. */
export function physicalState(repo: Repository, player: string, today: IsoDate, params: Params): PhysicalState {
  const injuries = repo
    .eventsOf({ k: "person", id: player }, { type: INJURY_EVENT })
    .filter((e) => e.entities.some((x) => x.k === "person" && x.id === player && x.roleKind === "injured") && compare(e.date, today) <= 0)
    .map(readInjury)
    .sort((a, b) => compare(a.date, b.date));
  const active = injuries.filter((l) => compare(l.until, today) > 0).at(-1);
  const last = injuries.at(-1);
  const out: PhysicalState = { player, injuriesInHistory: injuries.length };
  if (active) out.injured = { ...active, remainingDays: forDays(active.until) - forDays(today) };
  else if (last && forDays(today) - forDays(last.until) < params.injuries.relapseWindow) out.returnedNewly = { type: last.type, returnedIn: last.until };
  return out;
}

/** Os lesionados de uma lista de jogadores no dia `hoje`. */
export function clubInjured(repo: Repository, players: readonly string[], today: IsoDate, params: Params): PhysicalState[] {
  return players.map((j) => physicalState(repo, j, today, params)).filter((e) => e.injured);
}

/** Tira os lesionados dos candidatos a titular. */
export function withoutInjured<T extends { person: string }>(candidates: readonly T[], injured: readonly PhysicalState[]): T[] {
  const away = new Set(injured.filter((l) => l.injured).map((l) => l.player));
  return candidates.filter((c) => !away.has(c.person));
}
