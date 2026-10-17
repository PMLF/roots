import type {
  StandingsAdjustment,
  LocalityUpdate,
  LocalityRecord,
  RoleRecord,
  ContractRecord,
  IsoDate,
  RefEntity,
  HistoryEvent,
  NewEvent,
  ScheduledBye,
  Match,
  ScheduledMatch,
  FactMatch,
  CardRecord,
  PlayerRecord,
  PlayerPatch,
  CompanyRecord,
  CompanyPatch,
  CompanyState,
  SponsorshipRecord,
  NewSponsorship,
  PlayerState,
  NewMatch,
  StandingsLine,
  PlayerStatLine,
  PlayerCompetitionStats,
  Scorer,
  Observation,
  NewObservation,
  Appearance,
  PersonIndex,
  PublicPerson,
  PersonRecord,
  WorldBatchRecord,
  Visibility,
} from "./types";

/** Eventos de todo o mundo, por ordem de id decrescente (as notícias e a caixa de entrada). */
export type RecentFilter = {
  types?: readonly string[];
  publicOnly?: boolean;
  /** Só eventos com id maior (por exemplo, os que chegaram depois da última leitura). */
  afterOf?: number;
  /** Só eventos com id menor (para paginar). */
  beforeOf?: number;
  limit?: number;
};

export type EventsFilter = {
  /** Só eventos públicos (o que qualquer interessado pode ver). Atalho de `vis: ["publico"]`. */
  publicOnly?: boolean;
  /** Só eventos com estas visibilidades. */
  visibility?: readonly Visibility[];
  type?: string;
  seasonSince?: number;
  untilSeason?: number;
  /** Só eventos com id maior / menor (paginação e «desde a última leitura»). */
  afterOf?: number;
  beforeOf?: number;
  limit?: number;
};

/**
 * Porta de persistência do motor. Síncrona (o motor corre num worker e os dois SQLite são síncronos).
 * Adaptadores: memória (testes rápidos), SQLite (Node e browser). Todos passam na mesma bateria de testes.
 * A história é só de acrescentar; as derivadas atualizam-se na mesma transação e são reconstruíveis.
 */
export interface Repository {
  readonly schemaVersion: number;

  /** Atómico e encadeável: se `fn` lançar, desfaz tudo o que fez (incluindo transações internas). */
  transaction<T>(fn: () => T): T;

  /**
   * Apaga tudo (história incluída) e deixa o save como novo. É o «novo mundo»: nunca se usa a meio de um jogo
   * (as ranhuras e os saves exportados chegam com RZ-134). Fora de qualquer transação.
   */
  restart(): void;

  // --- metadados do save (seed, versão do motor, …)
  meta(rowKey: string): string | undefined;
  setMeta(rowKey: string, value: string): void;

  // --- história
  appendEvent(e: NewEvent): number;
  event(id: number): HistoryEvent | undefined;
  eventsTotal(): number;
  /** Mais recentes primeiro. */
  eventsOf(entity: Pick<RefEntity, "k" | "id">, filter?: EventsFilter): HistoryEvent[];
  /** Os eventos mais recentes de qualquer entidade, mais recente primeiro. */
  recentEvents(filter?: RecentFilter): HistoryEvent[];
  count(type: string, entity?: Pick<RefEntity, "k" | "id">, halfTime?: { seasonSince?: number; untilSeason?: number }): number;
  last(type: string, entity: Pick<RefEntity, "k" | "id">): HistoryEvent | undefined;
  /** Os `n` eventos mais recentes do tipo para a entidade (mais recente primeiro). Rege "3 derrotas seguidas", etc. */
  lastN(type: string, entity: Pick<RefEntity, "k" | "id">, n: number): HistoryEvent[];
  /** O evento, as suas causas (para trás) e os seus efeitos (para a frente), por ordem de id. */
  chain(eventId: number): HistoryEvent[];
  /** Todos os eventos por ordem de id, uma linha JSON cada (crónica, partilha, depuração). */
  exportNdjson(): string;

  // --- jogos (factos compactos) + derivadas
  recordMatch(match: NewMatch, facts: FactMatch[], appearances: Appearance[]): { event: number };
  match(id: string): Match | undefined;
  /** Os jogos já jogados entre dois clubes (em qualquer dos campos), do mais recente para o mais antigo. */
  meetings(a: string, b: string, limit: number): Match[];
  scorers(competition: string, season: number, round: number): Scorer[];
  /** Cartões (CA, CV) destes jogadores nesta competição e época, por jornada, data, jogo e minuto. */
  cards(competition: string, season: number, players: readonly string[]): CardRecord[];
  /** Minutos jogados por cada jogador em jogos com data em [desde, ate): serve o cansaço (RZ-177). Só devolve quem jogou. */
  playedMinutes(players: readonly string[], since: IsoDate, until: IsoDate): Map<string, number>;
  /** Jornadas (sem repetidas, por ordem) em que o clube jogou nesta competição e época. */
  playedRounds(club: string, competition: string, season: number): number[];
  /** Jogos jogados nesta competição e época, por jornada, data e id. */
  competitionMatches(competition: string, season: number): Match[];
  standings(competition: string, season: number): StandingsLine[];
  playerStats(player: string): PlayerStatLine[];
  /** Estatísticas de todos os jogadores numa competição e época (golos, assistências, cartões, nota média). Só quem já jogou ou foi convocado. */
  playerStatsForCompetition(competition: string, season: number): PlayerCompetitionStats[];
  /** Acrescenta uma sanção retroativa: não reescreve nenhum jogo nem evento. */
  adjustStandings(a: StandingsAdjustment): void;
  /** Recalcula todas as derivadas a partir da história. Deve dar o mesmo que o incremental. */
  rebuildDerived(): void;

