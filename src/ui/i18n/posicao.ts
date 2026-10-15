import type { Chave } from "./index";

/** As posições guardam-se em inglês (GK, CB, LW…); a interface mostra a sigla e o nome no idioma escolhido. */
type T = (chave: Chave) => string;
export const siglaPosicao = (t: T, pos: string): string => (pos ? t(`posicao.${pos}` as Chave) : "");
export const nomePosicao = (t: T, pos: string): string => (pos ? t(`posicao.nome.${pos}` as Chave) : "");
