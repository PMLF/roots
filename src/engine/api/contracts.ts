import type { Params } from "../config/parameters";
import type { SearchResult } from "../search/search";
import type { CompetitionPage } from "../competition/profile";
import type { CupView, ClubCompetition, RoundTag } from "../competition/cup";
import type { EuropeView } from "../europe/view";
import type { CompetitionHistory } from "../competition/history";
import type { RecentMatch } from "../competition/recent";
import type { SummaryCompetition, LabMatch, LabLeague } from "../lab/lab";
import type { ClubSeason } from "../competition/clubSeason";
import type { FormationId, Tactic } from "../match/types";
import type { Decision } from "../news/decisions";
import type { StadiumSector } from "../config/parameters";
import type { TurfResult, WorksResult } from "../club/stadium";
import type { OwnStaff, StaffCandidate, StaffResult } from "../club/staff";
import type { NewsScope, Message as InboxMessage, NewsItem } from "../news/news";
import type { LiveMatch } from "../season/liveMatch";
import type { TimeState, Mode, AdvanceResult } from "../season/advance";
import type { Plan } from "../season/gamePlan";
import type { Position } from "../world/types";
import type { Tier, LevelReputation } from "../config/parameters";
import type { PlayerStatLine } from "../persistence/types";
import type { PersonProfile, ViewPerson } from "../view/types";
import type { CatalogClub } from "./catalog";
import type { SaveMeta } from "../saves/saves";
export type { SaveMeta, SaveKind } from "../saves/saves";
export type { OwnStaff, StaffCandidate, StaffResult } from "../club/staff";
export type { CatalogClub, Difficulty } from "./catalog";

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
  currentRelease?: number;
  ask: { wage: number; years: number; release: number | null };
  agent?: string;
  decision?: { kind: "renew"; wage: number; years: number; release: number | null } | { kind: "release" };
  /** Rondas já feitas com o agente e, se a porta fechou, porquê. */
  negotiation?: { round: number; roundsLeft: number; closed?: "refused" | "level" | "distance"; reopens?: string };
  /** Valores sugeridos para os dropdowns da proposta. */
  suggestions: { wages: number[]; releases: number[] };
};
type RenewalTermsView = { wage: number; years: number; release: number | null };
export type NegotiationResult =
  | { status: "accepted"; terms: RenewalTermsView }
  | { status: "counter"; terms: RenewalTermsView; round: number; roundsLeft: number; reason?: "distance" }
  | { status: "closed"; reason: "refused" | "level" | "distance"; reopens?: string };
/** Proposta do gamer por um jogador de outro clube (RZ-231): estado da conversa com o clube e depois com o agente. */
export type BidView = {
  person: string;
  name: string;
  stage: "club" | "agent" | "agreed" | "closed" | "done";
  seller?: string;
  /** Id do clube vendedor, para ligação e cores (só clubes nacionais). */
  sellerId?: string;
  position?: string;
  age?: number;
  /** Cláusula de rescisão, só se o gamer a conhece (observação de um mês). */
  release?: number;
  fee?: number;
  /** Última contraproposta do clube. */
  ask?: number;
  feeSuggestions: number[];
  terms?: { ask: RenewalTermsView; wages: number[]; releases: number[]; minWage?: number };
  agent?: string;
  round: number;
  roundsLeft: number;
  closed?: "refused" | "squad" | "level" | "distance" | "cash" | "gone";
  reopens?: string;
  moving?: { club: string; date: string };
  /** Contraproposta do agente e o que o gamer tinha enviado (para assinalar os campos alterados). */
  counter?: { wage: number; years: number; release: number | null; sent: { wage: number; years: number; release: number | null } };
  /** Proposta enviada à espera de resposta (chega em `due`). */
  pending?: { kind: "fee" | "terms"; due: string };
  /** Última resposta recebida. */
  lastReply?: { status: "accepted" | "counter" | "closed" | "blocked"; kind: "fee" | "terms"; date: string; reason?: string };
  /** Acordo fechado à espera de o gamer confirmar a transferência (até `confirmBy`). */
  needsConfirm?: { by: string };
  /** Mercado aberto hoje. */
  windowOpen: boolean;
  /** Verba de transferências do clube do gamer. */
  cash: number;
  /** Ordenado mensal que ainda cabe na massa salarial do clube. */
  wageRoom: number;
  /** Fase seguinte ainda fechada: o agente só atende / a transferência só se confirma a partir desta data. */
  waitUntil?: { who: "agent" | "confirm"; date: string };
  /** Empréstimo em vez de compra (RZ-269): ordenado do jogador, percentagens possíveis, mínimo pedido e fim. Ausente se não é possível (ver `reason`). */
  /** Preenchido quando a proposta acabou em empréstimo: data em que acaba. */
  loanedUntil?: string;
  loan?: { available: true; wage: number; shares: number[]; minShare: number; fee: number; until: string; months: number } | { available: false; reason: string };
};
export type BidAction =
  | { person: string; action: "open" }
  | { person: string; action: "fee"; fee: number }
  | { person: string; action: "terms"; wage: number; years: number; release: number | null }
  | { person: string; action: "confirm" }
  | { person: string; action: "loan"; share: number }
  | { person: string; action: "cancel" };
