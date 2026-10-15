/** Forma de um jogador a partir do calendário (RZ-107): jogos e minutos recentes, descanso e regresso de lesão. */
import { limitar } from "../aleatorio/rng";
import type { Parametros } from "../config/parametros";
import { paraDias } from "../calendario/datas";
import type { Data } from "../persistencia/tipos";

export type HistoricoRecente = {
  hoje: Data;
  /** Jogos em que participou (qualquer data anterior a `hoje`; só contam os da janela). */
  jogos: readonly { data: Data; minutos: number }[];
  /** Dia em que regressou da última lesão, se for recente. */
  regressouEm?: Data;
};

/**
 * Forma (0,7-1,1; 1 = descansado). Cada jogo recente e cada 90 minutos cansam; o descanso desde o último jogo recupera.
 * Quem regressa de lesão volta com forma baixa e vai crescendo dia a dia.
 */
export function formaDoJogador(h: HistoricoRecente, params: Parametros): number {
  const f = params.lesoes.forma;
  const hoje = paraDias(h.hoje);
  const recentes = h.jogos.filter((j) => hoje - paraDias(j.data) > 0 && hoje - paraDias(j.data) <= f.janela);
  let forma = f.base;
  if (recentes.length > 0) {
    const ultimo = Math.max(...recentes.map((j) => paraDias(j.data)));
    const perda = recentes.reduce((s, j) => s + f.porJogoRecente + (f.por90 * j.minutos) / 90, 0);
    forma -= Math.max(0, perda - f.recuperacaoPorDia * (hoje - ultimo));
  }
  if (h.regressouEm) {
    const dias = hoje - paraDias(h.regressouEm);
    if (dias >= 0) forma = Math.min(forma, f.aoRegressar + f.recuperacaoPorDia * dias);
  }
  return limitar(forma, f.min, f.max);
}
