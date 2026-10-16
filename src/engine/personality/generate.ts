/** Geração de personalidade (RZ-004/103; docs/PERSONALIDADE §2-3). Funções puras. */
import type { Rng } from "../random/rng";
import { clamp } from "../random/rng";

export const TRAITS = ["ambition", "loyalty", "vanity", "patience", "integrity", "greed", "temperament", "professionalism"] as const;
export type Trait = (typeof TRAITS)[number];
export type Personality = Record<Trait, number>;

export type PersonRole = "player" | "coach" | "staff" | "president" | "mayor" | "businessperson" | "agent" | "referee" | "fan" | "journalist";

export type Archetype = { name: string; traits: Partial<Personality> };

export const ARCHETYPES: Record<string, Archetype> = {
  common: { name: "Comum", traits: {} },
  leader: { name: "Líder de balneário", traits: { loyalty: 15, professionalism: 16, temperament: 8 } },
  star: { name: "Estrela caprichosa", traits: { vanity: 17, greed: 15, loyalty: 6 } },
  worker: { name: "Operário", traits: { professionalism: 17, ambition: 9, vanity: 6 } },
  shortFuse: { name: "Pavio curto", traits: { temperament: 18, integrity: 9 } },
  worksMayor: { name: "Autarca de obra", traits: { ambition: 16, vanity: 15, patience: 7 } },
  discreetMayor: { name: "Autarca discreto", traits: { vanity: 5, patience: 15, integrity: 14 } },
  sharkAgent: { name: "Agente tubarão", traits: { greed: 18, loyalty: 5, integrity: 7 } },
  localBusinessperson: { name: "Empresário local", traits: { loyalty: 14, vanity: 13 } },
  veteran: { name: "Veterano paciente", traits: { patience: 16, professionalism: 15, temperament: 6 } },
  mercenary: { name: "Mercenário", traits: { loyalty: 4, greed: 16, ambition: 14 } },
  idealist: { name: "Idealista", traits: { integrity: 17, greed: 5, loyalty: 14 } },
};

/** Pesos dos arquétipos por papel; o que falta fica em "comum". */
const BY_ROLE: Record<PersonRole, Record<string, number>> = {
  player: { common: 60, leader: 6, star: 8, worker: 12, shortFuse: 6, mercenary: 5, idealist: 3 },
  coach: { common: 55, veteran: 15, leader: 10, worker: 10, idealist: 5, shortFuse: 5 },
  staff: { common: 65, worker: 15, veteran: 10, idealist: 5, mercenary: 5 },
  president: { common: 45, localBusinessperson: 20, star: 8, idealist: 10, mercenary: 7, veteran: 10 },
  mayor: { common: 30, worksMayor: 35, discreetMayor: 35 },
  businessperson: { common: 25, localBusinessperson: 55, mercenary: 10, idealist: 10 },
  agent: { common: 25, sharkAgent: 50, mercenary: 15, idealist: 10 },
  referee: { common: 70, idealist: 12, shortFuse: 8, mercenary: 10 },
  journalist: { common: 60, idealist: 15, shortFuse: 10, mercenary: 15 },
  fan: { common: 70, shortFuse: 15, idealist: 10, localBusinessperson: 5 },
};

export type PersonalityContext = {
  /** Jogador natural da cidade do seu clube: lealdade +3. */
  cityNatural?: boolean;
  /** País de origem difícil: profissionalismo +2 (regra opcional). */
  hardOrigin?: boolean;
  /** Treinador veterano: paciência +2. */
  veteran?: boolean;
  /** Força um arquétipo (p. ex. os traços do autarca vêm do CSV). */
  archetype?: string;
  /** Traços já conhecidos (têm prioridade sobre o gerado). */
  fixed?: Partial<Personality>;
};

export function generatePersonality(rng: Rng, roleKind: PersonRole, ctx: PersonalityContext = {}, min = 1, max = 20): { personality: Personality; archetype: string } {
  const weights = BY_ROLE[roleKind];
  const keys = Object.keys(weights);
  const archetype = ctx.archetype ?? rng.weighted(keys, (k) => weights[k] as number);
  const base = ARCHETYPES[archetype];
  if (!base) throw new Error(`Arquétipo desconhecido: ${archetype}`);
  const p = {} as Personality;
  for (const t of TRAITS) {
    let v = Math.round((base.traits[t] ?? 10) + rng.gauss(0, 2.5));
    if (t === "loyalty" && ctx.cityNatural) v += 3;
    if (t === "professionalism" && ctx.hardOrigin) v += 2;
    if (t === "patience" && ctx.veteran) v += 2;
    p[t] = clamp(ctx.fixed?.[t] ?? v, min, max);
  }
  return { personality: p, archetype };
}