export type BidReply = { status: "accepted" | "counter" | "closed" | "blocked"; reason?: string; /** Contraproposta do agente. */ terms?: RenewalTermsView };
export type BidResult = { ok: true; bid: BidView; reply?: BidReply; /** Resposta à proposta de empréstimo. */ loanReply?: { status: "accepted" | "counter" | "closed"; share?: number; reason?: string; fee?: number; until?: string }; /** Resultado da confirmação. */ confirmed?: { moved: boolean; date?: string; failed?: string } } | { ok: false; reason: "own" | "invalid" | "retired" | "noClub" | "prospect" | "locked" | "loaned" };
/** Proposta da IA por um jogador do gamer (RZ-232). */
export type OfferView = {
  id: number;
  person: string;
  name: string;
  position: string;
  age: number;
  buyer: { id: string; name: string };
  /** Valor proposto neste momento. */
  fee: number;
  /** Contrato que o comprador oferece ao jogador. */
  wage: number;
  years: number;
  release: number | null;
  currentWage: number;
  /** Estrelas do jogador, se o gamer o conhece. */
  stars?: number;
  /** Valor de mercado (o gamer conhece o seu plantel). */
  value: number;
  expires: string;
  round: number;
  roundsLeft: number;
  /** Valores para contrapropor. */
  suggestions: number[];
  /** Pedido de empréstimo (RZ-269): parte do ordenado que o comprador paga, o que isso poupa por mês e quando acaba. Não há contraproposta. */
  loan?: { share: number; saves: number; until: string };
  /** Jovem formado no clube (RZ-234): o valor já inclui a compensação de formação. */
  youth?: { compensation: number };
};
type OfferAction = { id: number; action: "accept" | "reject" } | { id: number; action: "counter"; fee: number };
export type OfferAnswer = { ok: true; status: "done" | "counter" | "refused" | "withdrawn" | "rejected" | "expired"; offer?: OfferView } | { ok: false };
export type RenewalsData = { season: number; nextSeasonStart: string; lines: RenewalLine[] };

export type ClubOffer = { id: string; name: string; league: string; tier: Tier; levelReputation: LevelReputation; since: string; /** Salário mensal de referência que o clube oferece. */ wage: number; yearsMin: number; yearsMax: number; defaultYears: number };
/** Condições de um contrato do gamer e a resposta do presidente (RZ-161). */
export type ContractTerms = { monthlyWage: number; years: number };
export type ContractReason = "budget" | "results" | "trust" | "greed" | "grudge" | "generic" | "cooldown" | "tenure";
export type ContractReply =
  | { result: "accepted"; terms: ContractTerms }
  | { result: "counter"; terms: ContractTerms; reason: ContractReason }
  | { result: "refused"; reason: ContractReason };
export type GamerContractView = { club: string; clubName: string; monthlyWage: number; start: string; end: string; reference: number; yearsMin: number; yearsMax: number; canAsk: boolean; askFrom?: string };

export type PersonalBankView = { balance: number; monthlyNet: number; living: number; savings: number; city: string; employed: boolean; minDonation: number };
export type PersonalSpendingView = {
  balance: number;
  city: EntityRef;
  club: string;
  home: { owned: boolean; price: number; discountPct: number };
  course: { level: number; max: number; training?: { level: number; until: string }; next?: { level: number; cost: number; days: number } };
  causes: { service: "health" | "education" | "mobility" | "housing" | "safety" | "entertainment"; points: number }[];
  minCause: number;
  maxCausePoints: number;
  minHelp: number;
};
export type SpendOutcome = { ok: true; balance: number } | { ok: false; reason: string };
export type DonationOutcome = { ok: true; balance: number; effect: "negligible" | "small" | "noticeable" | "decisive" } | { ok: false; reason: "amount" | "funds" | "company" | "cooldown" };

