/**
 * Fase de Promoção (RZ-125; docs/DESIGN_REGRAS.md §1): os 20 campeões distritais jogam em 4 grupos de 5 (os das séries
 * A-D do CP), todos contra todos a uma volta; os 2 primeiros de cada grupo sobem ao CP, para a série do grupo.
 * Puro: o calendário usa o motor de todos-contra-todos e a classificação os desempates `promocao`.
 */
import { Rng } from "../aleatorio/rng";
import { todosContraTodos, type Ronda } from "../calendario/todosContraTodos";
import type { Parametros } from "../config/parametros";
import type { ClubeId, DistritoId, SerieCP } from "../dados/tipos";
import { ordenarClassificacao, type JogoResultado } from "../competicao/classificacao";
import type { LinhaClassificacao } from "../persistencia/tipos";
import { SERIES } from "./movimentos";

export type GrupoPromocao = { serie: SerieCP; clubes: ClubeId[] };

/** Agrupa os campeões distritais pela série do CP do seu distrito. */
export function formarGrupos(campeoes: readonly { clube: ClubeId; distrito: DistritoId }[], serieDoDistrito: (d: DistritoId) => SerieCP, params: Parametros): { grupos: GrupoPromocao[]; avisos: string[] } {
  const avisos: string[] = [];
  const grupos = SERIES.map((serie): GrupoPromocao => ({ serie, clubes: campeoes.filter((c) => serieDoDistrito(c.distrito) === serie).map((c) => c.clube) }));
  for (const g of grupos) if (g.clubes.length !== params.piramide.promocao.campeoesPorGrupo) avisos.push(`grupo ${g.serie} da Fase de Promoção tem ${g.clubes.length} clubes (esperado ${params.piramide.promocao.campeoesPorGrupo})`);
  return { grupos, avisos };
}

/** Jornadas de um grupo (uma volta, mando alternado). Com 5 clubes há folga em cada ronda. */
export function calendarioDoGrupo(g: GrupoPromocao, epoca: number, seed: string, params: Parametros): Ronda[] {
  return todosContraTodos(g.clubes, params.piramide.promocao.voltas, new Rng(seed, `promocao/${epoca}/${g.serie}`));
}

/** Classificação final de um grupo a partir dos jogos disputados. */
export function classificarGrupo(g: GrupoPromocao, jogos: readonly JogoResultado[], epoca: number, seed: string, params: Parametros, reputacao: ReadonlyMap<ClubeId, number>): ClubeId[] {
  const { pontosVitoria, pontosEmpate } = params.classificacao;
  const linhas = new Map<ClubeId, LinhaClassificacao>(g.clubes.map((c) => [c, { clube: c, jogos: 0, vitorias: 0, empates: 0, derrotas: 0, golosMarcados: 0, golosSofridos: 0, pontosJogos: 0, ajuste: 0, pontos: 0 }]));
  for (const j of jogos) {
    const casa = linhas.get(j.casa);
    const fora = linhas.get(j.fora);
    if (!casa || !fora) continue;
    for (const [l, gm, gs] of [[casa, j.golosCasa, j.golosFora], [fora, j.golosFora, j.golosCasa]] as const) {
      l.jogos++; l.golosMarcados += gm; l.golosSofridos += gs;
      if (gm > gs) { l.vitorias++; l.pontosJogos += pontosVitoria; } else if (gm === gs) { l.empates++; l.pontosJogos += pontosEmpate; } else l.derrotas++;
      l.pontos = l.pontosJogos + l.ajuste;
    }
  }
  return ordenarClassificacao([...linhas.values()], jogos, params.desempate.promocao, { pontosVitoria, pontosEmpate, seed, competicao: `promocao-${g.serie}`, epoca, reputacao, clubes: g.clubes }).map((l) => l.clube);
}

/** Os promovidos de um grupo, já com a série para onde sobem. */
export const promovidosDoGrupo = (g: GrupoPromocao, classificacao: readonly ClubeId[], params: Parametros) =>
  classificacao.slice(0, params.piramide.promocao.promovidosPorGrupo).map((clube) => ({ clube, serie: g.serie }));
