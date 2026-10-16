/**
 * Formações e efeitos da tática na força (RZ-108; docs/GAME_ENGINE.md §7). Sem dependências do resto do motor, para
 * poderem ser usados por `equipa.ts` sem ciclos. As preferências do treinador estão em `tatica.ts`.
 */
import { clamp } from "../random/rng";
import type { Params } from "../config/parameters";
import type { Position } from "../world/types";
import type { Style, FormationId, Tactic } from "./types";

/** Posições de cada formação (o guarda-redes primeiro). Laterais a «alas» nos sistemas com três centrais. */
export const FORMATIONS: Record<FormationId, readonly Position[]> = {
  "4-3-3": ["GK", "RB", "CB", "CB", "LB", "DM", "CM", "AM", "RW", "ST", "LW"],
  "4-4-2": ["GK", "RB", "CB", "CB", "LB", "RW", "CM", "CM", "LW", "ST", "ST"],
  "4-2-3-1": ["GK", "RB", "CB", "CB", "LB", "DM", "DM", "RW", "AM", "LW", "ST"],
  "4-1-4-1": ["GK", "RB", "CB", "CB", "LB", "DM", "RW", "CM", "CM", "LW", "ST"],
  "3-5-2": ["GK", "CB", "CB", "CB", "RB", "CM", "CM", "AM", "LB", "ST", "ST"],
  "5-3-2": ["GK", "RB", "CB", "CB", "CB", "LB", "DM", "DM", "CM", "ST", "ST"],
  "3-4-3": ["GK", "CB", "CB", "CB", "RB", "CM", "CM", "LB", "RW", "ST", "LW"],
  "4-3-1-2": ["GK", "RB", "CB", "CB", "LB", "DM", "CM", "CM", "AM", "ST", "ST"],
};
export const FORMATION_IDS = Object.keys(FORMATIONS) as FormationId[];
export const STYLES: readonly Style[] = ["beautiful", "balanced", "direct", "counterAttack"];

export const DEFAULT_TACTIC: Tactic = { formation: "4-3-3", style: "balanced", intensity: 3, line: 3, tempo: 3, fairPlay: 3 };

/** Quanto cada posição pesa na defesa, no meio-campo e no ataque. */
const LINE_WEIGHT: Record<Position, readonly [number, number, number]> = {
  GK: [0, 0, 0],
  RB: [1, 0, 0],
  CB: [1, 0, 0],
  LB: [1, 0, 0],
  DM: [0.3, 0.7, 0],
  CM: [0, 1, 0],
  AM: [0, 0.35, 0.65],
  RW: [0, 0.4, 0.6],
  LW: [0, 0.4, 0.6],
  ST: [0, 0, 1],
};

/**
 * Quanto da formação é defesa, meio e ataque. Com três centrais e alguém mais adiantado (MO ou extremo),
 * os laterais jogam como alas: metade defesa, metade meio-campo.
 */
export function formationLines(positions: readonly Position[]): { defence: number; middle: number; attack: number } {
  const wings = positions.filter((p) => p === "CB").length === 3 && positions.some((p) => p === "AM" || p === "RW" || p === "LW");
  let defence = 0, middle = 0, attack = 0;
  for (const p of positions) {
    const [d, m, a] = wings && (p === "RB" || p === "LB") ? ([0.5, 0.5, 0] as const) : LINE_WEIGHT[p];
    defence += d;
    middle += m;
    attack += a;
  }
  return { defence, middle, attack };
}
export const BASE = formationLines(FORMATIONS["4-3-3"]);

export type TacticModifiers = { attack: number; control: number; defence: number };

/** Pontos de força que a tática soma ou tira. A formação conta pelas posições realmente em campo, não pelo nome. */
export function tacticModifiers(positions: readonly Position[], t: Tactic, p: Params["tactic"], baseControl?: number): TacticModifiers {
  const l = formationLines(positions);
  const e = p.styles[t.style];
  const i = t.intensity - 3;
  const li = t.line - 3;
  // o jogo bonito só rende a quem tem técnica (controlo)
  const tech = t.style === "beautiful" && baseControl !== undefined ? clamp((baseControl - p.beautiful.base) / p.beautiful.scale, 0, p.beautiful.max) : 1;
  return {
    attack: p.formation.attack * (l.attack - BASE.attack) + e.attack * tech + p.line.attack * li,
    control: p.formation.control * (l.middle - BASE.middle) + e.control * tech + p.intensity.control * i + p.line.control * li,
    defence: p.formation.defence * (l.defence - BASE.defence) + e.defence + p.intensity.defence * i + p.line.defence * li + (p.fairPlay.defence[t.fairPlay - 1] as number),
  };
}

/** Multiplicador das faltas de uma equipa com esta tática. */
export function foulsMultiplier(t: Tactic, p: Params["tactic"]): number {
  return p.styles[t.style].fouls * (1 + p.intensity.fouls * (t.intensity - 3)) * (p.fairPlay.fouls[t.fairPlay - 1] as number);
}

/** Pontos de força perdidos por cansaço no minuto `m` (cresce depois de `fadiga.inicio`; mais com intensidade e ritmo altos). */
export function fatigueIn(m: number, duration: number, t: Tactic, p: Params["tactic"]): number {
  if (m <= p.fatigue.start) return 0;
  const progress = clamp((m - p.fatigue.start) / Math.max(1, duration - p.fatigue.start), 0, 1);
  const workload = (p.intensity.fatigue * (t.intensity - 1)) / 4 * 0.6 + (p.tempo.fatigue * (t.tempo - 1)) / 4 * 0.4;
  return p.fatigue.max * progress * workload;
}

