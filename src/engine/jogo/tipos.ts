/** Tipos do motor de jogo (RZ-104; docs/MOTOR_JOGO.md). */
import type { Lesao, TipoLesao } from "../lesoes/lesao";
import type { Atributos, Posicao } from "../mundo/tipos";

export type Lado = "casa" | "fora";
export const outroLado = (l: Lado): Lado => (l === "casa" ? "fora" : "casa");

/** Um jogador em campo: a posição é a que ocupa neste jogo, não necessariamente a principal. */
export type JogadorEmCampo = {
  id: string;
  posicao: Posicao;
  atributos: Atributos;
  alturaCm: number;
  /** Forma/fadiga, 0.7-1.1 (RZ-107 passa a preenchê-la); 1 = normal. */
  forma: number;
  /** Regressou há pouco desta lesão: risco de recaída (RZ-107). */
  recaida?: TipoLesao;
};

export type FormacaoId = "4-3-3" | "4-4-2" | "4-2-3-1" | "4-1-4-1" | "3-5-2" | "5-3-2" | "3-4-3" | "4-3-1-2";
export type Estilo = "bonito" | "equilibrado" | "direto" | "contraAtaque";
export type Nivel = 1 | 2 | 3 | 4 | 5;

/**
 * Tática de uma equipa (RZ-108). Intensidade, linha, ritmo: 1 baixo … 5 alto (3 = normal).
 * Fair play: 1 cavalheiro · 2 limpo · 3 normal · 4 duro · 5 agressivo.
 */
export type Tatica = { formacao: FormacaoId; estilo: Estilo; intensidade: Nivel; linha: Nivel; ritmo: Nivel; fairPlay: Nivel };

export type EquipaJogo = {
  clube: string;
  onze: JogadorEmCampo[];
  /** Sem tática, usa-se `TATICA_PADRAO`. */
  tatica?: Tatica;
  /** Suplentes: substituem os lesionados (a escolha livre de substituições é RZ-215). */
  banco?: JogadorEmCampo[];
  /** Qualidade do staff médico (1-20, por omissão 10): menos lesões e paragens mais curtas. */
  medico?: number;
};

export type Origem = "jogada" | "canto" | "livre" | "penalti";
export type ResultadoRemate = "golo" | "defendido" | "fora" | "bloqueado";

export type EventoJogo =
  | { tipo: "lance"; minuto: number; lado: Lado; jogador: string }
  | { tipo: "remate"; minuto: number; lado: Lado; jogador: string; assistente?: string; xg: number; resultado: ResultadoRemate; origem: Origem; guardaRedes?: string }
  | { tipo: "canto"; minuto: number; lado: Lado }
  | { tipo: "falta"; minuto: number; lado: Lado; jogador: string; penalti: boolean }
  /** Cartão (RZ-106). O segundo amarelo vem como um amarelo seguido de um vermelho com `segundoAmarelo`. */
  /** Lesão em jogo (RZ-107): o jogador sai do campo. */
  | { tipo: "lesao"; minuto: number; lado: Lado; jogador: string; lesao: Lesao }
  | { tipo: "substituicao"; minuto: number; lado: Lado; sai: string; entra: string; motivo: "lesao" }
  | { tipo: "cartao"; minuto: number; lado: Lado; jogador: string; cor: "amarelo" | "vermelho"; segundoAmarelo?: true };

export type EstatLado = {
  golos: number;
  /** Ataques que chegaram ao último terço: os que não chegaram a remate também contam. */
  oportunidades: number;
  remates: number;
  aBaliza: number;
  bloqueados: number;
  xg: number;
  cantos: number;
  faltas: number;
  amarelos: number;
  vermelhos: number;
  lesoes: number;
  /** Minutos em que a equipa teve a bola (a posse é a razão entre os dois lados). */
  minutosPosse: number;
};

export type ResumoJogo = {
  minuto: number;
  duracao: number;
  terminado: boolean;
  casa: EstatLado;
  fora: EstatLado;
  /** Fração de posse da equipa da casa, 0-1. */
  posseCasa: number;
};

export type EntradaJogo = {
  /** Seed do save; com o `id` do jogo determina tudo. */
  seed: string;
  id: string;
  casa: EquipaJogo;
  fora: EquipaJogo;
  /** Qualidade do relvado do estádio da casa, 0 (péssimo) a 1 (perfeito); por omissão 0,5. */
  relvado?: number;
};
