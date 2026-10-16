/** Formas das pessoas geradas (RZ-103). Todas de "verdade": a UI só as vê através da `Vista`. */
import type { Tier } from "../config/parametros";
import type { PersonRole, Personality } from "../personalidade/gerar";
import type { IsoDate } from "../persistencia/tipos";

export const POSITIONS = ["GK", "RB", "CB", "LB", "DM", "CM", "AM", "RW", "LW", "ST"] as const;
export type Position = (typeof POSITIONS)[number];

export const TECHNICAL_ATTRIBUTES = ["finishing", "remateLonge", "pass", "cruzamento", "dribble", "controloBola", "cabeceamento", "desarme", "marcacao", "bolaParada", "penalties", "technical", "lancamentos", "primeiroToque"] as const;
export const MENTAL_ATTRIBUTES = ["visao", "decisao", "compostura", "trabalhoEquipa", "posicionamento", "antecipacao", "concentracao", "determinacao", "lideranca", "agressividade", "criatividade", "unmarking", "sacrificio", "coragem"] as const;
export const PHYSICAL_ATTRIBUTES = ["speed", "aceleracao", "resistencia", "strength", "agilidade", "salto", "equilibrio", "physicalAptitude", "recuperacao"] as const;
export const GK_ATTRIBUTES = ["reflexes", "jogoAereo", "jogoPes", "gkPositioning", "comunicacao", "handling", "outputs", "pontapeBaliza"] as const;
export const ATTRIBUTES = [...TECHNICAL_ATTRIBUTES, ...MENTAL_ATTRIBUTES, ...PHYSICAL_ATTRIBUTES, ...GK_ATTRIBUTES] as const;
export type Attribute = (typeof ATTRIBUTES)[number];
export type Attributes = Record<Attribute, number>;

export type NewPerson = {
  id: string;
  name: string;
  sportingName: string;
  birth: IsoDate;
  /** id do país (`data/paises.csv`). */
  nationality: string;
  /** Concelho de naturalidade (portugueses nascidos cá). */
  naturalDe?: string;
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
  pe: "D" | "E" | "A";
  club?: string;
  state: "active" | "free";
};

export type NewContract = { person: string; club: string; monthlyWage: number; start: IsoDate; end: IsoDate };

export type RoleFunction = "president" | "mayor" | "coach" | "adjunto" | "scout" | "medical" | "fisio" | "comunidade" | "businessperson" | "dirigenteAdeptos" | "agent" | "referee" | "journalist";
export type NewRole = { person: string; fn: RoleFunction; club?: string; city?: string; quality?: Record<string, number> };

export type WorldBatch = {
  people: NewPerson[];
  players: NewPlayer[];
  contracts: NewContract[];
  roles: NewRole[];
};

export type ClubTier = Tier;