/** Uma passagem pela carreira de um jogador (eventos públicos de contratos e transferências). */
export type CareerLine = { id: number; date: string; season: number; kind: "transfer" | "signed" | "renewed" | "released" | "retired" | "loan" | "loanEnd" | "current"; club?: EntityRef; from?: EntityRef; fee?: number };

/**
 * Uma linha da tabela «História» de uma pessoa (uma por profissão e período). A interface escolhe as colunas conforme
 * as profissões presentes: jogador/guarda-redes e pessoal de clube vêm por época e clube; autarca e empresário por ano e localidade.
 */
export type HistoryRow =
  | { profession: "player" | "goalkeeper"; season: number; club: EntityRef; matches: number; goals: number; assists: number; cleanSheets: number; avgRating?: number }
  | { profession: "mayor"; season: number; place: EntityRef; populationChange?: number }
  | { profession: "businessperson"; season: number; place: EntityRef; company: string; employees: number; sponsored: EntityRef[] }
  | { profession: "staff"; fn: string; season: number; club: EntityRef; wins: number; draws: number; losses: number };

/** Uma linha da tabela de scouting (RZ-230): só o que o gamer sabe do jogador. */
export type ScoutRow = {
  id: string;
  name: string;
  age: number;
  position: string;
  nationality: string;
  /** Clube atual; os de ligas estrangeiras não têm página (`foreign`). */
  club?: { id: string; name: string; foreign: boolean };
  contractEnd?: string;
  /** Estrelas estimadas: só existem depois de uma observação. */
  rating?: StarRating;
  /** O que se sabe: nada, uma observação de semana ou mês. */
  knowledge: "none" | "week" | "month";
  /** Apareceu numa pesquisa por posição (e não pelo alcance dos olheiros). */
  found?: boolean;
  /** Já há uma ordem do olheiro em curso sobre ele. */
  busy?: "week" | "month";
  /** Vai mudar-se para outro clube (acordo fechado fora da janela). */
  moving?: { club: string; date: string };
};
/** Talento local de um concelho (RZ-234): jovens sem clube e jovens da terra noutros clubes. */
export type LocalTalentData = { city: string; mine?: string; unsigned: ScoutRow[]; atClubs: ScoutRow[] };
export type ScoutOrderView = { id: number; kind: "week" | "month" | "search"; person?: EntityRef; position?: string; start: string; end: string; cost: number; done: boolean; results?: number };
export type ScoutingData = {
  rows: ScoutRow[];
  orders: ScoutOrderView[];
  scouts: { count: number; quality: number };
  /** Os olheiros do clube, por nome. */
  scoutList: { id: string; name: string }[];
  /** Verba de transferências e margem salarial anual ainda disponíveis. */
  budget: { transfers: number; wageMargin: number };
  cost: { week: number; month: number; search: number; foreignMultiplier: number };
  balance: number;
  /** Quantas ordens ao mesmo tempo (`perScout` por olheiro). */
  capacity: number;
};
export type ScoutOrderInput = { kind: "week" | "month" | "search"; person?: string; position?: string; minAge?: number; maxAge?: number; freeOnly?: boolean };
export type ScoutOrderOutput = { ok: true } | { ok: false; reason: "noScout" | "busy" | "noCash" | "invalid" | "own" };

