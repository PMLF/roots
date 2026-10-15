/** Força de uma equipa a partir dos seus onze, e escolha automática do onze (RZ-104). */
import { qualidadeAtual } from "../mundo/jogador";
import type { Atributo, Atributos, Posicao } from "../mundo/tipos";
import type { Parametros } from "../config/parametros";
import { FORMACOES, modificadoresTatica } from "./formacoes";
import type { EquipaJogo, JogadorEmCampo, Tatica } from "./tipos";

export type ForcaEquipa = { ataque: number; controlo: number; defesa: number; guardaRedes: number };

type Grupo = { pesos: Partial<Record<Posicao, number>>; atributos: readonly Atributo[] };

const ATAQUE: Grupo = { pesos: { ST: 1, RW: 0.8, LW: 0.8, AM: 0.7, CM: 0.3 }, atributos: ["finalizacao", "drible", "desmarcacao", "velocidade", "tecnica"] };
const CONTROLO: Grupo = { pesos: { CM: 1, DM: 0.8, AM: 0.8, RW: 0.3, LW: 0.3, RB: 0.2, LB: 0.2 }, atributos: ["passe", "visao", "controloBola", "decisao", "trabalhoEquipa"] };
const DEFESA: Grupo = { pesos: { CB: 1, DM: 0.8, RB: 0.7, LB: 0.7, CM: 0.3 }, atributos: ["desarme", "marcacao", "posicionamento", "antecipacao"] };
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

/**
 * Quatro números (escala 1-20) que resumem a equipa. Pura.
 * Com `tatica` e `params`, somam-se os efeitos da formação realmente em campo, do estilo, da intensidade, da linha e do fair play (RZ-108).
 */
export function forcaEquipa(onze: readonly JogadorEmCampo[], tatica?: Tatica, params?: Parametros): ForcaEquipa {
  const gr = onze.find((j) => j.posicao === "GK");
  const base = {
    ataque: ponderada(onze, ATAQUE),
    controlo: ponderada(onze, CONTROLO),
    defesa: ponderada(onze, DEFESA),
    guardaRedes: gr ? media(gr.atributos, GR_ATRIBUTOS) * gr.forma : 3,
  };
  if (!tatica || !params) return base;
  const m = modificadoresTatica(onze.map((j) => j.posicao), tatica, params.tatica, base.controlo);
  return { ...base, ataque: base.ataque + m.ataque, controlo: base.controlo + m.controlo, defesa: base.defesa + m.defesa };
}

/** 4-3-3, a formação por omissão enquanto não há táticas (RZ-108). */
export const FORMACAO_PADRAO: readonly Posicao[] = FORMACOES["4-3-3"];

export type CandidatoOnze = { pessoa: string; posicoes: { pos: string; aptidao: number }[]; atributos: Record<string, number>; alturaCm: number };

/** Escolhe o melhor onze disponível para a formação: cada posição fica com quem lá rende mais (aptidão incluída). Determinístico. */
export function onzeAutomatico(candidatos: readonly CandidatoOnze[], formacao: readonly Posicao[] = FORMACAO_PADRAO): JogadorEmCampo[] {
  return onzeComValor(candidatos, formacao).onze;
}

/** Como `onzeAutomatico`, mais o valor médio do onze (qualidade na posição × aptidão), para comparar formações. */
export function onzeComValor(candidatos: readonly CandidatoOnze[], formacao: readonly Posicao[] = FORMACAO_PADRAO): { onze: JogadorEmCampo[]; valor: number } {
  const livres = [...candidatos];
  const onze: JogadorEmCampo[] = [];
  let total = 0;
  // o guarda-redes primeiro, para não ser gasto fora de sítio
  const ordem = [...formacao].sort((a, b) => (a === "GK" ? -1 : b === "GK" ? 1 : 0));
  for (const pos of ordem) {
    let melhor = -1;
    let valor = -Infinity;
    livres.forEach((c, i) => {
      const apt = c.posicoes.find((p) => p.pos === pos)?.aptidao;
      const fator = apt === undefined ? (pos === "GK" ? 0.1 : 0.45) : apt / 20;
      const v = qualidadeAtual(c.atributos as Atributos, pos) * fator;
      if (v > valor || (v === valor && melhor >= 0 && c.pessoa < (livres[melhor] as CandidatoOnze).pessoa)) {
        valor = v;
        melhor = i;
      }
    });
    if (melhor < 0) break;
    const [c] = livres.splice(melhor, 1) as [CandidatoOnze];
    total += valor;
    onze.push({ id: c.pessoa, posicao: pos, atributos: c.atributos as Atributos, alturaCm: c.alturaCm, forma: 1 });
  }
  return { onze, valor: onze.length > 0 ? total / onze.length : 0 };
}

export function equipaDe(clube: string, candidatos: readonly CandidatoOnze[], formacao?: readonly Posicao[]): EquipaJogo {
  return { clube, onze: onzeAutomatico(candidatos, formacao) };
}
