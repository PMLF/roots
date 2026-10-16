/**
 * Cansaço por jogos (RZ-177): a forma de cada jogador no dia de um jogo depende dos minutos que jogou nos últimos dias.
 * Um jogo por semana é normal (forma 1); cada 90 minutos a mais na janela tiram `perdaPor90`, até `minimo`. Quem joga
 * pouco não ganha bónus (a forma nunca passa de 1). A forma entra na força da equipa e no risco de lesão.
 */
import { forDays, addDays } from "../calendar/dates";
import type { Params } from "../config/parameters";
import { physicalState } from "../injuries/state";
import type { Repository } from "../persistence/repository";
import type { IsoDate } from "../persistence/types";

/** Forma a partir da carga (minutos na janela). Pura. */
export function formPerWorkload(workload: number, params: Params): number {
  const f = params.match.form;
  const excess = Math.max(0, workload - f.normalWorkload);
  return Math.min(1, Math.max(f.min, 1 - f.lossPer90 * (excess / 90)));
}

/** Forma máxima de quem regressou de lesão em `regressouEm`: perde ritmo e recupera dia a dia (RZ-177). Pura. */
export function formInReturn(today: IsoDate, returnedIn: IsoDate, params: Params): number {
  const r = params.match.form.ret;
  return Math.min(1, r.initial + r.gainByDay * Math.max(0, forDays(today) - forDays(returnedIn)));
}

/** A forma de cada jogador em `hoje`: considera os jogos desde `hoje − janelaDias` (inclusive) até ontem. */
export function playersForm(repo: Repository, players: readonly string[], today: IsoDate, params: Params): Map<string, number> {
  const minutes = repo.playedMinutes(players, addDays(today, -params.match.form.daysWindow), today);
  return new Map(players.map((j) => {
    const workload = formPerWorkload(minutes.get(j) ?? 0, params);
    const record = physicalState(repo, j, today, params).returnedNewly;
    return [j, record ? Math.min(workload, formInReturn(today, record.returnedIn, params)) : workload] as const;
  }));
}