export type PersonProfileData = {
  /** Clube de uma liga estrangeira (sem página). */
  foreignClub?: { name: string };
  /** Tabela «História» (RZ-229): linhas por profissão, das mais recentes para as mais antigas. */
  history?: HistoryRow[];
  profile: PersonProfile;
  club?: EntityRef;
  birthCity?: EntityRef;
  /** Factos de jogo por época e competição (públicos). */
  stats: PlayerStatLine[];
  /** Ano em que começa a época 1 do save (2026 → «2026/27»). */
  initialYear: number;
  /** Contrato atual: as datas são públicas, o salário não. */
  contract?: { start: string; end: string };
  /** Percurso: transferências, contratações, renovações, saídas e reforma, do mais antigo para o mais recente. */
  career?: CareerLine[];
  /** O contrato acaba esta época e o jogador é do teu clube: pode abrir-se a renovação. */
  renewable?: boolean;
  /** O contrato acaba daqui a menos de um ano. */
  contractEndingSoon?: boolean;
  /** Jogador do clube do gamer: se está à venda. */
  forSale?: boolean;
  /** Estimativa do valor de mercado e, em jogadores de outros clubes, do preço que o clube deverá pedir (RZ-239). */
  marketValue?: { value: number; exact: boolean; asking?: { value: number; reasons: ("important" | "form")[] } };
  /** Empréstimo do gamer (RZ-269): `out` = jogador teu emprestado a `club`; `in` = jogador de `club` emprestado a ti. `canRecall`: janela de janeiro aberta (só `out`). */
  loan?: { direction: "out" | "in"; club: EntityRef; until: string; share: number; canRecall: boolean };
  /** Clubes que o poderiam querer (RZ-256) e propostas conhecidas: do gamer e as recebidas por jogadores do gamer. */
  interest?: { clubs: { club: EntityRef; level: "high" | "medium" | "low"; local: boolean }[]; offers: { buyer: EntityRef; fee: number }[] };
  /** O gamer pode fazer uma proposta por este jogador (RZ-231). */
  biddable?: boolean;
  /** Negociação em curso (aberta) ou acordo à espera da janela: «vai mudar-se para X em Y». */
  bid?: { stage: "club" | "agent" | "agreed"; moving?: { club: string; date: string } };
  /** Quem é do teu clube conhece-se por dentro: personalidade e qualidades (só os campos ocultos do jogo ficam de fora). */
  known?: { personality: PersonTruth["personality"]; quality?: PersonTruth["quality"]; /** Observação de um mês: valores exatos. */ attributes?: PersonTruth["attributes"]; potential?: PersonTruth["potential"]; positions?: PersonTruth["positions"] };
  /** Ordenado mensal: só no teu clube (ou em modo developer). */
  wage?: number;
  /** Agente do jogador (público). */
  agent?: EntityRef;
  /** Profissão fora do futebol (RZ-318): código (`occupation.<código>`); só em jogadores que o futebol não paga para viver. */
  occupation?: string;
  /** Cláusulas do contrato: só no teu clube (ou em modo developer). */
  clauses?: { release?: number };
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
  stadium: { name: string; capacity: number; ownership: "club" | "municipal" | "shared"; sectors: Record<StadiumSector, number>; works?: { sector: StadiumSector; seats: number; cost: number; councilPaid: number; end: string } };
  squad: ViewPerson[];
  roles: ViewPerson[];
  tier: Tier;
  finances: ClubFinances;
  levelReputation: LevelReputation;
  detailStadium: { ownership: string; zone: string; centreDistanceKm: number; transport: number; roadAccess: number; parking: number; expansionTerrain: number };
  /** Patrocinadores vigentes (nome e setor são públicos; o valor só o gamer vê no seu clube). */
  sponsors: { company: string; name: string; sector: string; kind: string; annualValue?: number }[];
  /** Divisão em que o clube esteve, por época (a história de subidas e descidas). */
  divisionsHistory: { season: number; label: string; tier: Tier; league: string; position?: number; of?: number; movement?: "promoted" | "relegated"; /** Antes do arranque do save. */ past?: true }[];
  /** Por jogador do plantel: fim de contrato e nível geral. */
  extraSquad: Record<string, { endContract?: string; level?: EstimatedLevel; rating?: StarRating; injured?: boolean; renewable?: boolean; /** O contrato acaba daqui a menos de um ano. */ endingSoon?: boolean; /** Posto à venda pelo gamer. */ forSale?: boolean; /** Só no clube do gamer (ou em modo developer). */ wage?: number; /** Estimativa do valor de mercado (2 algarismos significativos). */ value?: number }>;
  /** Estatísticas da época atual (jogadores do plantel e tops do clube). */
  season?: ClubSeason;
  /** Por membro da equipa técnica: desde quando está no clube (contrato). */
  truth?: { reputation: number; finances: number; staffQuality: Record<string, Record<string, number>>; squadLevel: number };
  /** Formação (RZ-234): quanto talento da terra o clube aproveita; só no clube do gamer. Nível em palavras, tendência e a causa principal. */
  youth?: { level: ViewCityLevel; trend: "up2" | "up1" | "stable" | "down1" | "down2"; cause?: "patience" | "coach" | "finances" | "education" | "council" };
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
  /** A sede do concelho (a localidade que é a «cidade» do concelho; RZ-238). */
  seat: EntityRef;
  district: string;
  clubs: (EntityRef & { league: string })[];
  /** Mudanças de estatuto, da mais recente para a mais antiga. */
  history: { date: string; from: LocalityStatus; to: LocalityStatus; population: number }[];
};

