import type { Key } from "./index";

/** As posições guardam-se em inglês (GK, CB, LW…); a interface mostra a sigla e o nome no idioma escolhido. */
type T = (rowKey: Key) => string;
export const abbreviationPosition = (t: T, pos: string): string => (pos ? t(`position.${pos}` as Key) : "");
export const namePosition = (t: T, pos: string): string => (pos ? t(`position.name.${pos}` as Key) : "");

/** Ordem de «quão atacante» é a posição, do guarda-redes ao ponta de lança (para ordenar tabelas). */
const ATTACKING_ORDER = ["GK", "CB", "RB", "LB", "DM", "CM", "AM", "RW", "LW", "ST"];
export const rankPosition = (pos: string): number => {
  const i = ATTACKING_ORDER.indexOf(pos);
  return i < 0 ? ATTACKING_ORDER.length : i;
};
