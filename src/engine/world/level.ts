import { KEY } from "./player";
import type { Attribute, Position } from "./types";

/** Nível atual de um jogador (1-20): média dos atributos-chave da posição (a mesma medida da geração do mundo). */
export function generalLevel(value: (a: Attribute) => number | undefined, position: Position): number | undefined {
  const vs = KEY[position].map(value).filter((v): v is number => v !== undefined);
  if (vs.length < KEY[position].length) return undefined;
  return Math.round((vs.reduce((s, v) => s + v, 0) / vs.length) * 10) / 10;
}
