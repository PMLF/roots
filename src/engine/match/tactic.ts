/**
 * Táticas do treinador (RZ-108; docs/GAME_ENGINE.md §7): preferências derivadas da personalidade e escolha da formação
 * para o plantel. Puro e determinístico. Os efeitos na força estão em `formacoes.ts`.
 */
import { Rng, clamp } from "../random/rng";
import type { Params } from "../config/parameters";
import type { Personality } from "../personality/generate";
import { lineupWithValue, type LineupCandidate } from "./team";
import { BASE, FORMATION_IDS, FORMATIONS, formationLines } from "./formations";
import type { Area, MatchTeam, FormationId, Level } from "./types";

// ---------- treinador

export type TacticalProfile = {
  /** Formações favoritas, da preferida para a menos preferida. */
  formations: FormationId[];
  intensity: Level;
  mentality: Level;
  fairPlay: Level;
  urgency: Level;
  directness: Level;
  shooting: Level;
  line: Level;
  area: Area;
  /** 0 = teimoso (insiste nas favoritas), 1 = adapta-se ao plantel. */
  flexibility: number;
};

const level = (x: number): Level => clamp(Math.round(x), 1, 5) as Level;

/** Quão ofensiva é uma formação, -1 (muito defensiva) a +1. */
function offensiveness(f: FormationId): number {
  const l = formationLines(FORMATIONS[f]);
  return clamp(((l.attack - BASE.attack) - (l.defence - BASE.defence)) / 2, -1, 1);
}

function chooseWeighted<T>(rng: Rng, items: readonly T[], weight: (x: T) => number): T {
  const weights = items.map(weight);
  let r = rng.float() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < items.length; i++) {
    r -= weights[i] as number;
    if (r < 0) return items[i] as T;
  }
  return items[items.length - 1] as T;
}

/**
 * As preferências táticas de um treinador, derivadas da personalidade e da qualidade tática (1-20).
 * Ambicioso e vaidoso: formações ofensivas, jogo bonito, linha alta. Pavio curto: fair play duro. Impaciente: ritmo alto e jogo direto.
 * Vaidoso é teimoso; quem sabe de táticas adapta-se. Estável: mesma seed e mesmo treinador, mesmo perfil.
 */
export function coachProfile(seed: string, personId: string, personality: Personality, tacticQuality: number, params: Params): TacticalProfile {
  const rng = new Rng(seed, `treinador/${personId}/tatica`);
  const attacking = (personality.ambition + personality.vanity - 20) / 20;
  const free = [...FORMATION_IDS];
  const formations: FormationId[] = [];
  for (let k = 0; k < Math.min(params.tactic.coach.favourite, free.length); k++) {
    const f = chooseWeighted(rng, free, (x) => Math.exp(1.6 * attacking * offensiveness(x)) * (0.4 + rng.float()) * (x === "4-3-3" ? 1.3 : 1));
    formations.push(f);
    free.splice(free.indexOf(f), 1);
  }
  const flexibility = clamp(0.5 * (tacticQuality / 20) + 0.5 * (1 - personality.vanity / 20) + rng.gauss(0, 0.05), 0, 1);
  return {
    formations,
    intensity: level(3 + (personality.ambition - 10) / 5 + (10 - personality.patience) / 12 + rng.gauss(0, 0.6)),
    mentality: level(3 + (personality.ambition - 10) / 6 + (personality.vanity - 10) / 12 + rng.gauss(0, 0.6)),
    // 5 = super corretos: o pavio curto e o pouco íntegro jogam duro
    fairPlay: level(3 - (personality.temperament - 10) / 5 + (personality.integrity - 10) / 10 + rng.gauss(0, 0.5)),
    urgency: level(3 + (personality.patience - 10) / 8 + rng.gauss(0, 0.6)),
    // paciente e vaidoso: toques curtos; impaciente: bola na frente
    directness: level(3 + (10 - personality.patience) / 5 - (personality.vanity - 10) / 12 + rng.gauss(0, 0.6)),
    shooting: level(3 + (personality.ambition - 10) / 8 + (10 - personality.patience) / 12 + rng.gauss(0, 0.6)),
    line: level(3 + (personality.vanity + personality.ambition - 20) / 12 + rng.gauss(0, 0.6)),
    area: chooseWeighted(rng, ["wings", "left", "right", "centre", "any"] as const, (a) => (a === "any" ? 2 : a === "wings" ? 1.2 : 0.7)),
    flexibility,
  };
}

/**
 * Escolhe a formação para este plantel: valor médio do onze + bónus pela preferência do treinador
 * (1.º favorito 100 %, 2.º 66 %, 3.º 33 %), reduzido pela flexibilidade. Um teimoso insiste nas favoritas
 * mesmo com o plantel errado; um flexível escolhe a que dá o melhor onze.
 */
export function chooseTeam(club: string, candidates: readonly LineupCandidate[], profile: TacticalProfile, params: Params): MatchTeam {
  const { preferenceBonus, favourite } = params.tactic.coach;
  let best: { f: FormationId; lineup: MatchTeam["lineup"]; u: number } | undefined;
  for (const f of FORMATION_IDS) {
    const { lineup, value } = lineupWithValue(candidates, FORMATIONS[f]);
    const rank = profile.formations.indexOf(f);
    const pref = rank < 0 ? 0 : (favourite - rank) / favourite;
    const u = value + (1 - profile.flexibility) * preferenceBonus * pref;
    if (!best || u > best.u) best = { f, lineup, u };
  }
  const m = best as NonNullable<typeof best>;
  return { club, lineup: m.lineup, tactic: { formation: m.f, intensity: profile.intensity, mentality: profile.mentality, fairPlay: profile.fairPlay, urgency: profile.urgency, directness: profile.directness, shooting: profile.shooting, line: profile.line, area: profile.area } };
}
