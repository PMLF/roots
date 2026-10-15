import { CHAVE } from "./jogador";
import type { Atributo, Posicao } from "./tipos";

/** Nível atual de um jogador (1-20): média dos atributos-chave da posição (a mesma medida da geração do mundo). */
export function nivelGeral(valor: (a: Atributo) => number | undefined, posicao: Posicao): number | undefined {
  const vs = CHAVE[posicao].map(valor).filter((v): v is number => v !== undefined);
  if (vs.length < CHAVE[posicao].length) return undefined;
  return Math.round((vs.reduce((s, v) => s + v, 0) / vs.length) * 10) / 10;
}
