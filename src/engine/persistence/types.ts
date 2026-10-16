/**
 * Tipos da camada de persistência (RZ-128). Ver docs/EVENT_HISTORY.md.
 * O motor só conhece estes tipos e a interface `Repositorio`; o SQLite é um pormenor.
 */

/** 'AAAA-MM-DD' no calendário do jogo. */
export type IsoDate = string;

export type Visibility = "exposed" | "private" | "secret";
export type EntityType = "club" | "person" | "city" | "locality" | "competition" | "match";
export type Origin = "match" | "generated";

export type RefEntity = { k: EntityType; id: string; roleKind?: string };

/** O que o motor entrega para acrescentar; `id` e `v` atribuem-se ao gravar. */
export type NewEvent = {
  type: string;
  /** Versão do esquema de `dados` para este tipo (por omissão 1). */
  v?: number;
  date: IsoDate;
  season: number;
  round?: number;
  visibility: Visibility;
  entities: RefEntity[];
  cause?: number;
  /** Só em eventos CORRECAO. */
  fixes?: number;
  origin?: Origin;
  data: Record<string, unknown>;
};

export type HistoryEvent = Required<Omit<NewEvent, "round" | "cause" | "fixes">> & {
  id: number;
  round?: number;
  cause?: number;
  fixes?: number;
};

/** Códigos de `jogo_facto`: G golo, A assistência, CA amarelo, CV vermelho, L lesão, S substituição, P penálti falhado. */
export type FactType = "G" | "A" | "CA" | "CV" | "L" | "S" | "P";

export type FactMatch = {
  minute: number;
  type: FactType;
  player: string;
  /** Em G: o clube a quem o golo é creditado (num auto-golo, o adversário do jogador). */
  club: string;
  /** p. ex. 'penalti', 'auto', 'gravidade:3'. */
  extra?: string;
};

export type Appearance = { player: string; club: string; starter: boolean; minutes: number; rating?: number };

export type NewMatch = {
  id: string;
  competition: string;
  season: number;
  round: number;
  date: IsoDate;
  home: string;
  away: string;
  homeGoals: number;
  awayGoals: number;
  homeXg?: number;
  awayXg?: number;
  homePossession?: number;
  attendance?: number;
  revenue?: number;
  importance?: number;
  referee?: string;
  cause?: number;
};

export type Match = Required<Omit<NewMatch, "cause">> & { event: number };

export type StandingsLine = {
  club: string;
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  scoredGoals: number;
  concededGoals: number;
  /** Pontos dos jogos, sem ajustes. */
  matchesPoints: number;
  /** Soma dos ajustes (sanções retroativas). */
  adjustment: number;
  points: number;
};

/** Estatísticas de um jogador numa competição e época, com a nota média das participações com nota. */
export type PlayerCompetitionStats = PlayerStatLine & { avgRating?: number; ratedGames: number };

export type PlayerStatLine = {
  player: string;
  season: number;
  club: string;
  competition: string;
  matches: number;
  minutes: number;
  goals: number;
  assists: number;
  yellows: number;
  reds: number;
};

/** Um cartão registado (facto CA ou CV) com a jornada do jogo, para calcular castigos (RZ-106). `extra` «2A» = vermelho por segundo amarelo. */
export type CardRecord = { player: string; match: string; round: number; minute: number; type: "CA" | "CV"; extra: string };

export type Scorer = { player: string; club: string; minute: number; match: string };

export type Observation = {
  id: number;
  observer: string;
  targetK: EntityType;
  targetId: string;
  /** atributos | personalidade | potencial | financas | contrato */
  group: string;
  values: Record<string, unknown>;
  quality: number;
  source: string;
  date: IsoDate;
  season: number;
};
export type NewObservation = Omit<Observation, "id">;

export type StandingsAdjustment = {
  competition: string;
  season: number;
  club: string;
  points: number;
  /** Evento (p. ex. SANCAO_APLICADA) que justifica o ajuste. */
  event: number;
};

export type PointsPerResult = { win: number; draw: number };

/** Jogo marcado no calendário (ainda sem resultado). Ao ser jogado passa a `jogo` (mesmo `id`). */
export type ScheduledMatch = { id: string; competition: string; season: number; round: number; date: IsoDate; home: string; away: string };
/** Clube que folga numa jornada de uma liga com número ímpar de clubes. */
export type ScheduledBye = { competition: string; season: number; round: number; club: string };

// ---------- pessoas (RZ-103). Tipos de armazenamento: o motor converte de/para os tipos ricos de `mundo`.
export type PersonRecord = {
  id: string;
  name: string;
  sportingName: string;
  birth: IsoDate;
  nationality: string;
  naturalDe?: string;
  roles: string[];
  /** Verdade oculta. */
  personality: Record<string, number>;
  archetype: string;
  lod: 1 | 2 | 3;
};
export type PlayerRecord = {
  person: string;
  positions: { pos: string; aptitude: number }[];
  /** Verdade oculta. */
  attributes: Record<string, number>;
  /** Verdade oculta. */
  potential: number;
  heightCm: number;
  weightKg: number;
  pe: "D" | "E" | "A";
  club?: string;
  state: "active" | "free";
};
export type ContractRecord = { person: string; club: string; monthlyWage: number; start: IsoDate; end: IsoDate };
export type RoleRecord = { person: string; fn: string; club?: string; city?: string; quality?: Record<string, number> };
// ---------- localidades (RZ-136)
export type LocalityStatus = "village" | "town" | "city";
/** Estado atual de uma localidade. `desde` = data em que passou a ter o estatuto atual. */
export type LocalityRecord = { id: string; name: string; city: string; population: number; status: LocalityStatus; since: IsoDate };
/** Mudança de população/estatuto. Se o estatuto mudar, regista-se o evento público LOCALIDADE_ESTATUTO. */
export type LocalityUpdate = { population: number; status: LocalityStatus; date: IsoDate; season: number; cause?: number };

export type WorldBatchRecord = { people: PersonRecord[]; players: PlayerRecord[]; contracts: ContractRecord[]; roles: RoleRecord[] };

/** O que qualquer observador pode saber de uma pessoa sem a ter observado: factos públicos. */
export type PublicPerson = {
  id: string;
  name: string;
  sportingName: string;
  birth: IsoDate;
  nationality: string;
  naturalDe?: string;
  roles: string[];
  club?: string;
  fn?: string;
  player?: { position: string; heightCm: number; weightKg: number; pe: "D" | "E" | "A"; state: "active" | "free" };
};

/** Entrada do índice de pesquisa de pessoas: só factos públicos. */
export type PersonIndex = { id: string; name: string; sportingName: string; club?: string; position?: string; fn?: string };
