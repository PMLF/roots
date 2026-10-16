/** Forma de um jogador a partir do calendário (RZ-107): jogos e minutos recentes, descanso e regresso de lesão. */
import { clamp } from "../aleatorio/rng";
import type { Params } from "../config/parametros";
import { forDays } from "../calendario/datas";
import type { IsoDate } from "../persistencia/tipos";

export type RecentHistory = {
  today: IsoDate;
  /** Jogos em que participou (qualquer data anterior a `hoje`; só contam os da janela). */
  matches: readonly { date: IsoDate; minutes: number }[];
  /** Dia em que regressou da última lesão, se for recente. */
  returnedIn?: IsoDate;
};

/**
 * Forma (0,7-1,1; 1 = descansado). Cada jogo recente e cada 90 minutos cansam; o descanso desde o último jogo recupera.
 * Quem regressa de lesão volta com forma baixa e vai crescendo dia a dia.
 */
export function playerForm(h: RecentHistory, params: Params): number {
  const f = params.injuries.form;
  const today = forDays(h.today);
  const recent = h.matches.filter((j) => today - forDays(j.date) > 0 && today - forDays(j.date) <= f.window);
  let form = f.base;
  if (recent.length > 0) {
    const last = Math.max(...recent.map((j) => forDays(j.date)));
    const loss = recent.reduce((s, j) => s + f.byRecentMatch + (f.por90 * j.minutes) / 90, 0);
    form -= Math.max(0, loss - f.recoveryByDay * (today - last));
  }
  if (h.returnedIn) {
    const days = today - forDays(h.returnedIn);
    if (days >= 0) form = Math.min(form, f.onReturn + f.recoveryByDay * days);
  }
  return clamp(form, f.min, f.max);
}
