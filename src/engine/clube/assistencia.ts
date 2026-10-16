/**
 * Assistência simples (RZ-115 v1): estádio × ocupação do escalão × valor do clube × cultura de futebol da cidade × dérbi ×
 * grande visitante × final. Determinística, sem aleatoriedade (o jogo já tem a sua). Forma, preço e decisões de subida/descida
 * entram na versão completa do RZ-115. A receita de bilheteira é a assistência × preço do escalão.
 */
import type { Parametros } from "../config/parametros";
import type { ClubeBase } from "../dados/tipos";
import { fatorReputacao } from "./financas";

export type EntradaAssistencia = { casa: ClubeBase; fora: ClubeBase; culturaFutebol: number; final?: boolean };

export function assistenciaDoJogo(e: EntradaAssistencia, params: Parametros): { assistencia: number; receita: number } {
  const m = params.financas.modelo;
  const a = params.assistencia;
  const esc = e.casa.escalao;
  let ocupacao = m.ocupacao[esc] * fatorReputacao(e.casa, params) ** 0.5;
  ocupacao *= 1 - m.ocupacaoCultura + 2 * m.ocupacaoCultura * (e.culturaFutebol / 100);
  const derbi = e.casa.rival === e.fora.id || e.fora.rival === e.casa.id;
  if (derbi) ocupacao *= e.casa.rival === e.fora.id && e.fora.rival === e.casa.id ? a.derbiMutuo : a.derbi;
  if (e.fora.reputacao > e.casa.reputacao) ocupacao *= 1 + a.grandeVisitanteCoef * Math.min(1, e.fora.reputacao / e.casa.reputacao - 1);
  if (e.final) ocupacao *= a.multFinal;
  const assistencia = Math.round(e.casa.estadio.capacidade * Math.min(1, Math.max(0.05, ocupacao)));
  return { assistencia, receita: Math.round(assistencia * m.precoBilhete[esc]) };
}