/** Ficha de uma cidade (concelho; RZ-133): só o que qualquer pessoa pode saber. Os números verdadeiros ficam no motor; aqui vão níveis em palavras e tendências. */
export type ViewCityLevel = 1 | 2 | 3 | 4 | 5;
type CouncilTrend = "up2" | "up1" | "stable" | "down1" | "down2";
export type CouncilAreaId = "sport" | "health" | "education" | "mobility" | "housing" | "safety" | "leisure";
/** Página do estádio do clube do gamer (RZ-116): planta por setores, relvado e obra em curso. */
export type StadiumPageData = {
  club: { id: string; name: string };
  /** É o clube do gamer: só então se pedem obras e se mexe em preços e relvado. */
  own: boolean;
  city: { id: string; name: string };
  /** Nome original do estádio: nunca muda. */
  name: string;
  /** Empresa que dá o nome ao estádio (patrocínio de maior valor); o nome mostrado junta-a ao original. */
  sponsor?: { id: string; name: string };
  ownership: "club" | "municipal" | "shared";
  tier: string;
  capacity: number;
  built: number;
  /** 0-100: quanto terreno há para expandir. */
  terrain: number;
  /** Preço do bilhete do escalão (€), antes do múltiplo de cada setor. */
  basePrice: number;
  sectors: { id: StadiumSector; seats: number; open: number; rings: number; /** Máximo de lugares que o setor pode ter. */ max: number; covered: boolean; price: number; fill?: number; coverCost: number; /** Empresa que dá o nome à bancada (patrocínio do estádio). */ sponsor?: { id: string; name: string } }[];
  works?: { kind: "expand" | "cover"; sector: StadiumSector; seats: number; cost: number; end: string };
  turf: { value: number; type: "natural" | "synthetic"; treatCost: number; replaceCost: number; syntheticCost: number };
  limits: { priceMin: number; priceMax: number; minSeats: number };
};
export type CouncilKindId = "youth" | "matchday" | "subsidy";
export type CouncilHistoryKind = CouncilKindId | "stadium";
export type CouncilReplyView = { approved: boolean; reason: "priority" | "relation" | "visibility" | "generic" | "noBudget" | "notPriority" | "poorRelation" | "expensive"; tone: "vain" | "ambitious" | "humble" | "plain"; amount: number };
/** A campanha autárquica no concelho do gamer (RZ-236B): quem concorre, o que valoriza cada um e o peso do apoio do gamer. */
export type CampaignView = {
  city: EntityRef;
  /** Dia das eleições. */
  date: string;
  /** Quanto pesa o apoio do gamer (1 = quase nada … 5 = muito). */
  weight: ViewCityLevel;
  candidates: {
    person: EntityRef;
    kind: "incumbent" | "exMayor" | "retired" | "new";
    /** O autarca em funções (mesmo que o cargo possa mudar). */
    current: boolean;
    most: CouncilAreaId[];
    least: CouncilAreaId[];
    promises: CouncilAreaId[];
    /** Só quando já houve relação com esta pessoa. */
    relation?: { level: ViewCityLevel; trend: CouncilTrend };
    /** Promessas cumpridas no mandato (só para quem está no cargo). */
    kept?: { kept: number; total: number };
  }[];
  /** A decisão tomada: id do candidato ou `neutral`; falta enquanto o gamer não decide. */
  choice?: string;
};
export type ViewCouncil = {
  areas: { id: CouncilAreaId; priority: ViewCityLevel; trend: CouncilTrend; cause?: "need" | "newMayor" }[];
  /** Relação do gamer com o autarca. */
  relation?: { level: ViewCityLevel; trend: CouncilTrend; cause?: "approved" | "refused" | "pride" | "backed" | "backedRival" | "neutralLost" | "promiseKept" | "promiseBroken" | "cause" };
  /** Só na cidade do clube do gamer: o que se pode pedir e os pedidos feitos (do mais recente). */
  own?: {
    kinds: { kind: CouncilKindId; area: CouncilAreaId; status: "available" | "open" | "cooldown"; until?: string; cost: number; cofunds: number[] }[];
    requests: { id: number; kind: CouncilHistoryKind; created: string; due: string; status: "pending" | "approved" | "refused"; cofund: number; reply?: CouncilReplyView }[];
  };
};
/** Empresas do concelho (RZ-235): só o que é público (setor, escala, dono, patrocínios) e o tamanho em palavras. */
/** Proposta de mecenato (RZ-235): uma empresa do concelho oferece dinheiro, às vezes em troca do naming do estádio. */
export type PatronView = { id: number; company: EntityRef; owner?: EntityRef; amount: number; counterpart: "none" | "naming"; years: number; expires: string };
export type CityCompaniesView = {
  /** Dependência do maior empregador: baixa, média ou alta. */
  dependence: "low" | "medium" | "high";
  list: {
    id: string; name: string; sector: string; scale: "local" | "regional" | "national" | "international"; size: ViewCityLevel; owner?: EntityRef; sponsors: EntityRef[];
    /** Cores da empresa (texto, como as dos clubes). */
    colours: string;
    /** Anos no setor (a empresa tem a idade que as pessoas lhe conhecem). */
    years: number;
    /** Empregados estimados (todos os sítios), arredondados: o número exato não é público. */
    employees: number;
  }[];
};
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
    trend: "up2" | "up1" | "stable" | "down1" | "down2";
    history: { season: number; label: string; level: ViewCityLevel }[];
  }[];
  /** Serviços do concelho (RZ-233): nível em palavras, seta de tendência (forte ou fraca) e, se um acontecimento recente os mexeu, a causa. */
  services: {
    id: "health" | "education" | "mobility" | "housing" | "safety" | "entertainment";
    level: ViewCityLevel;
    trend: "up2" | "up1" | "stable" | "down1" | "down2";
    history: { season: number; label: string; level: ViewCityLevel }[];
    cause?: { type: string; label: string };
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
  /** Orçamento da Câmara por áreas e pedidos do gamer (RZ-236): prioridades em palavras com seta; euros nunca. */
  council?: ViewCouncil;
  /** Empresas do concelho (RZ-235); falta enquanto o mundo não as tem. */
  companies?: CityCompaniesView;
  localities: { ref: EntityRef; status: LocalityStatus; population: number }[];
  /** A sede do concelho: `type=city` redireciona para a ficha desta localidade (RZ-238). */
  seat: EntityRef;
  clubs: { ref: EntityRef; league: string; tier: string; stadium: { name: string; capacity: number; ownership: "club" | "municipal" | "shared" } }[];
  /** Acontecimentos que marcaram a cidade, do mais recente para o mais antigo. */
  incidents: { date: string; season: number; label: string; type: string; regional: boolean; hub?: string }[];
};

