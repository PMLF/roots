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
export type Level = 1 | 2 | 3 | 4 | 5;
/** Zona do campo por onde a equipa procura atacar (RZ-249). */
export type Area = "wings" | "left" | "right" | "centre" | "any";
export const AREAS: readonly Area[] = ["wings", "left", "right", "centre", "any"];

/**
 * Tática de uma equipa (RZ-108, RZ-249). Cada opção tem 5 níveis, do extremo da esquerda (1) ao da direita (5); 3 = neutro.
 * - intensity: 1 muito lenta … 5 muito intensa.
 * - mentality: 1 muito defensivo … 5 muito atacante.
 * - fairPlay: 1 «fairplay é treta» … 5 super corretos.
 * - timeWasting (queimar tempo): 1 aproveitar cada segundo … 5 queimar sempre e provocar adversários.
 * - directness (forma de jogo): 1 toques curtos … 5 bola na frente, siga.
 * - shooting (frequência de remate): 1 só remates fáceis … 5 rematar de onde der.
 * - line: 1 colados à área … 5 linha muito subida.
 */
export type Tactic = { formation: FormationId; intensity: Level; mentality: Level; fairPlay: Level; timeWasting: Level; directness: Level; shooting: Level; line: Level; area: Area };

export type MatchTeam = {
  club: string;
  lineup: OnPitchPlayer[];
  /** Sem tática, usa-se `TATICA_PADRAO`. */
  tactic?: Tactic;
  /** Suplentes: substituem os lesionados (a escolha livre de substituições é RZ-215). */
  bench?: OnPitchPlayer[];
  /** Qualidade do staff médico (1-20, por omissão 10): menos lesões e paragens mais curtas. */
  medical?: number;
  /** Prudência do staff médico, -1..1 (0 por omissão): menos lesões e paragens mais longas quanto mais alta. */
  caution?: number;
  /** Qualidade tática do treinador (1-20, por omissão 10): quem sabe tira mais partido das opções arrojadas (RZ-249). */
  coach?: number;
  /** Ambiente do estádio, 0-1 (0,5 por omissão): sobe ou desce a vantagem de jogar em casa (RZ-263). */
  crowd?: number;
};

export type Origin = "openPlay" | "corner" | "free" | "penalty";
export type ShotResult = "goal" | "saved" | "away" | "blocked";

export type MatchEvent =
  | { type: "play"; minute: number; side: Side; player: string }
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
  /** Duração regular (90 + acréscimos); `duration` inclui o prolongamento, se houve. */
  regularDuration: number;
  /** Jogou-se prolongamento. */
  extraTime: boolean;
  /** Só quando o jogo (ou a eliminatória) acabou empatado depois do prolongamento. */
  shootout?: Shootout;
};

export type MatchInput = {
  /** Seed do save; com o `id` do jogo determina tudo. */
  seed: string;
  id: string;
  home: MatchTeam;
  away: MatchTeam;
  /** Qualidade do relvado do estádio da casa, 0 (péssimo) a 1 (perfeito); por omissão 0,5. */
  turf?: number;
  /** Jogo a eliminar (RZ-140): se acaba empatado joga-se prolongamento e, se continua empatado, decidem os penáltis. */
  knockout?: boolean;
  /** Campo neutro: sem vantagem de jogar em casa. */
  neutral?: boolean;
  /** Golos de cada lado na primeira mão (do ponto de vista desta casa/fora): a eliminatória decide-se pelo agregado. */
  carry?: { home: number; away: number };
};

/** Série de penáltis: totais e cada cobrança, por ordem. */
export type Shootout = { home: number; away: number; kicks: { side: Side; player: string; scored: boolean }[] };
