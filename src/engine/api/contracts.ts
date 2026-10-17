import type { Params } from "../config/parameters";
import type { SearchResult } from "../search/search";
import type { CompetitionPage } from "../competition/profile";
import type { SummaryCompetition, LabMatch, LabLeague } from "../lab/lab";
import type { ClubSeason } from "../competition/clubSeason";
import type { FormationId, Tactic } from "../match/types";
import type { NewsScope, Message as InboxMessage, NewsItem } from "../news/news";
import type { LiveMatch } from "../season/liveMatch";
import type { TimeState, Mode, AdvanceResult } from "../season/advance";
import type { Plan } from "../season/gamePlan";
import type { Position } from "../world/types";
import type { Tier, LevelReputation } from "../config/parameters";
import type { PlayerStatLine } from "../persistence/types";
import type { PersonProfile, ViewPerson } from "../view/types";

/** Resultado do autodiagnóstico da base de dados (RZ-128): escreve um evento e lê-o de volta. */
export type DbDiagnostics = {
  backend: "opfs" | "memory";
  /** Verdadeiro se os dados sobrevivem a recarregar a página. */
  persistent: boolean;
  memoryReason?: string;
  sqlite: string;
  schema: number;
  /** Total de eventos DIAGNOSTICO guardados neste save (sobe a cada abertura se for persistente). */
  openings: number;
  /** Eventos totais no save. */
  events: number;
};

export type WorldProgress = { phase: string; done: number; total: number };

export type CreatedWorldSummary = {
  seed: string;
  clubs: number;
  people: number;
  players: number;
  /** Tempo de geração + gravação neste pedido (0 se o mundo já existia). */
  ms: number;
  /** Avisos de calibração da validação (não bloqueiam). */
  warnings: string[];
  /** O save já tinha mundo (não se gera outra vez). */
  alreadyExisted: boolean;
};

/** Referência a uma entidade para ligações (`Ligacao`): tipo, id e nome a mostrar. */
export type EntityRef = { k: "club" | "city" | "locality" | "person" | "competition"; id: string; name: string };

/** Nível geral (1-20): estimado (com margem) a partir do que se sabe dos atributos; exato no modo developer. */
import type { StarRating } from "../world/stars";
export type { StarRating };

export type EstimatedLevel = { value: number; margin: number; exact: boolean };

/** A verdade oculta, só devolvida no modo developer («ver tudo»). */
export type PersonTruth = {
  attributes?: Record<string, number>;
  potential?: number;
  positions?: { pos: string; aptitude: number }[];
  personality: Record<string, number>;
  archetype: string;
  lod: number;
  monthlyWage?: number;
  quality?: Record<string, number>;
};

/** Contrato a expirar no clube do gamer (RZ-165): pedido do jogador e decisão já tomada. */
export type RenewalLine = {
  id: string;
  name: string;
  position: string;
  age: number;
  endContract: string;
  currentWage: number;
  ask: { wage: number; years: number };
  agent?: string;
  decision?: { kind: "renew"; wage: number; years: number } | { kind: "release" };
};
export type RenewalsData = { season: number; nextSeasonStart: string; lines: RenewalLine[] };

export type ClubOffer = { id: string; name: string; league: string; tier: Tier; levelReputation: LevelReputation; since: string };

export type PersonProfileData = {
  profile: PersonProfile;
  club?: EntityRef;
  birthCity?: EntityRef;
  /** Factos de jogo por época e competição (públicos). */
  stats: PlayerStatLine[];
  /** Ano em que começa a época 1 do save (2026 → «2026/27»). */
  initialYear: number;
  /** Contrato atual: as datas são públicas, o salário não. */
  contract?: { start: string; end: string };
  level?: EstimatedLevel;
  /** Estrelas (RZ-916): qualidade relativa ao escalão onde joga e intervalo de potencial. */
  rating?: StarRating;
  truth?: PersonTruth;
};

