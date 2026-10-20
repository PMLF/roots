/**
 * Formações e efeitos da tática na força (RZ-108; docs/GAME_ENGINE.md §7). Sem dependências do resto do motor, para
 * poderem ser usados por `equipa.ts` sem ciclos. As preferências do treinador estão em `tatica.ts`.
 */
import { clamp } from "../random/rng";
import type { Params } from "../config/parameters";
import type { Position } from "../world/types";
import type { Area, FormationId, Level, Tactic } from "./types";
import { AREAS } from "./types";

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

export const DEFAULT_TACTIC: Tactic = { formation: "4-3-3", intensity: 3, mentality: 3, fairPlay: 3, urgency: 3, directness: 3, shooting: 3, line: 3, area: "any" };

const lvl = (x: unknown, fallback: Level): Level => (typeof x === "number" && Number.isFinite(x) ? (Math.min(5, Math.max(1, Math.round(x))) as Level) : fallback);

/**
 * Tática guardada → tática atual: aceita o formato antigo (RZ-108: `style`, `tempo`, fair play 1 = cavalheiro … 5 = agressivo)
 * e preenche com o neutro o que falta. Pura.
 */
export function normalizeTactic(raw: unknown): Tactic {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const legacy = "style" in r || "tempo" in r;
  const style = r.style;
  const d = DEFAULT_TACTIC;
  const formation = typeof r.formation === "string" && r.formation in FORMATIONS ? (r.formation as FormationId) : d.formation;
  return {
    formation,
    intensity: lvl(r.intensity, d.intensity),
    mentality: lvl(r.mentality ?? (style === "counterAttack" ? 2 : undefined), d.mentality),
    fairPlay: legacy ? lvl(6 - lvl(r.fairPlay, 3), 3) : lvl(r.fairPlay, d.fairPlay),
    urgency: lvl(r.urgency, d.urgency),
    directness: lvl(r.directness ?? (style === "beautiful" ? 1 : style === "direct" ? 5 : style === "counterAttack" ? 4 : undefined), d.directness),
    shooting: lvl(r.shooting, d.shooting),
    line: lvl(r.line, d.line),
    area: AREAS.includes(r.area as Area) ? (r.area as Area) : d.area,
  };
}

/** 1 cavalheiro … 5 agressivo: a escala das tabelas de faltas, cartões e lesões (o inverso do «fair play» da tática). */
export const toughness = (t: Pick<Tactic, "fairPlay">): number => 6 - t.fairPlay;

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

/** Pesos do estilo de jogo: curto (toques curtos), direto (bola na frente) e contra-ataque (equipa defensiva que joga direto). */
export function styleWeights(t: Pick<Tactic, "directness" | "mentality">): { short: number; direct: number; counter: number } {
  const w = (t.directness - 3) / 2;
  // o contra-ataque substitui o jogo direto à medida que a equipa é mais defensiva: não se somam
  const counter = clamp((3 - t.mentality) / 2, 0, 1) * clamp((t.directness - 2) / 3, 0, 1);
  return { short: Math.max(0, -w), direct: Math.max(0, w) * (1 - counter), counter };
}

/**
 * Pontos de força que a tática soma ou tira. A formação conta pelas posições realmente em campo, não pelo nome.
 * `scale` (RZ-249) amplifica ou atenua as opções arrojadas (mentalidade, estilo, linha) conforme o contexto: casa, forma do dia, treinador.
 */
export function tacticModifiers(positions: readonly Position[], t: Tactic, p: Params["tactic"], baseControl?: number, scale = 1): TacticModifiers {
  const l = formationLines(positions);
  const i = t.intensity - 3;
  const li = t.line - 3;
  const mi = t.mentality - 3;
  const w = styleWeights(t);
  const sh = p.styles.beautiful, di = p.styles.direct, co = p.styles.counterAttack;
  // o jogo de toques curtos só rende a quem tem técnica (controlo)
  const tech = baseControl !== undefined ? clamp((baseControl - p.beautiful.base) / p.beautiful.scale, 0, p.beautiful.max) : 1;
  const style = {
    attack: sh.attack * tech * w.short + di.attack * w.direct + co.attack * w.counter,
    control: sh.control * tech * w.short + di.control * w.direct + co.control * w.counter,
    defence: sh.defence * w.short + di.defence * w.direct + co.defence * w.counter,
  };
  return {
    attack: p.formation.attack * (l.attack - BASE.attack) + scale * (style.attack + p.line.attack * li + p.mentality.attack * mi),
    control: p.formation.control * (l.middle - BASE.middle) + p.intensity.control * i + scale * (style.control + p.line.control * li + p.mentality.control * mi),
    defence: p.formation.defence * (l.defence - BASE.defence) + p.intensity.defence * i + (p.fairPlay.defence[toughness(t) - 1] as number) + scale * (style.defence + p.line.defence * li - p.mentality.defence * mi),
  };
}

/** Multiplicador das faltas de uma equipa com esta tática. */
export function foulsMultiplier(t: Tactic, p: Params["tactic"]): number {
  const w = styleWeights(t);
  const style = 1 + w.short * (p.styles.beautiful.fouls - 1) + w.direct * (p.styles.direct.fouls - 1) + w.counter * (p.styles.counterAttack.fouls - 1);
  return style * (1 + p.intensity.fouls * (t.intensity - 3)) * (p.fairPlay.fouls[toughness(t) - 1] as number);
}

/** Multiplicador dos remates de canto. */
export function cornerShotMultiplier(t: Tactic, p: Params["tactic"]): number {
  const w = styleWeights(t);
  return 1 + w.short * (p.styles.beautiful.shotCorner - 1) + w.direct * (p.styles.direct.shotCorner - 1) + w.counter * (p.styles.counterAttack.shotCorner - 1);
}

/** Pontos de força perdidos por cansaço no minuto `m` (cresce depois de `fadiga.inicio`; mais com intensidade alta). */
export function fatigueIn(m: number, duration: number, t: Tactic, p: Params["tactic"]): number {
  if (m <= p.fatigue.start) return 0;
  const progress = clamp((m - p.fatigue.start) / Math.max(1, duration - p.fatigue.start), 0, 1);
  const workload = (p.intensity.fatigue * (t.intensity - 1)) / 4 * 0.6 + (p.tempo.fatigue * (t.intensity - 1)) / 4 * 0.4;
  return p.fatigue.max * progress * workload;
}