  // --- calendário (RZ-102)
  /** Guarda o calendário de uma liga numa época. Recusa se já existir calendário dessa competição/época. */
  saveCalendar(matches: readonly ScheduledMatch[], byes: readonly ScheduledBye[]): void;
  /** Por jornada e, dentro dela, por id. */
  calendar(competition: string, season: number): { matches: ScheduledMatch[]; byes: ScheduledBye[] };
  /** Jogos de um clube na época (casa ou fora), por data. */
  clubCalendar(club: string, season: number): ScheduledMatch[];
  /** Todos os jogos marcados para um dia (de todas as competições), por id. */
  dayMatches(date: IsoDate): ScheduledMatch[];
  /** Primeiro jogo marcado do clube em `desde` ou depois. */
  nextMatch(club: string, since: IsoDate): ScheduledMatch | undefined;

  // --- pessoas (RZ-103)
  /** Guarda o mundo gerado numa só transação (`aoProgredir` é chamado por lotes). Recusa se já existirem pessoas. */
  saveWorld(batch: WorldBatchRecord, onProgress?: (done: number, total: number) => void): void;
  /** Acrescenta pessoas depois do arranque (formação, novos jogadores livres). Recusa ids repetidos e referências em falta. */
  addPeople(batch: WorldBatchRecord): void;
  /** Altera factos de um jogador existente (desenvolvimento, clube, estado). */
  updatePlayer(person: string, patch: PlayerPatch): void;
  /** Novo contrato: o mais recente é o vigente; os anteriores ficam como história. */
  saveContract(c: ContractRecord): void;
  /** Todos os jogadores num dado estado, por id. */
  playersByState(state: PlayerState): PlayerRecord[];
  peopleTotal(): number;
  /** Todas as pessoas com os factos públicos mínimos para pesquisar (nome, clube, posição, função). */
  peopleIndex(): PersonIndex[];
  /** Factos públicos de uma pessoa: nome, idade, clube, posição, corpo. Nunca atributos, potencial nem personalidade. */
  publicPerson(id: string): PublicPerson | undefined;
  /** Plantel público de um clube (jogadores ativos, por posição e nome). */
  publicSquad(club: string): PublicPerson[];
  /** Cargos (presidente, treinador…) públicos de um clube ou cidade. */
  publicRoles(filter: { club?: string; city?: string }): PublicPerson[];
  // verdade oculta (só o motor: simulação, geração, observações)
  person(id: string): PersonRecord | undefined;
  player(person: string): PlayerRecord | undefined;
  contract(person: string): ContractRecord | undefined;
  role(person: string): RoleRecord | undefined;
  /** Ids das pessoas com uma função (ex.: `agent`), por ordem de id. */
  roleHolders(fn: string): string[];
  clubPlayers(club: string): PlayerRecord[];

  // --- empresas e patrocínios (RZ-219, RZ-311)
  /** Guarda as empresas de arranque. Recusa ids repetidos. */
  saveCompanies(companies: readonly CompanyRecord[]): void;
  company(id: string): CompanyRecord | undefined;
  /** Empresas por id, opcionalmente de uma cidade ou num estado. */
  companies(filter?: { city?: string; state?: CompanyState }): CompanyRecord[];
  updateCompany(id: string, patch: CompanyPatch): void;
  /** Novo contrato de patrocínio; devolve o id. */
  addSponsorship(s: NewSponsorship): number;
  /** Rescinde antes do fim (ou regista o fim antecipado) em `date`. */
  endSponsorship(id: number, date: IsoDate): void;
  /** Contratos vigentes do clube na data (por id); sem data devolve todos os não rescindidos. */
  clubSponsorships(club: string, on?: IsoDate): SponsorshipRecord[];
  companySponsorships(company: string, on?: IsoDate): SponsorshipRecord[];
  /** Todos os contratos não rescindidos que ainda não terminaram na data. */
  activeSponsorships(on: IsoDate): SponsorshipRecord[];

  // --- localidades (RZ-136)
  /** Guarda as localidades de arranque. Recusa se já existirem. */
  saveLocalities(localities: readonly LocalityRecord[]): void;
  locality(id: string): LocalityRecord | undefined;
  /** Por id; com `cidade`, só as desse concelho. */
  localities(filter?: { city?: string }): LocalityRecord[];
  /**
   * Atualiza população e estatuto. Se o estatuto mudar, acrescenta o evento público LOCALIDADE_ESTATUTO
   * ({ de, para, populacao }) e atualiza `desde`; devolve o id do evento (ou `undefined` se não mudou).
   */
  updateLocality(id: string, a: LocalityUpdate): { event?: number };

  // --- conhecimento
  appendObservation(o: NewObservation): number;
  /** Mais recentes primeiro. */
  observations(observer: string, target: Pick<RefEntity, "k" | "id">, group?: string): Observation[];
}

export type { IsoDate };