export type { EuropeView };
export type { SearchResult, SummaryCompetition, LabMatch, LabLeague, CompetitionPage, CupView, ClubCompetition, CompetitionHistory, RecentMatch };

/** O plano de jogo do clube do gamer, pronto para a página Tática. */
export type ViewPlan = {
  /** Nome e cores do clube do gamer. */
  clubName: string;
  clubColours: string;
  tactic: Tactic;
  formations: FormationId[];
  formationPositions: Record<FormationId, Position[]>;
  /** Os 11 lugares da formação, pela ordem dela; `jogador` falta enquanto o gamer não o escolhe (nunca se preenche sozinho). `performance` (0-1): quanto rende na posição (1 = natural). */
  lineup: { position: Position; player?: string; name?: string; aptitude?: number; performance?: number; outOfPosition: boolean }[];
  /** Os suplentes convocados (ids), por ordem. */
  bench: string[];
  /** Pode confirmar-se o jogo? Falta onze, ou há escolhidos indisponíveis. */
  ready: { ok: boolean; reason?: "incomplete" | "unavailable"; names?: string[] };
  /** `forma` (0,85-1): energia; `avgLast5`: nota média dos últimos jogos com nota; `stars`: nível que o gamer conhece. */
  squad: { player: string; name: string; age: number; form: number; positions: { pos: Position; aptitude: number }[]; /** Quanto rende (0-1) em cada posição; serve para realçar onde joga melhor. */ fit: Record<Position, number>; stars?: number; matches: number; goals: number; avgLast5?: number; unavailable?: "injury" | "suspended"; matchesPerMeet?: number }[];
  nextMatch?: { id: string; date: string; competition: string; /** Taças: a ronda («Meias-finais · 1.ª mão»); nas ligas fica vazio. */ cupRound?: RoundTag; opponent: string; atHome: boolean; confirmed: boolean; /** O jogo já começou e está a decorrer. */ ongoing: boolean; opponentId: string; opponentColours: string };
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
  /** Os clubes jogáveis com o que interessa para escolher (RZ-138); não precisa de mundo. */
  clubCatalog: { input: null; output: CatalogClub[] };
  /** Saves (RZ-134): lista, guardar agora, carregar (a interface recarrega a seguir), apagar, exportar e importar ficheiros `.raizes`. */
  saves: { input: null; output: SaveMeta[] };
  saveGame: { input: { name?: string }; output: SaveMeta };
  loadSave: { input: { id: string }; output: { ok: true } };
  deleteSave: { input: { id: string }; output: null };
  /** Sem `id`, exporta o mundo atual como está. */
  exportSave: { input: { id?: string }; output: { filename: string; bytes: Uint8Array } };
  importSave: { input: { bytes: Uint8Array }; output: { ok: true } };
  /** Pesquisa de jogadores com o alcance dos olheiros (RZ-230). */
  scouting: { input: null; output: ScoutingData };
  localTalent: { input: { city: string }; output: LocalTalentData | null };
  /** Pede ao olheiro uma observação (semana/mês) ou uma pesquisa por posição. */
  scoutOrder: { input: ScoutOrderInput; output: ScoutOrderOutput };
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
  /** Taça: rondas com resultados (RZ-244). */
  cupView: { input: { competition: string; season?: number }; output: CupView | null };
  /** Cores de todos os clubes, estrangeiros incluídos (para as amostras). */
  clubColours: { input: null; output: { id: string; colours: string }[] };
  /** Competição europeia: tabela da fase de liga e eliminatórias (RZ-246). */
  europeView: { input: { competition: string; season?: number }; output: EuropeView | null };
  /** Competições europeias da época atual. */
  europeCups: { input: null; output: EuropeView[] };
  /** Taças nacionais da época atual. */
  nationalCups: { input: null; output: CupView[] };
  /** Taças e supertaças dos distritos (RZ-262). */
  districtCups: { input: null; output: CupView[] };
  /** Histórico de uma liga ou taça. */
  competitionHistory: { input: { competition: string }; output: CompetitionHistory };
  /** Últimos jogos do clube em todas as competições (página inicial). */
  recentMatches: { input: { club: string; limit?: number; season?: number }; output: RecentMatch[] };
  /** Onde o clube compete e em que fase/posição. */
  clubCompetitions: { input: { club: string; season?: number }; output: ClubCompetition[] };
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
  /** Estado das mensagens que pedem decisão (pendente, respondida, expirada), por id da mensagem (RZ-164). */
  inboxDecisions: { input: null; output: Record<number, Decision> };
  inbox: { input: { limit?: number; beforeOf?: number }; output: { messages: InboxMessage[]; unread: number } };
  markInboxRead: { input: null; output: null };
  /** Título do clube do gamer por celebrar (liga decidida matematicamente, taça ou supertaça ganhas), se houver. */
  celebration: { input: null; output: { competition: string; season: number; cup: boolean; clinched: boolean } | null };
  dismissCelebration: { input: null; output: null };
  /** O que pede resposta antes de o tempo passar (RZ-257): a mensagem por ler mais antiga, propostas recebidas e negociações abertas. */
  attention: { input: null; output: { unread?: number; offer?: { person: string }; bid?: { person: string }; campaign?: { city: string }; patron?: { id: number } } };
  /** Começa o jogo do gamer (RZ-170): nada fica no histórico até ao apito final. */
  startMatch: { input: { match: string; /** A interface exige onze completo e disponível. */ strict?: boolean }; output: LiveMatch };
  /** Avança `minutos` minutos do jogo a decorrer; no fim regista-o. */
  matchStep: { input: { minutes: number }; output: LiveMatch };
  /** Muda a tática do gamer durante o jogo, a partir do minuto seguinte. */
  setBudget: { input: { wageBillMax: number; transfers: number }; output: ClubFinances };
  tacticInMatch: { input: { tactic: Tactic }; output: LiveMatch };
  /** Substituições do gamer (todas as de uma paragem): sai quem está em campo, entra quem está no banco. */
  substitutionsInMatch: { input: { substitutions: { playerOut: string; playerIn: string }[]; /** Quem em campo passa a jogar onde (RZ-255); não gasta substituições nem pausas. */ positions?: { player: string; position: Position }[] }; output: LiveMatch };
  /** Marca uma mensagem como lida ou por ler. */
  markMessage: { input: { id: number; isRead: boolean }; output: null };
  resign: { input: null; output: { club: string } };
  /** Mercado de staff (RZ-208): profissionais livres de uma função, com a qualidade estimada. */
  staffMarket: { input: { fn: string }; output: StaffCandidate[] };
  stadiumPage: { input: { club?: string }; output: StadiumPageData | null };
  setStadiumPrice: { input: { sector: StadiumSector; price: number }; output: { price: number } };
  treatTurf: { input: { kind: "treat" | "replace" | "synthetic" }; output: TurfResult };
  stadiumQuote: { input: { sector: StadiumSector; seats: number; kind?: "expand" | "cover" }; output: { cost: number; clubCost: number; councilShare: number; months: number; maxSeats: number } | null };
  startStadiumWorks: { input: { sector: StadiumSector; seats: number; kind?: "expand" | "cover"; askCouncil?: boolean }; output: WorksResult };
  ownStaff: { input: Record<string, never>; output: OwnStaff[] };
  hireStaff: { input: { person: string }; output: StaffResult };
  dismissStaff: { input: { person: string }; output: StaffResult };
  /** Ofertas de clubes quando o gamer está sem clube. */
  offers: { input: null; output: { unemployed: boolean; previous?: string; offers: ClubOffer[] } };
  acceptOffer: { input: { id: string }; output: { id: string } };
  /** Contrato atual do gamer (null em saves sem contrato). */
  gamerContract: { input: null; output: GamerContractView | null };
  /** Conta pessoal do gamer (RZ-162): saldo, ordenado líquido, custo de vida da cidade e quanto sobra por mês. */
  personalBank: { input: null; output: PersonalBankView | null };
  /** O que o gamer pode fazer com o dinheiro da conta (RZ-162): casa, cursos, causas da cidade e ajuda ao clube. */
  personalSpending: { input: null; output: PersonalSpendingView | null };
  buyHome: { input: null; output: SpendOutcome };
  startCourse: { input: null; output: SpendOutcome };
  supportCause: { input: { service: string; amount: number }; output: SpendOutcome };
  helpClub: { input: { amount: number }; output: SpendOutcome };
  /** Doação pessoal a uma empresa (sai da conta do gamer, nunca do clube). */
  donate: { input: { company: string; amount: number }; output: DonationOutcome };
  /** Propor salário e duração a um clube que fez oferta; se o presidente aceita, o gamer fica contratado. */
  negotiateOffer: { input: { id: string; terms: ContractTerms }; output: ContractReply };
  /** Pedir um aumento no clube atual. */
  askRaise: { input: { terms: ContractTerms }; output: ContractReply };
  /** Contratos a expirar no clube do gamer, com o pedido de cada jogador (RZ-165). Quem não tiver decisão renova pela fórmula do escalão. */
  renewals: { input: null; output: RenewalsData };
  bid: { input: BidAction; output: BidResult };
  /** Põe um jogador do clube do gamer à venda (ou tira-o). */
  setForSale: { input: { person: string; forSale: boolean }; output: null };
  /** Chama de volta um jogador do gamer emprestado (só na janela de janeiro). */
  recallLoan: { input: { person: string }; output: { ok: boolean } };
  /** Pedido ao autarca (RZ-236): tipo e índice do cofinanciamento (0 = nada). */
  patrons: { input: null; output: PatronView[] };
  patronReply: { input: { id: number; accept: boolean }; output: { ok: boolean } };
  campaign: { input: null; output: CampaignView | null };
  campaignSupport: { input: { candidate: string }; output: { ok: boolean } };
  councilRequest: { input: { kind: CouncilKindId; cofund: number }; output: { ok: true } | { ok: false; reason: "noMayor" | "open" | "cooldown" | "cash" | "invalid" | "noClub" } };
  bids: { input: null; output: BidView[] };
  transferOffers: { input: null; output: OfferView[] };
  offerReply: { input: OfferAction; output: OfferAnswer };
  /** Uma ronda com o agente: aceita (guarda a decisão), contrapropõe novas condições ou fecha a negociação. */
  negotiateRenewal: { input: { person: string; wage: number; years: number; release: number | null }; output: NegotiationResult };
  /** O gamer decide deixar sair um jogador com contrato a expirar. */
  releaseExpiring: { input: { person: string }; output: null };
  /** Começar sem clube (RZ-501): região onde o gamer vive; recebe as primeiras ofertas dessa zona. */
  startUnemployed: { input: { region: string }; output: { home: string } };
  chooseClub: { input: { id: string; force?: boolean }; output: { id: string } };
  /** O plano de jogo (tática e onze) do clube do gamer. */
  plan: { input: null; output: ViewPlan | null };
  /** Guarda tática, onze (pode estar incompleto) e banco. Pode fazer-se a qualquer momento. */
  savePlan: { input: { tactic: Tactic; lineup?: Plan["lineup"]; bench?: string[] }; output: ViewPlan };
  /** Confirma onze e tática para o próximo jogo do clube: o avanço deixa de parar antes dele. */
  confirmMatch: { input: { match: string; /** A interface exige onze completo e disponível. */ strict?: boolean }; output: { match: string } };
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
