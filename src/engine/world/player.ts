/** Geração de um jogador: posições, atributos, potencial e corpo (RZ-103; GERACAO_MUNDO §5). */
import type { Rng } from "../random/rng";
import { clamp } from "../random/rng";
import type { Params } from "../config/parameters";
import { ATTRIBUTES, GK_ATTRIBUTES, TECHNICAL_ATTRIBUTES, POSITIONS, type Attribute, type Attributes, type Position } from "./types";

/** Atributos-chave por posição: a qualidade atual do jogador é a média destes. */
export const KEY: Record<Position, readonly Attribute[]> = {
  GK: ["reflexes", "aerialReach", "footwork", "gkPositioning", "handling", "outputs"],
  RB: ["crossing", "tackling", "marking", "speed", "stamina", "positioning"],
  LB: ["crossing", "tackling", "marking", "speed", "stamina", "positioning"],
  CB: ["tackling", "marking", "heading", "positioning", "strength", "anticipation", "bravery"],
  DM: ["tackling", "marking", "pass", "positioning", "anticipation", "teamwork", "stamina"],
  CM: ["pass", "vision", "ballControl", "decisions", "teamwork", "stamina"],
  AM: ["pass", "vision", "dribble", "flair", "technical", "firstTouch", "longShot"],
  RW: ["dribble", "speed", "acceleration", "crossing", "agility", "technical"],
  LW: ["dribble", "speed", "acceleration", "crossing", "agility", "technical"],
  ST: ["finishing", "heading", "unmarking", "firstTouch", "composure", "acceleration"],
};

const ATTACKING: readonly Attribute[] = ["finishing", "dribble", "flair", "unmarking", "longShot"];
const DEFENSIVE: readonly Attribute[] = ["tackling", "marking"];
const PHYSICAL_AGE: readonly Attribute[] = ["speed", "acceleration", "agility", "jumping", "recovery"];
const MENTAL_AGE: readonly Attribute[] = ["decisions", "positioning", "anticipation", "composure", "leadership", "concentration"];

const NEIGHBOURING: Record<Position, readonly Position[]> = {
  GK: [],
  RB: ["RW", "CB", "CM"],
  LB: ["LW", "CB"],
  CB: ["DM", "RB", "LB"],
  DM: ["CB", "CM"],
  CM: ["DM", "AM"],
  AM: ["CM", "RW", "LW", "ST"],
  RW: ["RB", "AM", "LW", "ST"],
  LW: ["LB", "AM", "RW", "ST"],
  ST: ["AM", "RW", "LW"],
};

export function generateAttributes(rng: Rng, pos: Position, quality: number, age: number): Attributes {
  const rowKey = new Set(KEY[pos]);
  const a = {} as Attributes;
  for (const name of ATTRIBUTES) {
    const gk = (GK_ATTRIBUTES as readonly string[]).includes(name);
    if (gk && pos !== "GK") {
      a[name] = rng.integer(1, 3);
      continue;
    }
    let offset = -1.5;
    if (rowKey.has(name)) offset = 0;
    else if (pos === "GK" && !gk && (TECHNICAL_ATTRIBUTES as readonly string[]).includes(name)) offset = -6;
    if (!rowKey.has(name)) {
      if (["RB", "LB", "CB", "DM"].includes(pos) && ATTACKING.includes(name)) offset -= 3;
      if (["RW", "LW", "ST", "AM"].includes(pos) && DEFENSIVE.includes(name)) offset -= 3;
    }
    if (PHYSICAL_AGE.includes(name)) offset -= Math.max(0, age - 30) * 0.45;
    if (MENTAL_AGE.includes(name)) offset += clamp((age - 22) * 0.12, -0.5, 1.2);
    a[name] = clamp(Math.round(quality + offset + rng.gauss(0, 1.3)), 1, 20);
  }
  return a;
}

/** Qualidade atual = média dos atributos-chave da posição principal. */
export function currentQuality(a: Attributes, pos: Position): number {
  const ks = KEY[pos];
  return ks.reduce((s, k) => s + a[k], 0) / ks.length;
}

export function generatePositions(rng: Rng, main: Position, secondaryAptitude: number): { pos: Position; aptitude: number }[] {
  const out = [{ pos: main, aptitude: 20 }];
  for (const v of NEIGHBOURING[main]) if (rng.prob(0.35)) out.push({ pos: v, aptitude: clamp(Math.round(20 * secondaryAptitude + rng.gauss(0, 2)), 1, 19) });
  return out;
}

/**
 * Qualidade atual e potencial a partir do "nível-alvo" do plantel `alvo` e da idade:
 * jovens ainda não chegaram lá (mas o potencial sim), veteranos já desceram.
 */
export function potentialEQuality(rng: Rng, target: number, age: number, m: Params["world"]): { current: number; potential: number } {
  const peak = m.peakAge;
  const deficit = Math.max(0, peak - 3 - age) * 0.35;
  const decline = Math.max(0, age - 31) * 0.3;
  const current = clamp(target - deficit - decline, 1, 20);
  const margin = age < peak ? Math.max(0, rng.gauss(deficit + 0.4, 0.9)) : 0;
  return { current, potential: clamp(current + margin, current, 20) };
}

export function generateBody(rng: Rng, pos: Position): { heightCm: number; weightKg: number; pe: "D" | "E" | "A" } {
  const base = pos === "GK" ? 188 : pos === "CB" ? 184 : pos === "ST" ? 181 : ["RW", "LW", "AM"].includes(pos) ? 175 : 178;
  const heightCm = Math.round(clamp(rng.gauss(base, 5), 160, 205));
  const weightKg = Math.round(clamp((heightCm - 100) * 0.92 + rng.gauss(0, 4), 55, 100));
  const r = rng.float();
  const pe = r < 0.7 ? "D" : r < 0.95 ? "E" : "A";
  return { heightCm, weightKg, pe };
}

export { POSITIONS };
