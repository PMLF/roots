/** Tipos do motor de jogo (RZ-104; docs/GAME_ENGINE.md). */
import type { Injury, InjuryType } from "../injuries/injury";
import type { Attributes, Position } from "../world/types";

export type Side = "home" | "away";
export const otherSide = (l: Side): Side => (l === "home" ? "away" : "home");

/** Um jogador em campo: a posição é a que ocupa neste jogo, não necessariamente a principal. */
export type OnPitchPlayer = {
  id: string;
  position: Position;
  attributes: Attributes;
  heightCm: number;
  /** Forma/fadiga, 0.7-1.1 (RZ-107 passa a preenchê-la); 1 = normal. */
  form: number;
  /** Aptidão (1-20) na posição em que joga; sem valor, 20 (posição natural). Vê `fatorAptidao` (RZ-177). */
  aptitude?: number;
  /** Todas as posições que conhece, para recalcular a aptidão se mudar de posição a meio do jogo (suplente). */
  positions?: { pos: string; aptitude: number }[];
  /** Regressou há pouco desta lesão: risco de recaída (RZ-107). */
  relapse?: InjuryType;
};

export type FormationId = "4-3-3" | "4-4-2" | "4-2-3-1" | "4-1-4-1" | "3-5-2" | "5-3-2" | "3-4-3" | "4-3-1-2";
export type Style = "beautiful" | "balanced" | "direct" | "counterAttack";
export type Level = 1 | 2 | 3 | 4 | 5;

/**
 * Tática de uma equipa (RZ-108). Intensidade, linha, ritmo: 1 baixo … 5 alto (3 = normal).
 * Fair play: 1 cavalheiro · 2 limpo · 3 normal · 4 duro · 5 agressivo.
 */
export type Tactic = { formation: FormationId; style: Style; intensity: Level; line: Level; tempo: Level; fairPlay: Level };

export type MatchTeam = {
  club: string;
  lineup: OnPitchPlayer[];
  /** Sem tática, usa-se `TATICA_PADRAO`. */
  tactic?: Tactic;
  /** Suplentes: substituem os lesionados (a escolha livre de substituições é RZ-215). */
  bench?: OnPitchPlayer[];
  /** Qualidade do staff médico (1-20, por omissão 10): menos lesões e paragens mais curtas. */
  medical?: number;
};

export type Origin = "openPlay" | "corner" | "free" | "penalty";
export type ShotResult = "goal" | "saved" | "away" | "blocked";

export type MatchEvent =
  | { type: "lance"; minute: number; side: Side; player: string }
  | { type: "shot"; minute: number; side: Side; player: string; assistant?: string; xg: number; outcome: ShotResult; origin: Origin; goalkeeper?: string }
  | { type: "corner"; minute: number; side: Side }
  | { type: "foul"; minute: number; side: Side; player: string; penalty: boolean }
  /** Cartão (RZ-106). O segundo amarelo vem como um amarelo seguido de um vermelho com `segundoAmarelo`. */
  /** Lesão em jogo (RZ-107): o jogador sai do campo. */
  | { type: "injury"; minute: number; side: Side; player: string; injury: Injury }
  | { type: "substitution"; minute: number; side: Side; playerOut: string; playerIn: string; reason: "injury" | "coach" }
  | { type: "card"; minute: number; side: Side; player: string; colour: "yellow" | "red"; secondYellow?: true };

export type SideStat = {
  goals: number;
  /** Ataques que chegaram ao último terço: os que não chegaram a remate também contam. */
  chances: number;
  shots: number;
  onTarget: number;
  blocked: number;
  xg: number;
  corners: number;
  fouls: number;
  yellows: number;
  reds: number;
  injuries: number;
  /** Minutos em que a equipa teve a bola (a posse é a razão entre os dois lados). */
  possessionMinutes: number;
};

export type MatchSummary = {
  minute: number;
  duration: number;
  finished: boolean;
  home: SideStat;
  away: SideStat;
  /** Fração de posse da equipa da casa, 0-1. */
  homePossession: number;
};

export type MatchInput = {
  /** Seed do save; com o `id` do jogo determina tudo. */
  seed: string;
  id: string;
  home: MatchTeam;
  away: MatchTeam;
  /** Qualidade do relvado do estádio da casa, 0 (péssimo) a 1 (perfeito); por omissão 0,5. */
  turf?: number;
};
