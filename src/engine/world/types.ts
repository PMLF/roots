/** Formas das pessoas geradas (RZ-103). Todas de "verdade": a UI só as vê através da `Vista`. */
import type { PersonRole, Personality } from "../personality/generate";
import type { IsoDate } from "../persistence/types";

export const POSITIONS = ["GK", "RB", "CB", "LB", "DM", "CM", "AM", "RW", "LW", "ST"] as const;
export type Position = (typeof POSITIONS)[number];

export const TECHNICAL_ATTRIBUTES = ["finishing", "longShot", "pass", "crossing", "dribble", "ballControl", "heading", "tackling", "marking", "setPieces", "penalties", "technical", "throwIns", "firstTouch"] as const;
export const MENTAL_ATTRIBUTES = ["vision", "decisions", "composure", "teamwork", "positioning", "anticipation", "concentration", "determination", "leadership", "aggression", "flair", "unmarking", "workRate", "bravery"] as const;
export const PHYSICAL_ATTRIBUTES = ["speed", "acceleration", "stamina", "strength", "agility", "jumping", "balance", "physicalAptitude", "recovery"] as const;
export const GK_ATTRIBUTES = ["reflexes", "aerialReach", "footwork", "gkPositioning", "communication", "handling", "outputs", "kicking"] as const;
export const ATTRIBUTES = [...TECHNICAL_ATTRIBUTES, ...MENTAL_ATTRIBUTES, ...PHYSICAL_ATTRIBUTES, ...GK_ATTRIBUTES] as const;
export type Attribute = (typeof ATTRIBUTES)[number];
export type Attributes = Record<Attribute, number>;

export type NewPerson = {
  id: string;
  name: string;
  sportingName: string;
  birth: IsoDate;
  /** id do país (`data/countries.csv`). */
  nationality: string;
  /** Concelho de naturalidade (portugueses nascidos cá). */
  birthCity?: string;
  roles: PersonRole[];
  personality: Personality;
  archetype: string;
  /** 1 = detalhado … 3 = esboço (GERACAO_MUNDO). */
  lod: 1 | 2 | 3;
};

export type NewPlayer = {
  person: string;
  positions: { pos: Position; aptitude: number }[];
  attributes: Attributes;
  /** Verdade oculta; a `Vista` só devolve estimativas. */
  potential: number;
  heightCm: number;
  weightKg: number;
  foot: "R" | "L" | "B";
  club?: string;
  trainedAt?: string;
  state: "active" | "free";
};

export type NewContract = { person: string; club: string; monthlyWage: number; start: IsoDate; end: IsoDate };

export type RoleFunction = "president" | "mayor" | "coach" | "assistant" | "scout" | "medical" | "physio" | "community" | "businessperson" | "fanLeader" | "agent" | "referee" | "journalist";
export type NewRole = { person: string; fn: RoleFunction; club?: string; city?: string; quality?: Record<string, number> };

export type WorldBatch = {
  people: NewPerson[];
  players: NewPlayer[];
  contracts: NewContract[];
  roles: NewRole[];
};
