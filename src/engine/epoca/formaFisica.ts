/**
 * Cansaço por jogos (RZ-177): a forma de cada jogador no dia de um jogo depende dos minutos que jogou nos últimos dias.
 * Um jogo por semana é normal (forma 1); cada 90 minutos a mais na janela tiram `perdaPor90`, até `minimo`. Quem joga
 * pouco não ganha bónus (a forma nunca passa de 1). A forma entra na força da equipa e no risco de lesão.
 */
import { paraDias, somarDias } from "../calendario/datas";
import type { Parametros } from "../config/parametros";
import { estadoFisico } from "../lesoes/estado";
import type { Repositorio } from "../persistencia/repositorio";
import type { Data } from "../persistencia/tipos";

/** Forma a partir da carga (minutos na janela). Pura. */
export function formaPorCarga(carga: number, params: Parametros): number {
  const f = params.jogo.forma;
  const excesso = Math.max(0, carga - f.cargaNormal);
  return Math.min(1, Math.max(f.minimo, 1 - f.perdaPor90 * (excesso / 90)));
}

/** Forma máxima de quem regressou de lesão em `regressouEm`: perde ritmo e recupera dia a dia (RZ-177). Pura. */
export function formaNoRegresso(hoje: Data, regressouEm: Data, params: Parametros): number {
  const r = params.jogo.forma.regresso;
  return Math.min(1, r.inicial + r.ganhoPorDia * Math.max(0, paraDias(hoje) - paraDias(regressouEm)));
}

/** A forma de cada jogador em `hoje`: considera os jogos desde `hoje − janelaDias` (inclusive) até ontem. */
export function formaDosJogadores(repo: Repositorio, jogadores: readonly string[], hoje: Data, params: Parametros): Map<string, number> {
  const minutos = repo.minutosJogados(jogadores, somarDias(hoje, -params.jogo.forma.janelaDias), hoje);
  return new Map(jogadores.map((j) => {
    const carga = formaPorCarga(minutos.get(j) ?? 0, params);
    const reg = estadoFisico(repo, j, hoje, params).recemRegressado;
    return [j, reg ? Math.min(carga, formaNoRegresso(hoje, reg.regressouEm, params)) : carga] as const;
  }));
}
