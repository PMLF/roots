/**
 * Prémio por vencer cada competição (RZ-216; docs/DESIGN_REGRAS.md §3). Puro: calcula os valores. A tesouraria do clube
 * entra com as finanças (RZ-114); por agora o valor fica no evento `PREMIO_COMPETICAO`, de onde se reconstrói.
 * Taça de Portugal, Supertaça e Taças Distritais têm os valores nos parâmetros e só pagam quando existirem (RZ-140 a RZ-142).
 */
import type { Parametros } from "../config/parametros";
import type { CidadeBase, DistritoId } from "../dados/tipos";

/** Riqueza de um distrito = orçamento municipal total × apoio médio dos autarcas ao desporto (1-10). */
function riqueza(cidades: readonly CidadeBase[]): number {
  if (cidades.length === 0) return 0;
  const orcamento = cidades.reduce((t, c) => t + c.orcamentoMunicipal, 0);
  const apoio = cidades.reduce((t, c) => t + c.autarca.apoioDesporto, 0) / cidades.length;
  return orcamento * apoio;
}

/**
 * Fator multiplicativo dos prémios distritais por distrito: riqueza do distrito sobre a riqueza média, limitado a
 * `premios.fatorDistrito`. Normalizado para que a média dos distritos seja ~1 (o valor nos parâmetros é a média).
 */
export function fatoresDeDistrito(cidades: readonly CidadeBase[], params: Parametros): Map<DistritoId, number> {
  const porDistrito = new Map<DistritoId, CidadeBase[]>();
  for (const c of cidades) porDistrito.set(c.distrito, [...(porDistrito.get(c.distrito) ?? []), c]);
  const r = new Map([...porDistrito].map(([d, cs]) => [d, riqueza(cs)] as const));
  const media = r.size > 0 ? [...r.values()].reduce((t, v) => t + v, 0) / r.size : 0;
  const { min, max } = params.premios.fatorDistrito;
  return new Map([...r].map(([d, v]) => [d, media > 0 ? Math.min(max, Math.max(min, v / media)) : 1] as const));
}

export type TipoPremio = "primeiraLiga" | "segundaLiga" | "terceiraLiga" | "serieCp" | "vencedorCp" | "distrital" | "fasePromocao";

/** Valor do prémio (euros, arredondado às dezenas), com o fator do distrito nas competições distritais. */
export function valorDoPremio(tipo: TipoPremio, params: Parametros, fator = 1): number {
  const base = params.premios.competicoes[tipo];
  const f = tipo === "distrital" || tipo === "fasePromocao" ? fator : 1;
  return Math.round((base * f) / 10) * 10;
}

/** Valor do finalista vencido numa competição a eliminar. */
export function valorDoFinalista(vencedor: number, params: Parametros): number {
  return Math.round((vencedor * params.premios.finalistaVencido) / 10) * 10;
}

/**
 * Prémio de ultrapassar uma ronda da Taça de Portugal. `rondasAntesDasMeias` = 0 nas meias-finais (a ronda que leva à final),
 * 1 nos quartos, 2 nos oitavos… Cada ronda para trás vale `fator` da seguinte, com mínimo.
 */
export function premioDeRonda(rondasAntesDasMeias: number, params: Parametros): number {
  const { meias, fator, minimo } = params.premios.tacaPortugalPorRonda;
  return Math.max(minimo, Math.round(meias * fator ** Math.max(0, rondasAntesDasMeias)));
}
