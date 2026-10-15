/**
 * Estado físico a partir do histórico (RZ-107): lesões são eventos públicos `LESAO`, nada se apaga.
 * Dados do evento: `{ tipo, gravidade, dias, ate, recaida, jogo?, minuto? }`; `ate` = primeiro dia em que já pode jogar.
 */
import { comparar, somarDias } from "../calendario/datas";
import { paraDias } from "../calendario/datas";
import type { Parametros } from "../config/parametros";
import type { Repositorio } from "../persistencia/repositorio";
import type { Data, Evento, EventoNovo } from "../persistencia/tipos";
import type { Lesao, TipoLesao } from "./lesao";

export const EVENTO_LESAO = "LESAO";

export type LesaoRegistada = Lesao & { ate: Data; data: Data; jogo?: string };

export type EstadoFisico = {
  jogador: string;
  /** A lesão que o impede de jogar hoje. */
  lesionado?: LesaoRegistada & { diasRestantes: number };
  /** Regressou há menos de `janelaRecaida` dias: o tipo da última lesão e o dia do regresso. */
  recemRegressado?: { tipo: TipoLesao; regressouEm: Data };
  /** Total de lesões no histórico. */
  lesoesNoHistorico: number;
};

/** O evento `LESAO` de uma lesão sofrida no dia `data` (num jogo ou treino). */
export function eventoLesao(opcoes: { jogador: string; clube: string; data: Data; epoca: number; jornada?: number; lesao: Lesao; jogo?: string; minuto?: number }): EventoNovo {
  const { jogador, clube, data, epoca, jornada, lesao, jogo, minuto } = opcoes;
  return {
    tipo: EVENTO_LESAO,
    data,
    epoca,
    ...(jornada !== undefined ? { jornada } : {}),
    vis: "publico",
    origem: "jogo",
    entidades: [
      { k: "pessoa", id: jogador, papel: "lesionado" },
      { k: "clube", id: clube },
      ...(jogo ? [{ k: "jogo" as const, id: jogo }] : []),
    ],
    dados: { tipo: lesao.tipo, gravidade: lesao.gravidade, dias: lesao.dias, ate: somarDias(data, lesao.dias), recaida: lesao.recaida, ...(jogo ? { jogo } : {}), ...(minuto !== undefined ? { minuto } : {}) },
  };
}

function lerLesao(e: Evento): LesaoRegistada {
  const d = e.dados as { tipo: TipoLesao; gravidade: 1 | 2 | 3 | 4 | 5; dias: number; ate: Data; recaida?: boolean; jogo?: string };
  return { tipo: d.tipo, gravidade: d.gravidade, dias: d.dias, ate: d.ate, recaida: !!d.recaida, data: e.data, ...(d.jogo ? { jogo: d.jogo } : {}) };
}

/** Estado físico de um jogador no dia `hoje`. */
export function estadoFisico(repo: Repositorio, jogador: string, hoje: Data, params: Parametros): EstadoFisico {
  const lesoes = repo
    .eventosDe({ k: "pessoa", id: jogador }, { tipo: EVENTO_LESAO })
    .filter((e) => e.entidades.some((x) => x.k === "pessoa" && x.id === jogador && x.papel === "lesionado") && comparar(e.data, hoje) <= 0)
    .map(lerLesao)
    .sort((a, b) => comparar(a.data, b.data));
  const ativa = lesoes.filter((l) => comparar(l.ate, hoje) > 0).at(-1);
  const ultima = lesoes.at(-1);
  const out: EstadoFisico = { jogador, lesoesNoHistorico: lesoes.length };
  if (ativa) out.lesionado = { ...ativa, diasRestantes: paraDias(ativa.ate) - paraDias(hoje) };
  else if (ultima && paraDias(hoje) - paraDias(ultima.ate) < params.lesoes.janelaRecaida) out.recemRegressado = { tipo: ultima.tipo, regressouEm: ultima.ate };
  return out;
}

/** Os lesionados de uma lista de jogadores no dia `hoje`. */
export function lesionadosDoClube(repo: Repositorio, jogadores: readonly string[], hoje: Data, params: Parametros): EstadoFisico[] {
  return jogadores.map((j) => estadoFisico(repo, j, hoje, params)).filter((e) => e.lesionado);
}

/** Tira os lesionados dos candidatos a titular. */
export function semLesionados<T extends { pessoa: string }>(candidatos: readonly T[], lesionados: readonly EstadoFisico[]): T[] {
  const fora = new Set(lesionados.filter((l) => l.lesionado).map((l) => l.jogador));
  return candidatos.filter((c) => !fora.has(c.pessoa));
}
