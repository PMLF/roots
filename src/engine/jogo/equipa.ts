/** Força de uma equipa a partir dos seus onze, e escolha automática do onze (RZ-104). */
import { currentQuality } from "../mundo/jogador";
import type { Attribute, Attributes, Position } from "../mundo/tipos";
import type { Params } from "../config/parametros";
import { FORMATIONS, tacticModifiers } from "./formacoes";
import type { MatchTeam, OnPitchPlayer, Tactic } from "./tipos";

export type TeamStrength = { attack: number; control: number; defence: number; goalkeeper: number };

type Group = { weights: Partial<Record<Position, number>>; attributes: readonly Attribute[] };

const ATTACK: Group = { weights: { ST: 1, RW: 0.8, LW: 0.8, AM: 0.7, CM: 0.3 }, attributes: ["finishing", "dribble", "unmarking", "speed", "technical"] };
const CONTROL: Group = { weights: { CM: 1, DM: 0.8, AM: 0.8, RW: 0.3, LW: 0.3, RB: 0.2, LB: 0.2 }, attributes: ["pass", "visao", "controloBola", "decisao", "trabalhoEquipa"] };
const DEFENCE: Group = { weights: { CB: 1, DM: 0.8, RB: 0.7, LB: 0.7, CM: 0.3 }, attributes: ["desarme", "marcacao", "posicionamento", "antecipacao"] };
const ATTRIBUTES_GK: readonly Attribute[] = ["reflexes", "handling", "gkPositioning", "outputs"];

const mean = (a: Attributes, ks: readonly Attribute[]): number => ks.reduce((s, k) => s + a[k], 0) / ks.length;

/** Quanto rende um jogador na posição onde joga: 1 na posição natural, menos fora dela (RZ-177). */
export function aptitudeFactor(aptitude: number | undefined, position: Position, params: Params): number {
  if (aptitude === undefined) return 1;
  const a = params.match.aptitude;
  const gk = position === "GK";
  const min = gk ? a.gkMin : a.min;
  return min + (1 - min) * (Math.min(20, Math.max(0, aptitude)) / 20);
}

/** A aptidão de um candidato numa posição; sem registo, o valor de `semRegisto`. */
export function aptitudeIn(positions: readonly { pos: string; aptitude: number }[], position: Position, params: Params): number {
  return positions.find((p) => p.pos === position)?.aptitude ?? (position === "GK" ? params.match.aptitude.gkUnrecorded : params.match.aptitude.unrecorded);
}

function weighted(lineup: readonly OnPitchPlayer[], g: Group, params?: Params): number {
  let sum = 0;
  let weights = 0;
  for (const j of lineup) {
    const w = g.weights[j.position];
    if (!w) continue;
    sum += w * mean(j.attributes, g.attributes) * j.form * (params ? aptitudeFactor(j.aptitude, j.position, params) : 1);
    weights += w;
  }
  return weights > 0 ? sum / weights : 5;
}

/**
 * Quatro números (escala 1-20) que resumem a equipa. Pura.
 * Com `tatica` e `params`, somam-se os efeitos da formação realmente em campo, do estilo, da intensidade, da linha e do fair play (RZ-108).
 */
export function teamStrength(lineup: readonly OnPitchPlayer[], tactic?: Tactic, params?: Params): TeamStrength {
  const gk = lineup.find((j) => j.position === "GK");
  const base = {
    attack: weighted(lineup, ATTACK, params),
    control: weighted(lineup, CONTROL, params),
    defence: weighted(lineup, DEFENCE, params),
    goalkeeper: gk ? mean(gk.attributes, ATTRIBUTES_GK) * gk.form * (params ? aptitudeFactor(gk.aptitude, "GK", params) : 1) : 3,
  };
  if (!tactic || !params) return base;
  const m = tacticModifiers(lineup.map((j) => j.position), tactic, params.tactic, base.control);
  return { ...base, attack: base.attack + m.attack, control: base.control + m.control, defence: base.defence + m.defence };
}

/** 4-3-3, a formação por omissão enquanto não há táticas (RZ-108). */
export const DEFAULT_FORMATION: readonly Position[] = FORMATIONS["4-3-3"];

export type LineupCandidate = { person: string; positions: { pos: string; aptitude: number }[]; attributes: Record<string, number>; heightCm: number; /** Forma por cansaço (0,85-1); por omissão 1. */ form?: number };

/** Escolhe o melhor onze disponível para a formação: cada posição fica com quem lá rende mais (aptidão incluída). Determinístico. */
export function automaticLineup(candidates: readonly LineupCandidate[], formation: readonly Position[] = DEFAULT_FORMATION, params?: Params): OnPitchPlayer[] {
  return lineupWithValue(candidates, formation, params).lineup;
}

/** Como `onzeAutomatico`, mais o valor médio do onze (qualidade na posição × aptidão), para comparar formações. */
export function lineupWithValue(candidates: readonly LineupCandidate[], formation: readonly Position[] = DEFAULT_FORMATION, params?: Params): { lineup: OnPitchPlayer[]; value: number } {
  const free = [...candidates];
  const lineup: OnPitchPlayer[] = [];
  let total = 0;
  // o guarda-redes primeiro, para não ser gasto fora de sítio
  const order = [...formation].sort((a, b) => (a === "GK" ? -1 : b === "GK" ? 1 : 0));
  for (const pos of order) {
    let best = -1;
    let value = -Infinity;
    free.forEach((c, i) => {
      const apt = c.positions.find((p) => p.pos === pos)?.aptitude;
      const factor = params ? aptitudeFactor(aptitudeIn(c.positions, pos, params), pos, params) : apt === undefined ? (pos === "GK" ? 0.1 : 0.45) : apt / 20;
      const v = currentQuality(c.attributes as Attributes, pos) * factor * (c.form ?? 1);
      if (v > value || (v === value && best >= 0 && c.person < (free[best] as LineupCandidate).person)) {
        value = v;
        best = i;
      }
    });
    if (best < 0) break;
    const [c] = free.splice(best, 1) as [LineupCandidate];
    total += value;
    lineup.push({ id: c.person, position: pos, attributes: c.attributes as Attributes, heightCm: c.heightCm, form: c.form ?? 1, ...(params ? { aptitude: aptitudeIn(c.positions, pos, params), positions: c.positions } : {}) });
  }
  return { lineup, value: lineup.length > 0 ? total / lineup.length : 0 };
}

export function teamOf(club: string, candidates: readonly LineupCandidate[], formation?: readonly Position[]): MatchTeam {
  return { club, lineup: automaticLineup(candidates, formation) };
}