/** Finanças do clube na ficha (RZ-114): uma palavra para todos; o clube do gamer vê também o saldo e o último fecho mensal. */
export type ClubFinances = {
  state: "nearBankruptcy" | "atRisk" | "tight" | "powerful" | "veryRich" | "rich" | "comfortable" | "wellOff" | "stable" | "modest" | "poor";
  /** Sem erro de estimativa (o próprio clube). */
  exact: boolean;
  balance?: number;
  /** Só o teu clube: massa salarial máxima e verba de transferências (euros), e quanto já se gasta em salários por ano. */
  budget?: { wageBillMax: number; transfers: number; currentBill: number; above: boolean };
  lastClose?: { date: string; revenues: number; expenses: number; byCategory: Record<string, number> };
};

export type ClubProfileData = {
  id: string;
  name: string;
  league: string;
  locality: EntityRef & { status: LocalityStatus };
  city: EntityRef;
  district: string;
  colours: string;
  nickname: string;
  mascot: string;
  rival?: EntityRef;
  reputation: number;
  stadium: { name: string; capacity: number };
  squad: ViewPerson[];
  roles: ViewPerson[];
  tier: Tier;
  finances: ClubFinances;
  levelReputation: LevelReputation;
  detailStadium: { ownership: string; zone: string; centreDistanceKm: number; transport: number; roadAccess: number; parking: number; expansionTerrain: number };
  /** Patrocinadores vigentes (nome e setor são públicos; o valor só o gamer vê no seu clube). */
  sponsors: { company: string; name: string; sector: string; kind: string; annualValue?: number }[];
  /** Divisão em que o clube esteve, por época (a história de subidas e descidas). */
  divisionsHistory: { season: number; label: string; tier: Tier; league: string }[];
  /** Por jogador do plantel: fim de contrato e nível geral. */
  extraSquad: Record<string, { endContract?: string; level?: EstimatedLevel; rating?: StarRating }>;
  /** Estatísticas da época atual (jogadores do plantel e tops do clube). */
  season?: ClubSeason;
  /** Por membro da equipa técnica: desde quando está no clube (contrato). */
  truth?: { reputation: number; finances: number; staffQuality: Record<string, Record<string, number>>; squadLevel: number };
};

export type LocalityStatus = "village" | "town" | "city";

export type LocalityProfileData = {
  id: string;
  name: string;
  status: LocalityStatus;
  population: number;
  /** Desde quando tem o estatuto atual. */
  since: string;
  host: boolean;
  city: EntityRef;
  district: string;
  clubs: (EntityRef & { league: string })[];
  /** Mudanças de estatuto, da mais recente para a mais antiga. */
  history: { date: string; from: LocalityStatus; to: LocalityStatus; population: number }[];
};

/** Ficha de uma cidade (concelho; RZ-133): só o que qualquer pessoa pode saber. Os números verdadeiros ficam no motor; aqui vão níveis em palavras e tendências. */
export type ViewCityLevel = 1 | 2 | 3 | 4 | 5;
export type CityProfileData = {
  id: string;
  name: string;
  district: string;
  hub: string;
  island: boolean;
  sector: string;
  secondarySector: string;
  /** Habitantes (dado público). */
  population: number;
  historyPopulation: { season: number; label: string; population: number }[];
  indicators: {
    id: "economy" | "employment" | "tourism" | "pride" | "notoriety" | "footballCulture";
    level: ViewCityLevel;
    trend: "rises" | "stable" | "drops";
    history: { season: number; label: string; level: ViewCityLevel }[];
  }[];
  /** Orçamento municipal por habitante, em relação às outras cidades. */
  budget: ViewCityLevel;
  mayor?: {
    person: EntityRef;
    sinceTerm: number;
    untilTerm: number;
    sportSupport: ViewCityLevel;
    /** Reputação pública: só o que se diz dele na cidade. */
    profile: ("vain" | "lowProfile" | "ambitious")[];
  };
  localities: { ref: EntityRef; status: LocalityStatus; population: number }[];
  clubs: { ref: EntityRef; league: string; tier: string; stadium: { name: string; capacity: number; ownership: "club" | "municipal" | "shared" } }[];
  /** Acontecimentos que marcaram a cidade, do mais recente para o mais antigo. */
  incidents: { date: string; season: number; label: string; type: string; regional: boolean; hub?: string }[];
};

export type { SearchResult, SummaryCompetition, LabMatch, LabLeague, CompetitionPage };

