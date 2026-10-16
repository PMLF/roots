/**
 * Níveis de detalhe (RZ-109; docs/MOTOR_JOGO.md §10).
 *
 * Há um só motor de jogo: custa ≈ 0,4 ms por jogo, por isso uma época inteira de todo o mundo (≈ 4 500 jogos)
 * demora uns segundos e não compensa manter um segundo simulador «estatístico» que divergisse do primeiro. O nível
 * decide o que se **devolve e guarda**:
 *
 * - **0 — detalhe total:** jogos do clube do gamer. Todos os eventos (para o jogo ao vivo e o comentário), relatório
 *   completo com estatísticas e nota de cada jogador, todos os momentos-chave.
 * - **1 — resumido:** todos os outros jogos. Mesmo motor e mesmos resultados, mas só se guarda o que é público e conta
 *   histórias: golos com marcador e assistente, cartões, lesões, substituições, estatísticas das equipas e a nota do
 *   homem do jogo. As histórias (hat-tricks, vermelhos, goleadas, reviravoltas, golos nos descontos) saem com o mesmo
 *   critério nos dois níveis.
 *
 * Ligas estrangeiras e agregados («só números», lod 2-3 de `MODELO_DADOS`) chegam com RZ-403, com o seu próprio modelo.
 */
import type { Parametros } from "../config/parametros";
import type { EventoNovo } from "../persistencia/tipos";
import { relatorioDoJogo, type CartaoJogo, type GoloJogo, type LesaoJogo, type MomentoChave, type RelatorioJogo } from "./estatisticas";
import { historiasDoJogo } from "./historias";
import { registoDoJogo, type MetaJogo } from "./registo";
import { simularJogo } from "./simulador";
import type { EntradaJogo, EventoJogo, ResumoJogo } from "./tipos";

export type NivelDetalhe = 0 | 1;

/** Nível de um jogo: 0 se envolve o clube do gamer, 1 nos restantes. */
export function nivelDoJogo(casa: string, fora: string, clubeGamer?: string): NivelDetalhe {
  return clubeGamer !== undefined && (casa === clubeGamer || fora === clubeGamer) ? 0 : 1;
}

/** O que se sabe publicamente de um jogo de nível 1. */
export type RelatorioPublico = Pick<RelatorioJogo, "duracao" | "golosCasa" | "golosFora" | "intervalo" | "posseCasa" | "casa" | "fora" | "golos" | "cartoes" | "lesoes"> & {
  /** Só golos, expulsões e lesões. */
  momentos: MomentoChave[];
  homemDoJogo: { id: string; nota: number };
};

type Comum = {
  resumo: ResumoJogo;
  registo: ReturnType<typeof registoDoJogo>;
  /** Eventos de notícia (hat-trick, vermelho, goleada, golo notável), para acrescentar a seguir ao `registarJogo`. */
  historias: EventoNovo[];
};
export type JogoResolvido =
  | (Comum & { nivel: 0; eventos: EventoJogo[]; relatorio: RelatorioJogo })
  | (Comum & { nivel: 1; relatorio: RelatorioPublico });

const MOMENTOS_PUBLICOS = new Set<MomentoChave["tipo"]>(["golo", "expulsao", "lesao"]);

function publico(r: RelatorioJogo): RelatorioPublico {
  const melhor = r.jogadores.find((j) => j.id === r.homemDoJogo);
  return {
    duracao: r.duracao,
    golosCasa: r.golosCasa,
    golosFora: r.golosFora,
    intervalo: r.intervalo,
    posseCasa: r.posseCasa,
    casa: r.casa,
    fora: r.fora,
    golos: r.golos as GoloJogo[],
    cartoes: r.cartoes as CartaoJogo[],
    lesoes: r.lesoes as LesaoJogo[],
    momentos: r.momentos.filter((m) => MOMENTOS_PUBLICOS.has(m.tipo)),
    homemDoJogo: { id: r.homemDoJogo, nota: melhor?.nota ?? 0 },
  };
}

/** Joga um jogo ao nível de detalhe indicado e devolve o que esse nível guarda. */
export function jogarJogo(entrada: EntradaJogo, nivel: NivelDetalhe, meta: MetaJogo, params: Parametros): JogoResolvido {
  const { eventos, resumo } = simularJogo(entrada, params);
  return resolverJogo(entrada, eventos, resumo, nivel, meta, params);
}

/** O que se guarda de um jogo já simulado (por inteiro, de uma vez ou aos poucos, com mudanças a meio). */
export function resolverJogo(entrada: EntradaJogo, eventos: EventoJogo[], resumo: ResumoJogo, nivel: NivelDetalhe, meta: MetaJogo, params: Parametros): JogoResolvido {
  const completo = relatorioDoJogo(entrada, { casa: entrada.casa, fora: entrada.fora }, eventos, resumo, params);
  const registo = registoDoJogo(meta, entrada.casa, entrada.fora, eventos, resumo, completo);
  const historias = historiasDoJogo(meta, { casa: entrada.casa.clube, fora: entrada.fora.clube }, completo, params);
  if (nivel === 0) return { nivel, resumo, eventos, relatorio: completo, registo, historias };
  // nível 1: só se guarda a nota do homem do jogo; as lesões de jogadores que entraram e saíram aparecem na mesma
  const rel = publico(completo);
  const participacoes = registo.participacoes.map((p) => (p.jogador === rel.homemDoJogo.id ? p : { jogador: p.jogador, clube: p.clube, titular: p.titular, minutos: p.minutos }));
  return { nivel, resumo, relatorio: rel, registo: { ...registo, participacoes }, historias };
}
