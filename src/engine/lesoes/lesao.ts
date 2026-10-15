/**
 * Lesões (RZ-107; docs/MOTOR_JOGO.md §9): tipo, gravidade, duração, recaídas e risco. Funções puras.
 * O risco sobe com a fadiga, o calendário apertado (forma baixa), o relvado mau, a intensidade e o fair play duro do
 * adversário, e desce com aptidão física e staff médico. Staff médico bom também encurta a paragem.
 */
import type { Rng } from "../aleatorio/rng";
import { limitar } from "../aleatorio/rng";
import type { Parametros } from "../config/parametros";

export const TIPOS_LESAO = ["pancada", "muscular", "entorse", "tendao", "ligamentos", "fratura"] as const;
export type TipoLesao = (typeof TIPOS_LESAO)[number];
/** 1 ligeira · 2 moderada · 3 grave · 4 muito grave · 5 gravíssima. */
export type Gravidade = 1 | 2 | 3 | 4 | 5;

export type Lesao = { tipo: TipoLesao; gravidade: Gravidade; /** Dias de paragem. */ dias: number; recaida: boolean };

/** Que lesões acontecem em cada gravidade (pesos relativos). */
const TIPO_POR_GRAVIDADE: Record<Gravidade, Partial<Record<TipoLesao, number>>> = {
  1: { pancada: 0.5, muscular: 0.4, entorse: 0.1 },
  2: { muscular: 0.5, entorse: 0.35, tendao: 0.15 },
  3: { muscular: 0.3, entorse: 0.25, tendao: 0.2, fratura: 0.15, ligamentos: 0.1 },
  4: { ligamentos: 0.4, fratura: 0.35, tendao: 0.25 },
  5: { ligamentos: 0.55, fratura: 0.45 },
};

export type ContextoRisco = {
  /** Forma do jogador (0,7-1,1; 1 = descansado). */
  forma: number;
  /** Atributo `aptidaoFisica` (1-20). */
  aptidaoFisica: number;
  /** Qualidade do relvado, 0 (péssimo) a 1 (perfeito). */
  relvado?: number;
  /** Qualidade do staff médico (1-20). */
  medico?: number;
  /** Fair play do adversário (1-5). */
  fairPlayAdversario?: 1 | 2 | 3 | 4 | 5;
  /** Intensidade da própria equipa (1-5). */
  intensidade?: number;
  /** Pontos de força perdidos por cansaço neste momento. */
  fadiga?: number;
  /** Regressou há pouco da mesma lesão. */
  recaida?: boolean;
};

/** Probabilidade de o jogador se lesionar num jogo de 90 minutos nestas condições. */
export function riscoPor90(c: ContextoRisco, params: Parametros): number {
  const p = params.lesoes;
  const r = p.risco;
  const m =
    (1 + r.porForma * (1 - c.forma)) *
    (1 + r.relvado * (0.5 - (c.relvado ?? 0.5))) *
    (1 + r.porAptidaoFisica * (10 - c.aptidaoFisica)) *
    (1 + r.porMedico * (10 - (c.medico ?? 10))) *
    (r.fairPlayAdversario[(c.fairPlayAdversario ?? 3) - 1] as number) *
    (1 + r.intensidade * ((c.intensidade ?? 3) - 3)) *
    (1 + r.fadiga * (c.fadiga ?? 0)) *
    (1 + (c.recaida ? r.recaida : 0));
  return limitar(p.pPorJogadorJogo * Math.max(0, m), 0, 1);
}

function escolherPeso<T extends string>(r: Rng, pesos: Partial<Record<T, number>>): T {
  const chaves = Object.keys(pesos) as T[];
  let x = r.float() * chaves.reduce((s, k) => s + (pesos[k] as number), 0);
  for (const k of chaves) {
    x -= pesos[k] as number;
    if (x < 0) return k;
  }
  return chaves[chaves.length - 1] as T;
}

/** Sorteia uma lesão. Com `recaida`, é do mesmo tipo e dura mais. O staff médico encurta a paragem. */
export function sortearLesao(r: Rng, params: Parametros, opcoes: { medico?: number; recaida?: TipoLesao } = {}): Lesao {
  const p = params.lesoes;
  let x = r.float();
  let g = 0;
  for (; g < p.gravidades.length - 1; g++) {
    x -= (p.gravidades[g] as { peso: number }).peso;
    if (x < 0) break;
  }
  const gravidade = (g + 1) as Gravidade;
  const [min, max] = (p.gravidades[g] as { dias: [number, number] }).dias;
  const tipo = opcoes.recaida ?? escolherPeso<TipoLesao>(r, TIPO_POR_GRAVIDADE[gravidade]);
  let dias = min + r.float() * (max - min);
  dias *= limitar(1 - p.recuperacaoPorMedico * ((opcoes.medico ?? 10) - 10), 0.5, 1.5);
  if (opcoes.recaida) dias *= p.duracaoRecaida;
  return { tipo, gravidade, dias: Math.max(1, Math.round(dias)), recaida: !!opcoes.recaida };
}