/** O plano de jogo do clube do gamer, pronto para a página Tática. */
export type ViewPlan = {
  /** Nome do clube do gamer. */
  clubName: string;
  tactic: Tactic;
  /** `true` enquanto o gamer não escolheu o onze: o que se mostra é a proposta automática. */
  automatic: boolean;
  formations: FormationId[];
  formationPositions: Record<FormationId, Position[]>;
  /** `rendimento` (0-1): quanto rende o jogador na posição em que está (1 = posição natural); `foraDePosicao` avisa na interface (RZ-177). */
  lineup: { player: string; name: string; position: Position; aptitude: number; performance: number; outOfPosition: boolean }[];
  /** `forma` (0,85-1): cansaço por jogos recentes; 1 = descansado ou carga normal. */
  squad: { player: string; name: string; form: number; positions: { pos: Position; aptitude: number }[]; unavailable?: "injury" | "suspended"; matchesPerMeet?: number }[];
  nextMatch?: { id: string; date: string; competition: string; opponent: string; atHome: boolean; confirmed: boolean; /** O jogo já começou e está a decorrer. */ ongoing: boolean; opponentId: string; opponentColours: string };
};

export type SummaryClub = { id: string; name: string; league: string; colours: string };

/** Contrato entre a interface e o motor (que corre num Web Worker). Só dados serializáveis. */
export type EngineRequests = {
  ping: { input: { echo: string }; output: { echo: string; clockMs: number } };
  version: { input: null; output: { engine: string; schema: number } };
  parameters: { input: null; output: Params };
  db: { input: null; output: DbDiagnostics };
  /** Cria o mundo do save (RZ-103). Emite progresso; se o save já tem mundo, devolve o resumo sem gerar. */
  createWorld: { input: { seed: string }; output: CreatedWorldSummary };
  /** O mundo do save, se já foi criado (não gera nada). */
  worldState: { input: null; output: CreatedWorldSummary | null };
  clubs: { input: null; output: SummaryClub[] };
  countries: { input: null; output: { id: string; name: string }[] };
  /** Pesquisa global por nome (clubes, cidades, pessoas). */
  find: { input: { q: string; limit?: number }; output: SearchResult[] };
  personProfile: { input: { id: string; seeAll?: boolean }; output: PersonProfileData | null };
  clubProfile: { input: { id: string; seeAll?: boolean }; output: ClubProfileData | null };
  localityProfile: { input: { id: string }; output: LocalityProfileData | null };
  /** Ficha de uma cidade (concelho): variáveis em palavras, autarca, clubes e acontecimentos (RZ-133). */
  cityProfile: { input: { id: string }; output: CityProfileData | null };
  /** Apaga o save atual e gera um mundo novo com esta seed (RZ-137). Emite progresso como `criarMundo`. */
  restartWorld: { input: { seed: string }; output: CreatedWorldSummary };
  /** Laboratório (RZ-139): as ligas e séries do mundo. */
  competitions: { input: null; output: SummaryCompetition[] };
  /** Página de uma liga ou série (RZ-145): classificação com zonas, jornadas, destaques e clubes (prévia do calendário se a época ainda não começou). */
  competitionPage: { input: { league: string; season?: number }; output: CompetitionPage | null };
  /** Laboratório: simula um jogo entre dois clubes sem gravar nada no save. */
  matchLab: { input: { home: string; away: string; seed: string; homeTactic?: Partial<Tactic>; awayTactic?: Partial<Tactic> }; output: LabMatch };
  /** Laboratório: simula uma liga inteira (uma época) sem gravar nada no save. */
  /** O clube do gamer neste save (`null` enquanto não escolheu). */
  gamerClub: { input: null; output: { id: string } | null };
  /**
   * Escolhe o clube do save. Só se pode escolher uma vez: depois, só mudando de clube por demissão ou despedimento
   * (RZ-157). `forcar` é a troca dos developers (seletor da barra lateral, só no modo dev).
   */
  /** O gamer demite-se do clube (RZ-157). Fica sem clube e recebe ofertas. */
  /** Linha do tempo do jogo do clube do gamer, para o ver minuto a minuto (RZ-130). Sem `id`, o último. */
  liveMatch: { input: { id?: string }; output: LiveMatch | null };
  /** Notícias do clube do gamer, da liga dele ou do mundo (RZ-118), mais recentes primeiro. */
  news: { input: { scope: NewsScope; limit?: number; beforeOf?: number }; output: NewsItem[] };
  /** Caixa de entrada do gamer: o que se passa com o clube e com ele. */
  inbox: { input: { limit?: number; beforeOf?: number }; output: { messages: InboxMessage[]; unread: number } };
  markInboxRead: { input: null; output: null };
  /** Começa o jogo do gamer (RZ-170): nada fica no histórico até ao apito final. */
  startMatch: { input: { match: string }; output: LiveMatch };
  /** Avança `minutos` minutos do jogo a decorrer; no fim regista-o. */
  matchStep: { input: { minutes: number }; output: LiveMatch };
  /** Muda a tática do gamer durante o jogo, a partir do minuto seguinte. */
  setBudget: { input: { wageBillMax: number; transfers: number }; output: ClubFinances };
  tacticInMatch: { input: { tactic: Tactic }; output: LiveMatch };
  /** Substituições do gamer (todas as de uma paragem): sai quem está em campo, entra quem está no banco. */
  substitutionsInMatch: { input: { substitutions: { playerOut: string; playerIn: string }[] }; output: LiveMatch };
  /** Marca uma mensagem como lida ou por ler. */
  markMessage: { input: { id: number; isRead: boolean }; output: null };
  resign: { input: null; output: { club: string } };
  /** Ofertas de clubes quando o gamer está sem clube. */
  offers: { input: null; output: { unemployed: boolean; previous?: string; offers: ClubOffer[] } };
  acceptOffer: { input: { id: string }; output: { id: string } };
  /** Contratos a expirar no clube do gamer, com o pedido de cada jogador (RZ-165). Quem não tiver decisão renova pela fórmula do escalão. */
  renewals: { input: null; output: RenewalsData };
  /** O gamer oferece condições a um jogador: aceita se chegarem ao patamar dele; senão devolve o pedido. Guarda a decisão se aceitar. */
  negotiateRenewal: { input: { person: string; wage: number; years: number }; output: { accepted: boolean; ask: { wage: number; years: number } } };
  /** O gamer decide deixar sair um jogador com contrato a expirar. */
  releaseExpiring: { input: { person: string }; output: null };
  chooseClub: { input: { id: string; force?: boolean }; output: { id: string } };
  /** O plano de jogo (tática e onze) do clube do gamer. */
  plan: { input: null; output: ViewPlan | null };
  /** Guarda tática e onze (`onze: null` volta ao onze automático). Pode fazer-se a qualquer momento. */
  savePlan: { input: { tactic: Tactic; lineup: Plan["lineup"] | null }; output: ViewPlan };
  /** Confirma onze e tática para o próximo jogo do clube: o avanço deixa de parar antes dele. */
  confirmMatch: { input: { match: string }; output: { match: string } };
  /** A data do save, a época e quantos jogos faltam (prepara o calendário da época na primeira vez). */
  timeState: { input: null; output: TimeState };
  /** Avança no tempo e joga os jogos desses dias (RZ-119). Com `clube`, o jogo desse clube guarda todo o detalhe e pára o avanço (`proximoJogo`). */
  advance: { input: { mode: Mode; club?: string }; output: AdvanceResult };
  leagueLab: { input: { league: string; seed: string; formation?: FormationId }; output: LabLeague };
  /** Plantel público de um clube, lido através da `Vista` (sem atributos, potencial nem personalidade). */
  squad: { input: { club: string }; output: ViewPerson[] };
};

export type RequestType = keyof EngineRequests;

export type Message<K extends RequestType = RequestType> = {
  [T in K]: { id: number; type: T; input: EngineRequests[T]["input"] };
}[K];

export type EngineResponse =
  | { id: number; ok: true; output: unknown }
  | { id: number; ok: false; error: string }
  /** Progresso de um pedido demorado; o resultado final chega depois como `ok`. */
  | { id: number; progress: WorldProgress };
