/**
 * Formações e efeitos da tática na força (RZ-108; docs/MOTOR_JOGO.md §8). Sem dependências do resto do motor, para
 * poderem ser usados por `equipa.ts` sem ciclos. As preferências do treinador estão em `tatica.ts`.
 */
import { limitar } from "../aleatorio/rng";
import type { Parametros } from "../config/parametros";
import type { Posicao } from "../mundo/tipos";
import type { Estilo, FormacaoId, Tatica } from "./tipos";

/** Posições de cada formação (o guarda-redes primeiro). Laterais a «alas» nos sistemas com três centrais. */
export const FORMACOES: Record<FormacaoId, readonly Posicao[]> = {
  "4-3-3": ["GR", "DD", "DC", "DC", "DE", "MDC", "MC", "MO", "ED", "PL", "EE"],
  "4-4-2": ["GR", "DD", "DC", "DC", "DE", "ED", "MC", "MC", "EE", "PL", "PL"],
  "4-2-3-1": ["GR", "DD", "DC", "DC", "DE", "MDC", "MDC", "ED", "MO", "EE", "PL"],
  "4-1-4-1": ["GR", "DD", "DC", "DC", "DE", "MDC", "ED", "MC", "MC", "EE", "PL"],
  "3-5-2": ["GR", "DC", "DC", "DC", "DD", "MC", "MC", "MO", "DE", "PL", "PL"],
  "5-3-2": ["GR", "DD", "DC", "DC", "DC", "DE", "MDC", "MDC", "MC", "PL", "PL"],
  "3-4-3": ["GR", "DC", "DC", "DC", "DD", "MC", "MC", "DE", "ED", "PL", "EE"],
  "4-3-1-2": ["GR", "DD", "DC", "DC", "DE", "MDC", "MC", "MC", "MO", "PL", "PL"],
};
export const FORMACAO_IDS = Object.keys(FORMACOES) as FormacaoId[];
export const ESTILOS: readonly Estilo[] = ["bonito", "equilibrado", "direto", "contraAtaque"];

export const TATICA_PADRAO: Tatica = { formacao: "4-3-3", estilo: "equilibrado", intensidade: 3, linha: 3, ritmo: 3, fairPlay: 3 };

/** Quanto cada posição pesa na defesa, no meio-campo e no ataque. */
const PESO_LINHA: Record<Posicao, readonly [number, number, number]> = {
  GR: [0, 0, 0],
  DD: [1, 0, 0],
  DC: [1, 0, 0],
  DE: [1, 0, 0],
  MDC: [0.3, 0.7, 0],
  MC: [0, 1, 0],
  MO: [0, 0.35, 0.65],
  ED: [0, 0.4, 0.6],
  EE: [0, 0.4, 0.6],
  PL: [0, 0, 1],
};

/**
 * Quanto da formação é defesa, meio e ataque. Com três centrais e alguém mais adiantado (MO ou extremo),
 * os laterais jogam como alas: metade defesa, metade meio-campo.
 */
export function linhasDaFormacao(posicoes: readonly Posicao[]): { defesa: number; meio: number; ataque: number } {
  const alas = posicoes.filter((p) => p === "DC").length === 3 && posicoes.some((p) => p === "MO" || p === "ED" || p === "EE");
  let defesa = 0, meio = 0, ataque = 0;
  for (const p of posicoes) {
    const [d, m, a] = alas && (p === "DD" || p === "DE") ? ([0.5, 0.5, 0] as const) : PESO_LINHA[p];
    defesa += d;
    meio += m;
    ataque += a;
  }
  return { defesa, meio, ataque };
}
export const BASE = linhasDaFormacao(FORMACOES["4-3-3"]);

export type ModificadoresTatica = { ataque: number; controlo: number; defesa: number };

/** Pontos de força que a tática soma ou tira. A formação conta pelas posições realmente em campo, não pelo nome. */
export function modificadoresTatica(posicoes: readonly Posicao[], t: Tatica, p: Parametros["tatica"], controloBase?: number): ModificadoresTatica {
  const l = linhasDaFormacao(posicoes);
  const e = p.estilos[t.estilo];
  const i = t.intensidade - 3;
  const li = t.linha - 3;
  // o jogo bonito só rende a quem tem técnica (controlo)
  const tec = t.estilo === "bonito" && controloBase !== undefined ? limitar((controloBase - p.bonito.base) / p.bonito.escala, 0, p.bonito.max) : 1;
  return {
    ataque: p.formacao.ataque * (l.ataque - BASE.ataque) + e.ataque * tec + p.linha.ataque * li,
    controlo: p.formacao.controlo * (l.meio - BASE.meio) + e.controlo * tec + p.intensidade.controlo * i + p.linha.controlo * li,
    defesa: p.formacao.defesa * (l.defesa - BASE.defesa) + e.defesa + p.intensidade.defesa * i + p.linha.defesa * li + (p.fairPlay.defesa[t.fairPlay - 1] as number),
  };
}

/** Multiplicador das faltas de uma equipa com esta tática. */
export function multiplicadorFaltas(t: Tatica, p: Parametros["tatica"]): number {
  return p.estilos[t.estilo].faltas * (1 + p.intensidade.faltas * (t.intensidade - 3)) * (p.fairPlay.faltas[t.fairPlay - 1] as number);
}

/** Pontos de força perdidos por cansaço no minuto `m` (cresce depois de `fadiga.inicio`; mais com intensidade e ritmo altos). */
export function fadigaEm(m: number, duracao: number, t: Tatica, p: Parametros["tatica"]): number {
  if (m <= p.fadiga.inicio) return 0;
  const progresso = limitar((m - p.fadiga.inicio) / Math.max(1, duracao - p.fadiga.inicio), 0, 1);
  const carga = (p.intensidade.fadiga * (t.intensidade - 1)) / 4 * 0.6 + (p.ritmo.fadiga * (t.ritmo - 1)) / 4 * 0.4;
  return p.fadiga.max * progresso * carga;
}

