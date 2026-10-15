import type { NivelReputacao, Parametros } from "../config/parametros";

/** A reputação (0-10 000) em palavra: mundial, continental, nacional, regional, local ou obscuro. */
export function nivelDeReputacao(reputacao: number, params: Parametros): NivelReputacao {
  const n = params.reputacao.niveis.find((x) => reputacao >= x.min);
  return (n ?? params.reputacao.niveis.at(-1) as { nivel: NivelReputacao }).nivel;
}
