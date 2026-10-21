/**
 * Motor genérico de competições (RZ-140). Uma competição é uma sequência de **fases** (stages); cada fase é de um tipo:
 *  - `knockout`: eliminatórias a uma ou duas mãos, com entradas escalonadas, folgas e sorteio configurável (Taças);
 *  - `groups`: grupos todos-contra-todos, com os melhores de cada grupo a passar (Liga dos Campeões até 2023/24);
 *  - `leaguePhase`: fase de liga «suíça», com potes e um número fixo de adversários por pote (Liga dos Campeões desde 2024/25).
 * O resultado de cada fase alimenta a seguinte através de uma função de qualificação (código, não dados): assim cabem
 * formatos como «fase de liga → play-off a duas mãos → eliminatórias» sem mexer no motor.
 *
 * Tudo aqui é puro: sem repositório nem relógio. Quem usa dá as datas e os resultados e agenda os jogos devolvidos.
 */
import type { Tier, Params } from "../../config/parameters";
import type { IsoDate } from "../../persistence/types";

export type ClubId = string;

/** Quem entra numa competição. `seed`: menor = mais forte. `tier`: 0 = escalão mais alto (a Primeira Liga). */
export type Entrant = { club: ClubId; seed: number; tier: number; /** p. ex. o grupo de onde veio, para o sorteio evitar repetir. */ origin?: string };

/** Um jogo a marcar. */
export type Fixture = {
  id: string;
  stage: number;
  /** Jornada/ronda da competição inteira, 1, 2, 3… (as duas mãos de uma eliminatória têm rondas seguidas). */
  round: number;
  date: IsoDate;
  home: ClubId;
  away: ClubId;
  /** Tem de haver vencedor (prolongamento e penáltis). */
  knockout: boolean;
  neutral?: boolean;
  venue?: ClubId;
  /** Segunda mão: o id da primeira. */
  firstLeg?: string;
};

export type Played = { home: ClubId; away: ClubId; homeGoals: number; awayGoals: number; homePenalties?: number; awayPenalties?: number };
export type Results = (matchId: string) => Played | undefined;

/** Como se emparelha uma ronda e quem tem a vantagem de jogar em casa. */
export type DrawRules = {
  /** `random`: sorteio livre · `seeded`: cabeças de série (metade melhor) contra não cabeças · `bracket`: 1.º com último, 2.º com penúltimo… */
  pairing: "random" | "seeded" | "bracket";
  /** `lowerTier`: o clube de escalão inferior (underdog) · `betterSeed`: o melhor cabeça de série · `random`. Com duas mãos, quem tem a vantagem joga a segunda em casa. */
  advantage: "lowerTier" | "betterSeed" | "random";
  /** Tenta não emparelhar clubes com a mesma `origin` (p. ex. do mesmo grupo). */
  avoidSameOrigin?: boolean;
};

export type KnockoutStage = {
  kind: "knockout";
  name: string;
  /** Mãos de cada eliminatória (a final pode ser diferente: `finalLegs`). */
  legs: 1 | 2;
  /** Por omissão, igual a `legs`. As finais costumam ser a uma mão. */
  finalLegs?: 1 | 2;
  /** Por omissão, igual a `legs`. Na Taça de Portugal só as meias-finais são a duas mãos. */
  semiLegs?: 1 | 2;
  /** A final joga-se em campo neutro. */
  finalNeutral?: boolean;
  rules: DrawRules;
  /**
   * Entradas escalonadas: quem entra em cada vaga, por ordem. `entrants` da fase é a vaga 0; estas são as seguintes (clubes de
   * escalão superior que só entram a meio, como na Taça). Cada vaga entra com um campo que o planeamento acerta (folgas).
   */
  lateWaves?: Entrant[][];
};
export type GroupsStage = {
  kind: "groups";
  name: string;
  groups: number;
  legs: 1 | 2;
  /** Quantos de cada grupo passam. */
  qualify: number;
};
export type LeaguePhaseStage = {
  kind: "leaguePhase";
  name: string;
  /** Potes por seed, todos do mesmo tamanho. */
  pots: number;
  /** Adversários de cada clube em cada pote (inclusive o seu), metade em casa e metade fora: par, ou 1 (Liga Conferência). */
  perPot: number;
};
type StageDef = KnockoutStage | GroupsStage | LeaguePhaseStage;

/** O que uma fase deixa para a seguinte e para o fim da competição. */
export type StageOutcome = {
  /** Classificação final da fase, do primeiro ao último (nas eliminatórias: vencedor, finalista, depois por ronda de saída). */
  ranking: ClubId[];
  /** Fase de grupos: a classificação de cada grupo. */
  groups?: { id: string; table: ClubId[] }[];
  winner?: ClubId;
  runnerUp?: ClubId;
};

export type CompetitionDef = {
  id: string;
  stages: StageDef[];
  /** Quem entra na fase `i ≥ 1`, a partir das classificações das fases anteriores. Por omissão, o ranking inteiro da fase anterior. */
  qualify?: (stage: number, outcomes: readonly StageOutcome[], entrants: ReadonlyMap<ClubId, Entrant>) => Entrant[] | { entrants: Entrant[]; /** Só para fases a eliminar: clubes que entram numa ronda posterior (p. ex. os apurados diretamente). */ lateWaves: Entrant[][] };
};

/** O que o motor precisa do exterior. */
export type RunContext = {
  seed: string;
  competition: string;
  season: number;
  params: Params;
  /** Prefixo dos ids dos jogos. */
  idPrefix: string;
  /** `count` datas, uma por ronda/jornada de jogo, por ordem. */
  allocateDates: (stage: number, count: number, info: { kind: StageDef["kind"]; /** Knockout: mãos de cada ronda. */ legsPerRound?: number[] }) => IsoDate[];
  /** Campo neutro: o clube cujo estádio recebe o jogo. */
  neutralVenue?: (a: ClubId, b: ClubId) => ClubId | undefined;
  /** Reputação dos clubes, para os desempates das tabelas. */
  reputation?: ReadonlyMap<ClubId, number>;
  tier?: (club: ClubId) => Tier;
};

/** Acontecimentos que o motor reporta ao fim de cada ronda, para prémios, histórico e notícias. */
export type TieResult = { winner: ClubId; loser: ClubId; fixtures: string[]; /** Decidida nos penáltis. */ penalties: boolean; /** Houve prolongamento em algum jogo. */ extraTime?: boolean; aggregate?: { winner: number; loser: number } };
export type RoundLabel = { fromEnd: number; field: number };
export type StageEvent =
  | { type: "roundPlayed"; stage: number; round: number; label: RoundLabel; ties: TieResult[]; byes: ClubId[] }
  | { type: "stageDone"; stage: number; outcome: StageOutcome }
  | { type: "competitionDone"; winner?: ClubId; runnerUp?: ClubId };

/** Nome estável de uma ronda a eliminar, para a interface traduzir: final, semi, quarter, r16, r32… ou round (preliminar). */
export function roundKey(label: RoundLabel): string {
  if (label.fromEnd === 0) return "final";
  if (label.fromEnd === 1) return "semi";
  if (label.fromEnd === 2) return "quarter";
  const p = 2 ** (label.fromEnd + 1);
  return Number.isInteger(Math.log2(label.field)) && label.field === p ? `r${p}` : "round";
}
