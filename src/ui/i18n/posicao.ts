import type { Key } from "./index";

/** As posições guardam-se em inglês (GK, CB, LW…); a interface mostra a sigla e o nome no idioma escolhido. */
type T = (rowKey: Key) => string;
export const abbreviationPosition = (t: T, pos: string): string => (pos ? t(`posicao.${pos}` as Key) : "");
export const namePosition = (t: T, pos: string): string => (pos ? t(`posicao.nome.${pos}` as Key) : "");
