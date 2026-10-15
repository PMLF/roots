/** Força de uma equipa a partir dos seus onze, e escolha automática do onze (RZ-104). */
import { qualidadeAtual } from "../mundo/jogador";
import type { Atributo, Atributos, Posicao } from "../mundo/tipos";
import type { EquipaJogo, JogadorEmCampo } from "./tipos";

export type ForcaEquipa = { ataque: number; controlo: number; defesa: number; guardaRedes: number };

type Grupo = { pesos: Partial<Record<Posicao, number>>; atributos: readonly Atributo[] };

const ATAQUE: Grupo = { pesos: { PL: 1, ED: 0.8, EE: 0.8, MO: 0.7, MC: 0.3 }, atributos: ["finalizacao", "drible", "desmarcacao", "velocidade", "tecnica"] };
const CONTROLO: Grupo = { pesos: { MC: 1, MDC: 0.8, MO: 0.8, ED: 0.3, EE: 0.3, DD: 0.2, DE: 0.2 }, atributos: ["passe", "visao", "controloBola", "decisao", "trabalhoEquipa"] };
const DEFESA: Grupo = { pesos: { DC: 1, MDC: 0.8, DD: 0.7, DE: 0.7, MC: 0.3 }, atributos: ["desarme", "marcacao", "posicionamento", "antecipacao"] };
const GR_ATRIBUTOS: readonly Atributo[] = ["reflexos", "manuseamento", "posicionamentoGR", "saidas"];

const media = (a: Atributos, ks: readonly Atributo[]): number => ks.reduce((s, k) => s + a[k], 0) / ks.length;

function ponderada(onze: readonly JogadorEmCampo[], g: Grupo): number {
  let soma = 0;
  let pesos = 0;
  for (const j of onze) {
    const w = g.pesos[j.posicao];
    if (!w) continue;
    soma += w * media(j.atributos, g.atributos) * j.forma;
    pesos += w;
  }
  return pesos > 0 ? soma / pesos : 5;
}

/** Quatro números (escala 1-20) que resumem a equipa. Pura. */
export function forcaEquipa(onze: readonly JogadorEmCampo[]): ForcaEquipa {
  const gr = onze.find((j) => j.posicao === "GR");
  return {
    ataque: ponderada(onze, ATAQUE),
    controlo: ponderada(onze, CONTROLO),
    defesa: ponderada(onze, DEFESA),
    guardaRedes: gr ? media(gr.atributos, GR_ATRIBUTOS) * gr.forma : 3,
  };
}

/** 4-3-3, a formação por omissão enquanto não há táticas (RZ-108). */
export const FORMACAO_PADRAO: readonly Posicao[] = ["GR", "DD", "DC", "DC", "DE", "MDC", "MC", "MO", "ED", "PL", "EE"];

export type CandidatoOnze = { pessoa: string; posicoes: { pos: string; aptidao: number }[]; atributos: Record<string, number>; alturaCm: number };

/** Escolhe o melhor onze disponível para a formação: cada posição fica com quem lá rende mais (aptidão incluída). Determinístico. */
export function onzeAutomatico(candidatos: readonly CandidatoOnze[], formacao: readonly Posicao[] = FORMACAO_PADRAO): JogadorEmCampo[] {
  const livres = [...candidatos];
  const onze: JogadorEmCampo[] = [];
  // o guarda-redes primeiro, para não ser gasto fora de sítio
  const ordem = [...formacao].sort((a, b) => (a === "GR" ? -1 : b === "GR" ? 1 : 0));
  for (const pos of ordem) {
    let melhor = -1;
    let valor = -Infinity;
    livres.forEach((c, i) => {
      const apt = c.posicoes.find((p) => p.pos === pos)?.aptidao;
      const fator = apt === undefined ? (pos === "GR" ? 0.1 : 0.45) : apt / 20;
      const v = qualidadeAtual(c.atributos as Atributos, pos) * fator;
      if (v > valor || (v === valor && melhor >= 0 && c.pessoa < (livres[melhor] as CandidatoOnze).pessoa)) {
        valor = v;
        melhor = i;
      }
    });
    if (melhor < 0) break;
    const [c] = livres.splice(melhor, 1) as [CandidatoOnze];
    onze.push({ id: c.pessoa, posicao: pos, atributos: c.atributos as Atributos, alturaCm: c.alturaCm, forma: 1 });
  }
  return onze;
}

export function equipaDe(clube: string, candidatos: readonly CandidatoOnze[], formacao?: readonly Posicao[]): EquipaJogo {
  return { clube, onze: onzeAutomatico(candidatos, formacao) };
}
