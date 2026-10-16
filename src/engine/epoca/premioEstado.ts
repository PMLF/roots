/**
 * Prémio do Estado por distrito (RZ-112; docs/DESIGN_REGRAS.md §3). Puro: escolhe, em cada distrito, o clube mais bem
 * classificado da pirâmide. A tesouraria do clube e o orçamento da Câmara entram com as finanças (RZ-114): por agora o
 * valor fica no evento `PREMIO_ESTADO`, de onde se reconstrói.
 */
import type { Escalao } from "../config/parametros";
import type { ClubeId, DistritoId } from "../dados/tipos";

export type ClubeClassificado = {
  clube: ClubeId;
  distrito: DistritoId;
  escalao: Escalao;
  /** Posição final na tabela da sua competição (no CP, dentro da série). */
  posicao: number;
  jogos: number;
  pontos: number;
  diferenca: number;
  golosMarcados: number;
  reputacao: number;
};

const ORDEM_ESCALAO: Record<Escalao, number> = { primeiraLiga: 0, segundaLiga: 1, terceiraLiga: 2, cp: 3, distrital: 4 };

/** Negativo se `a` é melhor classificado que `b`: escalão, posição, pontos por jogo, diferença, golos marcados, menor reputação. */
export function compararParaPremio(a: ClubeClassificado, b: ClubeClassificado): number {
  const ppg = (c: ClubeClassificado) => (c.jogos > 0 ? c.pontos / c.jogos : 0);
  return (
    ORDEM_ESCALAO[a.escalao] - ORDEM_ESCALAO[b.escalao] ||
    a.posicao - b.posicao ||
    ppg(b) - ppg(a) ||
    b.diferenca - a.diferenca ||
    b.golosMarcados - a.golosMarcados ||
    a.reputacao - b.reputacao ||
    (a.clube < b.clube ? -1 : a.clube > b.clube ? 1 : 0)
  );
}

/** O melhor classificado de cada distrito (só os distritos com clubes). Ordenado por distrito, para ser estável. */
export function premiadosPorDistrito(clubes: readonly ClubeClassificado[]): { distrito: DistritoId; clube: ClubeId }[] {
  const melhor = new Map<DistritoId, ClubeClassificado>();
  for (const c of clubes) {
    const atual = melhor.get(c.distrito);
    if (!atual || compararParaPremio(c, atual) < 0) melhor.set(c.distrito, c);
  }
  return [...melhor.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([distrito, c]) => ({ distrito, clube: c.clube }));
}

/** Anos seguidos em que o mesmo clube ganha o prémio do distrito (1 na primeira vez ou depois de outro vencedor). */
export function anosSeguidos(anterior: { clube: ClubeId; seguidos: number } | undefined, clube: ClubeId): number {
  return anterior && anterior.clube === clube ? anterior.seguidos + 1 : 1;
}
