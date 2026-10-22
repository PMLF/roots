/**
 * Parâmetros centrais do jogo (RZ-006). Única fonte de números de regras.
 * Valores iniciais de docs/DESIGN_RULES.md, HISTORICO_EVENTOS §5.1, GERACAO_MUNDO §4,
 * PERSONALIDADE §4 e CIDADE. Tudo isto é para calibrar no harness (RZ-123).
 */

export type Criterion = "points" | "headToHead" | "difference" | "scoredGoals" | "wins" | "smallerReputation" | "lottery";
export type LevelReputation = "worldClass" | "continental" | "national" | "regional" | "local" | "obscure";
const LEVELS_REPUTATION: readonly LevelReputation[] = ["worldClass", "continental", "national", "regional", "local", "obscure"];
const CRITERIA: readonly Criterion[] = ["points", "headToHead", "difference", "scoredGoals", "wins", "smallerReputation", "lottery"];

export type Tier = "firstLeague" | "secondLeague" | "thirdLeague" | "cp" | "district";


/** Acontecimentos que mexem com uma cidade (ou com todas as de um polo) ao fim de cada época. */
export type CityEventType =
  | "factory_closes" | "factory_opens" | "european_funds" | "motorway" | "festival"
  | "bad_farming_year" | "regional_crisis" | "fire" | "university" | "new_hotel"
  | "new_hospital" | "hospital_cuts" | "crime_wave" | "new_school" | "transport_works" | "new_venue" | "rent_surge" | "affordable_housing";
export const CITY_EVENT_TYPES: readonly CityEventType[] = [
  "factory_closes", "factory_opens", "european_funds", "motorway", "festival",
  "bad_farming_year", "regional_crisis", "fire", "university", "new_hotel",
  "new_hospital", "hospital_cuts", "crime_wave", "new_school", "transport_works", "new_venue", "rent_surge", "affordable_housing",
];
/** Serviços da cidade (RZ-233), todos 0-100 com «mais alto = melhor» (a habitação é a acessibilidade: alto = barata). */
export const CITY_SERVICES = ["health", "education", "mobility", "housing", "safety", "entertainment"] as const;
export type CityService = (typeof CITY_SERVICES)[number];
/** Áreas do orçamento da Câmara (RZ-236): o desporto e as seis dos serviços (o lazer financia o entretenimento). */
export const COUNCIL_AREAS = ["sport", "health", "education", "mobility", "housing", "safety", "leisure"] as const;
export type CouncilArea = (typeof COUNCIL_AREAS)[number];
export const COUNCIL_REQUESTS = ["youth", "matchday", "subsidy"] as const;
export type CouncilRequestKind = (typeof COUNCIL_REQUESTS)[number];
type Traits4 = { ambition: number; vanity: number; patience: number; integrity: number };
export type CityEffects = { employment?: number; economy?: number; tourism?: number; pride?: number; notoriety?: number; populationPct?: number } & Partial<Record<CityService, number>>;
export type CfgCityEvent = {
  /** Atinge todos os concelhos do polo (e não só um). */
  regional: boolean;
  /** Peso por setor (principal a 100 %, secundário a 50 %); `*` é o peso por omissão. */
  weight: Record<string, number>;
  effects: CityEffects;
};
/**
 * Orçamento e pedidos à Câmara (RZ-236, docs/CITY.md §12.6). Prioridade de cada área = peso do autarca (1 + traços × `loadings` + apoio ao desporto +
 * necessidade (serviço pior pesa mais) + ruído da pessoa) normalizado; `levelCuts` separam os cinco níveis (quociente face à fatia neutra 1/7).
 * `serviceByShare`: pontos de alvo de um serviço por cada 100 % acima (ou abaixo) da fatia neutra. `discretionary`: fração do orçamento de cada área
 * que o autarca gere a seu gosto (de onde saem os pedidos). `requests`: custo (fração do orçamento municipal), área e efeito de cada tipo; o subsídio
 * paga `subsidyRate` × orçamento × fator do escalão. Decisão: z = bias + ... (sigmoide); `cooldownDays` depois de uma recusa; `cofunds` frações pagas pelo clube.
 */
type CouncilParameters = {
  loadings: Record<CouncilArea, Traits4>;
  sportSupport: number; moodWeight: number; jitter: number; levelCuts: [number, number, number, number];
  serviceByShare: number; discretionary: number; /** Variação mínima da fatia (em quocientes) para a seta fraca e para a forte. */ shareTrend: [number, number];
  relation: { start: number; approved: number; refused: number; prideDrift: number; trend: number; strongTrend: number };
  requests: {
    areas: Record<CouncilRequestKind, CouncilArea>;
    cost: Record<CouncilRequestKind, number>;
    subsidyRate: number; subsidyTier: Record<Tier, number>;
    youthBonus: number; matchdayBoost: number;
    replyDays: [number, number]; cooldownDays: number; cofunds: number[];
    decision: { bias: number; relation: number; priority: number; sport: number; vanity: number; cost: number; cofund: number };
  };
  /** Eleições autárquicas (RZ-236B): campanha, candidatos, voto e consequências do apoio do gamer. */
  election: {
    month: number; day: number; campaignDays: number;
    /** [população mínima, nº de candidatos]: o último escalão cujo mínimo se atinge. */
    candidatesBySize: [number, number][];
    pIncumbentRuns: number; pExMayorRuns: number; pRetiredPlayer: number; retiredMinAge: number;
    /** Peso no voto: bónus de quem está no cargo, humor da cidade, promessas cumpridas/falhadas, simpatia de ex-autarca e de ex-futebolista, ruído. */
    vote: { incumbent: number; mood: number; promises: number; exMayor: number; retired: number; noise: number };
    /** Peso do apoio do gamer: orgulho, notoriedade, resultados e segurança no cargo (somam 1); `maxShift` é o máximo que o apoio soma ao voto. */
    gamer: { pride: number; notoriety: number; results: number; security: number; maxShift: number };
    relation: { backed: number; backedRival: number; neutralLost: number; promiseKept: number; promiseBroken: number };
  };
};
type CityParameters = {
  council: CouncilParameters;
  yearsMunicipalElections: number;
  /** Ano das últimas autárquicas antes do arranque: o mandato em curso conta a partir daqui. */
  sinceTerm: number;
  /** Cortes (0-100) entre os cinco níveis em palavras: muito baixo … muito alto. */
  levels: [number, number, number, number];
  /** Variação mínima (pontos) entre épocas para dizer que sobe ou desce. */
  trendThreshold: number;
  /** Desvio de cada setor ao valor médio (50); o setor principal conta a 100 %, o secundário a 50 %. */
  sectors: Record<string, CityEffects>;
  initial: {
    base: number; noise: number;
    /** Pontos de economia/emprego por cada dez vezes mais população (acima de 15 000 habitantes). */
    byEconomyDecade: number; byEmploymentDecade: number;
    pride: { base: number; byReputation: number; noise: number };
    notoriety: { base: number; byReputation: number; byDecade: number; noise: number };
    /** Reputação máxima da escala dos clubes (para normalizar). */
    reputationMax: number;
  };
  /**
   * Serviços da cidade (RZ-233). `initial`: valor-base, desvio por cada dez vezes mais população (acima de 15 000), pontos a mais ou a
   * menos pelo orçamento municipal por habitante (de −1 a +1 entre as cidades) e a ligação ao turismo; os setores (`sectors`) somam o seu desvio.
   * `links`: pontos do alvo por cada ponto de economia, emprego e turismo acima de 50. `regression`/`noise`: evolução anual. `strongTrend`: variação
   * (pontos) a partir da qual a seta é forte. `population`: pontos de crescimento por cada ponto médio de serviços acima de 50 e de emprego.
   */
  services: {
    initial: { base: Record<CityService, number>; byDecade: Record<CityService, number>; byBudget: number; noise: number };
    links: Record<CityService, { economy: number; employment: number; tourism: number }>;
    regression: number; noise: number; strongTrend: number;
    population: { byServices: number; byEmployment: number };
    /** Efeitos no jogo: lesões (`health`), vida noturna (`nightlife`), assistência (`attendance`), ordenados (`wages`) e talento local (`prospects`). */
    effects: {
      health: { recoveryPerPoint: number };
      nightlife: { formLoss: number; recoveryExtra: number };
      attendance: { mobility: number; tourismWarm: number; warmMonths: number[] };
      wages: { housing: number };
      prospects: { education: number; population: number };
    };
  };
  evolution: {
    /** Fração do desvio ao alvo que se corrige em cada época. */
    regression: number; noise: number;
    pride: { champion: number; promotion: number; relegation: number };
    notoriety: { regression: number; byPride: number };
    culture: { byPride: number; champion: number; promotion: number };
    population: { byEconomy: number; byPride: number; noisePct: number; maxPct: number };
  };
  events: {
    /** Probabilidade anual de acontecer um acontecimento local numa cidade / regional num polo. */
    cityProb: number; hubProb: number;
    types: Record<CityEventType, CfgCityEvent>;
  };
};

/** Valores por escalão do livro de finanças do clube (RZ-114) e da assistência simples (RZ-115). */
type FinancesModel = {
  /** Reputação de referência de cada escalão: acima dela o clube vale mais (patrocínio, comercial, ocupação). */
  refReputation: Record<Tier, number>;
  /** Expoente da razão reputação / referência nas receitas. */
  exponentReputation: number;
  /** Limites da razão reputação / referência. */
  ratioReputation: { min: number; max: number };
  /** Preço médio do bilhete. */
  ticketPrice: Record<Tier, number>;
  /** Ocupação média do estádio num jogo normal (0-1), antes dos multiplicadores. */
  occupancy: Record<Tier, number>;
  /** Quanto a cultura de futebol da cidade (0-100) move a ocupação: ocupação × (1 − k + 2k × cultura/100). */
  cultureOccupancy: number;
  /** Patrocínios por ano. */
  annualSponsorship: Record<Tier, number>;
  /** Receitas comerciais e de sócios por ano (provisório até às transmissões, RZ-218, e às empresas, RZ-219). */
  annualCommercial: Record<Tier, number>;
  /** Custos do staff, da administração e da operação por mês. */
  monthlyStaff: Record<Tier, number>;
  monthlyFixed: Record<Tier, number>;
  /** Custo de manter cada lugar do estádio por ano. */
  stadiumPerPlaceYear: Record<Tier, number>;
};

export type Params = {
  version: 1;
  prizes: {
    /** Prémio do Estado ao melhor classificado de cada distrito (uso livre). */
    club: number;
    /** Prémio ao concelho (Câmara) do clube premiado. */
    city: number;
    /** Prémio ao vencedor de cada competição (RZ-216), em euros. As distritais e a Fase de Promoção são valores médios, escalados pelo distrito. */
    competitions: {
      firstLeague: number; secondLeague: number; thirdLeague: number;
      cpSeries: number; cpWinner: number;
      district: number; promotionPhase: number;
      portugalCup: number; superCup: number; districtCup: number; districtSuperCup: number;
    };
    /** Fração do prémio do vencedor que recebe o finalista vencido (taças). */
    beatenFinalist: number;
    /** Prémio de passar cada ronda da Taça de Portugal (RZ-216/RZ-140): `meias` nas meias-finais, o fator por ronda para trás, com mínimo. */
    portugalCupPerRound: { semi: number; factor: number; min: number };
    /** Limites do fator de riqueza de um distrito (autarcas e orçamento municipal) sobre os prémios distritais. */
    districtFactor: { min: number; max: number };
  };
  pyramid: {
    firstLeague: { clubs: number; drop: number };
    secondLeague: { clubs: number; rise: number; drop: number };
    thirdLeague: { clubs: number; rise: number; drop: number };
    cp: { series: number; clubsPerSeries: number; risePerSeries: number };
    promotion: { groups: number; championsPerGroup: number; promotedPerGroup: number; legs: 1 | 2 };
    districts: number;
  };
  districtLeagues: { target: number; min: number; max: number; hardMin: number };
  /** Pontos por resultado nas classificações de liga. */
  standings: { winPoints: number; drawPoints: number };
  /**
   * Critérios de desempate por ordem (RZ-110; docs/DESIGN_RULES.md §1): `pontos`, `confrontoDireto` (pontos, diferença e golos
   * entre os empatados), `diferenca`, `golosMarcados`, `vitorias`, `reputacaoMenor` (favorece o underdog) e `sorteio`
   * (estável por seed, competição e época). Os dois últimos desempatam sempre.
   */
  tiebreak: { league: Criterion[]; promotion: Criterion[] };
  /**
   * Reputação dos clubes (0-10 000) em palavras, da mais alta para a mais baixa: um clube é do primeiro nível cujo `min`
   * não ultrapassa a sua reputação. O último tem `min` 0. A interface mostra a palavra, nunca o número.
   */
  reputation: { levels: { level: LevelReputation; min: number }[] };
  /** Página de uma competição: quantos jogadores nas listas de destaques e quantos jogos com nota para entrar na lista de melhores. */
  competitionView: { topN: number; minRatedGames: number };
  calendar: {
    seasonStartMonth: number;
    seasonEndMonth: number;
    windows: { opens: { month: number; day: number }; closes: { month: number; day: number } }[];
    daysPerAdvance: number;
    /** Ano em que começa a época 1 (2026 → 2026/27). É só o valor por omissão: cada save guarda o seu (`ano.inicial`), calculado a partir da data real em que foi criado. As épocas mudam a 1 de julho (`mesInicioEpoca`). */
    initialYear: number;
    /** Dia a partir do qual se procura o primeiro sábado de jornada. */
    firstRound: { month: number; day: number };
    /** Último dia em que pode haver jornadas das ligas (a Fase de Promoção joga-se depois). */
    lastRoundUntil: { month: number; day: number };
    /** Escalões que acabam mais cedo que `ultimaJornadaAte` (as distritais, para dar tempo à Fase de Promoção até maio). */
    lastRoundPerTier: Partial<Record<Tier, { month: number; day: number }>>;
    /** Fins de semana sem jogos (inclusivo). `de` em agosto-dezembro é do ano em que a época começa; em janeiro-julho, do seguinte. */
    pauses: { reason: string; from: { month: number; day: number }; until: { month: number; day: number } }[];
    /** Dias da semana de jogo por escalão (0 = domingo … 6 = sábado); os jogos de uma jornada repartem-se por eles. */
    matchDays: Record<Tier, number[]>;
    /** As últimas N jornadas jogam-se todas no mesmo dia. */
    simultaneousFinalRounds: number;
    /** Fase final do CP (meias-finais e final entre os campeões das séries; domingos): dias depois da última jornada das séries e entre rondas. Tem de acabar em maio. */
    cpFinalPhase: { seriesAfterDays: number; roundsBetweenDays: number };
  };
  /**
   * Taças (RZ-140/141/142), como na vida real: as rondas jogam-se em fins de semana de taça (domingo), em que as ligas
   * respetivas param; as finais, em estádios neutros depois de tudo; as supertaças, antes de começarem as ligas.
   */
  /**
   * Competições europeias (RZ-902, formato de 2024/25): Liga dos Campeões, Liga Europa e Liga Conferência, cada uma com 36 clubes,
   * fase de liga «suíça» (8 jogos; 6 na Conferência), os 8 primeiros diretos aos oitavos, 9.º-24.º num play-off a duas mãos,
   * oitavos, quartos e meias a duas mãos e final a uma só, em campo neutro. Só a 2.ª mão (ou a final) tem prolongamento e penáltis.
   */
  europe: {
    /** Clubes por competição. */
    size: number;
    /**
     * Acesso de Portugal (RZ-252): as vagas da Primeira Liga dependem do lugar de Portugal no ranking de associações (pontos por clube
     * nas últimas `seasonsCounted` épocas; antes de haver história, um valor de partida pela qualidade média dos clubes do país).
     * `bands`: a primeira faixa com `maxRank` ≥ lugar de Portugal. Além destas, o vencedor da Taça entra na Liga Europa.
     */
    access: {
      seasonsCounted: number;
      /** Qualidade média (escala dos clubes estrangeiros) com que Portugal começa; `pointsPerQuality` converte-a em pontos por época. */
      portugalQuality: number; pointsPerQuality: number;
      bands: { maxRank: number; championsLeague: number; championsQualifying: number; europaLeague: number; conferenceLeague: number }[];
      /** Pré-eliminatória da Liga dos Campeões: probabilidade do mais forte = 1/(1+exp(−sensibilidade × diferença de força do plantel)). */
      qualifierSensitivity: number;
    };
    /** Datas: a 1.ª jornada é o primeiro dia da semana de cada competição a partir de `anchor`; as seguintes, em semanas desde essa. */
    calendar: { anchor: { month: number; day: number }; leaguePhaseWeeks: number[]; knockoutWeeks: number[] };
    competitions: Record<"championsLeague" | "europaLeague" | "conferenceLeague", {
      pots: number; perPot: number;
      /** 0 = domingo … 6 = sábado. */ weekday: number;
      finalWeek: number; finalWeekday: number;
      /** Prémios em euros: participação, por vitória e por empate na fase de liga, bónus dos 8 primeiros, por eliminatória ultrapassada (play-off, oitavos, quartos, meias), finalista e vencedor. */
      prizes: { participation: number; win: number; draw: number; topEight: number; rounds: [number, number, number, number]; finalist: number; winner: number };
    }>;
    /** Quanto a força do plantel (qualidade média do onze) vale ao ordenar clubes para os potes. */
    ratingNoise: number;
  };
  cups: {
    cup: {
      /** Vaga em que entra cada escalão (0 = logo na primeira ronda; as seguintes entram mais tarde). As distritais só entram com o vencedor da taça e o campeão do distrito. */
      wave: Record<Tier, number>;
      /** Primeira ronda não antes deste dia. */
      firstRound: { month: number; day: number };
      /** As rondas (menos a final) jogam-se até este dia. */
      lastRound: { month: number; day: number };
      /** A final joga-se no primeiro domingo que está pelo menos estes dias depois do último jogo interno das restantes competições. */
      finalDaysAfterLeagues: number;
      /** Vagas nominais por distrito quando ainda não há história: os clubes de maior reputação do distrito. */
      qualifiersPerDistrictWithoutHistory: number;
    };
    /** A Supertaça joga-se este número de dias antes da primeira jornada das ligas; a distrital, uma semana antes dessa. */
    supercupDaysBeforeFirstRound: number;
    districtCup: {
      /** Primeira ronda não antes deste dia. */
      firstRound: { month: number; day: number };
      /** A final joga-se no primeiro domingo este número de dias depois do fim das distritais (antes da Fase de Promoção). */
      finalDaysAfterDistrictsEnd: number;
    };
    /** Estádio neutro das finais nacionais (Taça, Supertaça e final do CP). */
    nationalStadium: { name: string; locality: string; capacity: number };
    /** Descanso mínimo entre dois jogos do mesmo clube, em dias entre datas (3 = dois dias de intervalo). */
    minRestDays: number;
  };
  saves: { daysAutosave: number; rotatingAutosaves: number; saveAtSeasonStart: boolean };
  fairPlay: { levels: number; fallback: number };
  /** Jogos a eliminar: se acabam empatados, decide-se nos penáltis (série inicial de `iniciais` cobranças por equipa, depois morte súbita). */
  knockoutRounds: { penalties: { initial: number; goalProb: number; /** Probabilidade a mais por ponto de «penalties» do marcador acima de 10. */ takerSkill: number; /** Probabilidade a menos por ponto médio (reflexos, mãos) do guarda-redes acima de 10. */ keeperSkill: number } };
  /** Mercado de treinadores (RZ-157): ofertas que o gamer recebe sem clube, renovadas todas as segundas-feiras. */
  coach: {
    /** Ofertas de clubes de reputação igual ou inferior à do clube que deixou. */
    offers: number;
    /** Ofertas extra de clubes um pouco acima (a surpresa boa). */
    surprises: number;
    /** Até quantos pontos de reputação acima do clube anterior pode vir uma surpresa. */
    surpriseMargin: number;
  };
  /** Percentagem média de estrangeiros nos plantéis, por escalão (GERACAO_MUNDO §4). */
  foreigners: Record<Tier, number>;
  attendance: {
    finalMult: number;
    relegationPromotionDecisionMult: number;
    derby: number;
    mutualDerby: number;
    awayRegionalDerby: number;
    bigCoefAway: number;
  };
  finances: {
    /** Meses de folga: abaixo de `risco` = "Em risco", abaixo de `apertado` = "Apertado". */
    riskMonthsBye: number;
    tightMonthsBye: number;
    bankruptcyRevenueAboutDebt: number;
    bankruptcyDelayWagesMonths: number;
    /** Percentis (do mais alto ao mais baixo) que separam as 5 bandas de riqueza. */
    wealthPercentiles: [number, number, number, number];
    rivalEstimateErrorProb: number;
    /** Receitas, custos e bilheteira por escalão (RZ-114/RZ-115), em euros. */
    model: FinancesModel;
    /** Orçamento anual por defeito (RZ-114): peso da massa salarial nas receitas, meses de reserva e fração da folga para transferências. */
    budget: { revenueAboutBill: number; monthsReserve: number; transfersBye: number; /** Folga da massa salarial por defeito acima da atual: os clubes têm de poder contratar sem ter primeiro de despedir. */ wageHeadroom: number };
  };
  personality: {
    traitMin: number;
    traitMax: number;
    memory: { positiveHalfLifeMonths: number; monthsBaseNegative: number; negativePerPatience: number; maxPerPerson: number };
  };
  /**
   * Que resultados do teu clube vão para a caixa de entrada (RZ-174): só os de rivais geográficos (mútuos, do mesmo concelho
   * ou o rival principal) e os de rivais diretos na tabela (a poucos pontos ou a poucos lugares, depois de `minJogos`).
   */
  inbox: { pointsRival: number; placesRival: number; matchesMinRival: number };
  /** A cidade (concelho) e a sua evolução anual (RZ-133; docs/CITY.md §2, §11). */
  city: CityParameters;
  /** Estatuto das localidades (RZ-136; docs/CITY.md §6b): limiares de população com histerese. */
  locality: { townThreshold: number; cityThreshold: number; hysteresis: number };
  /** Motor de jogo por oportunidades (RZ-104; docs/GAME_ENGINE.md). Escalas de atributos: 1-20. */
  match: {
    /**
     * Jogar fora da posição natural (RZ-177): o jogador rende `minimo + (1 − minimo) × aptidão / 20` do que renderia; sem a
     * posição registada vale `semRegisto` de aptidão. O guarda-redes tem a sua escala, muito mais dura.
     */
    aptitude: { min: number; unrecorded: number; gkMin: number; gkUnrecorded: number };
    /**
     * Cansaço por jogos (RZ-177): a forma cai com os minutos jogados nos últimos `janelaDias` dias acima de `cargaNormal`
     * (um jogo por semana é normal): perde `perdaPor90` por cada 90 minutos a mais, até `minimo`. Nunca passa de 1.
     */
    form: { daysWindow: number; normalWorkload: number; lossPer90: number; min: number; /** Perda de ritmo ao regressar de lesão: forma no 1.º dia e ganho por dia até 1. */ ret: { initial: number; gainByDay: number } };
    /** Substituições do treinador (RZ-215): máximo por jogo e de pausas para as fazer (o intervalo não conta como pausa). */
    substitutions: { max: number; pauses: number };
    /** Minutos regulares e acréscimos (total, sorteado por jogo). */
    duration: number;
    stoppage: { min: number; max: number };
    /** Prolongamento dos jogos a eliminar empatados (RZ-140): minutos jogados e acréscimos no fim. */
    extraTime: { minutes: number; stoppage: { min: number; max: number } };
    /** Oportunidades por equipa num jogo equilibrado (o total do jogo é o dobro). */
    chancesPerTeam: number;
    /** Vantagem de jogar em casa, em pontos de "controlo" (1-20). */
    homeAdvantage: number;
    /**
     * O que o clube leva para o jogo além do plantel (RZ-263): cada ponto de qualidade do treinador acima de 10 vale `coachPoints`
     * pontos de ataque, controlo e defesa; a vantagem de jogar em casa sobe ou desce até ±`crowdEffect` conforme o ambiente do
     * estádio (tamanho entre `smallStadium` e `bigStadium` lugares, em escala logarítmica, com peso `capacityWeight`, e cultura
     * futebolística da cidade no resto).
     */
    edge: { coachPoints: number; crowdEffect: number; smallStadium: number; bigStadium: number; capacityWeight: number };
    /** Pontos de diferença de controlo que dão ~73 % das oportunidades ao mais forte. */
    controlScale: number;
    /** Quanto a diferença ataque-defesa (em pontos de atributo) pesa no remate e no xG. */
    sensitivity: { shot: number; xg: number };
    baseShotP: number;
    /** xG de uma oportunidade: base + amplitude · u^expoente, com u uniforme. Média ≈ base + amplitude/(expoente+1). */
    xg: { base: number; amplitude: number; exponent: number; min: number; max: number };
    penalty: { xg: number; pPerFoul: number };
    /** Peso do finalizador e do guarda-redes na probabilidade de golo (em unidades de logit por 10 pontos de atributo). */
    weight: { finishing: number; goalkeeper: number };
    blockedP: number;
    onTarget: { base: number; porXg: number; max: number };
    corners: { pIfBlocked: number; pIfSaved: number; shotP: number; xgFactor: number };
    fouls: { byTeam: number; shotFreeP: number };
    /** Cartões (RZ-106). Probabilidades por falta, antes dos multiplicadores de fair play e agressividade do infrator. */
    cards: {
      yellowP: number;
      /** Falta que dá penálti. */
      penaltyYellowP: number;
      directRedP: number;
      penaltyRedP: number;
      /** Quem já tem amarelo joga com mais cuidado: fator no peso para cometer a falta e na probabilidade de novo cartão. */
      alreadyYellow: { foul: number; card: number };
      /** Pontos de ataque, controlo e defesa que a equipa perde por cada jogador expulso. */
      sentOffPenalty: { attack: number; control: number; defence: number };
    };
    assistedP: number;
    /** Peso de cada posição a rematar, a assistir e a cabecear (cantos). */
    shotWeight: Record<string, number>;
    attendanceWeight: Record<string, number>;
    headingWeight: Record<string, number>;
    /** Notas dos jogadores (RZ-105), escala 1-10. Valores somados à nota base. */
    ratings: {
      base: number;
      min: number;
      max: number;
      /** Variação aleatória estável (±) por jogador e jogo. */
      noise: number;
      goal: number;
      attendance: number;
      /** Remate à baliza que não é golo (defendido). */
      onTargetShot: number;
      /** Grande ocasião falhada (xG ≥ momentos.xgGrande). */
      missedChance: number;
      missedPenalty: number;
      foul: number;
      grantedPenalty: number;
      /** Por defesa do guarda-redes. */
      defence: number;
      /** Por golo sofrido, para defesas e guarda-redes (GR, DD, DC, DE; MDC a metade). */
      concededGoals: number;
      yellow: number;
      red: number;
      /** Baliza a zero: bónus para GR, DD, DC, DE (MDC a metade). */
      zeroGoalmouth: number;
      /** Bónus de vitória e penalização de derrota para todos os onze. */
      outcome: number;
    };
    /** Momentos-chave do jogo (RZ-105). */
    moments: { bigXg: number };
  };
  /** O que é notícia num jogo (RZ-109). */
  stories: {
    /** Golos de um jogador no mesmo jogo para haver hat-trick. */
    hattrick: number;
    /** Diferença de golos para uma goleada. */
    rout: number;
    /** Um golo nos últimos N minutos que decide ou salva o resultado é notável. */
    discounts: number;
    /** Reviravolta: o vencedor chegou a perder por tantos golos. */
    turnaround: number;
    /** Lesões desta gravidade ou mais são notícia própria. */
    seriousInjury: number;
  };
  /** Lesões e forma (RZ-107; docs/GAME_ENGINE.md §9). */
  injuries: {
    /** Probabilidade base de um jogador se lesionar num jogo de 90 minutos (equipa e adversário normais, relvado médio). */
    pPerMatchPlayer: number;
    /** Multiplicadores do risco. */
    risk: {
      /** Por ponto de «forma» abaixo de 1 (fadiga, calendário apertado). */
      byForm: number;
      /** Relvado 0 (péssimo) … 1 (perfeito): risco ×(1 + (0,5 − relvado) · `relvado`). */
      turf: number;
      /** Por ponto de aptidão física abaixo de 10 (acima de 10 baixa o risco). */
      byPhysicalAptitude: number;
      /** Por ponto de qualidade médica abaixo de 10 (staff médico melhor, menos lesões). */
      byMedical: number;
      /** Fair play do adversário (1 cavalheiro … 5 agressivo). */
      opponentPlayFair: number[];
      /** Por nível de intensidade da própria equipa acima de 3. */
      intensity: number;
      /** Acrescento ao risco de quem regressou há pouco da mesma lesão (recaída). */
      relapse: number;
      /** Quanto o cansaço (pontos de força perdidos) soma ao risco, por ponto. */
      fatigue: number;
    };
    /** Distribuição das gravidades (1 ligeira … 5 gravíssima), somam 1, e dias de paragem [mín, máx] de cada uma. */
    severities: { weight: number; days: [number, number] }[];
    /** Por ponto de qualidade médica acima de 10, encurta a paragem (e alonga abaixo). */
    recoveryPerMedical: number;
    /** Uma recaída dura mais. */
    relapseDuration: number;
    /** Dias após o regresso em que ainda se está em risco de recaída. */
    relapseWindow: number;
    /** Probabilidade diária de lesão em treino (jogador com forma 1, relvado/staff normais). */
    trainingPByDay: number;
    /** Forma (0,7-1,1): calendário e descanso. */
    form: {
      /** Valor de um jogador descansado. */
      base: number;
      /** Perda por jogo nos últimos `janela` dias (além do primeiro). */
      byRecentMatch: number;
      window: number;
      /** Perda por cada 90 minutos jogados nos últimos `janela` dias. */
      por90: number;
      /** Ganho por dia de descanso desde o último jogo, até `base`. */
      recoveryByDay: number;
      /** Forma de quem regressa de lesão, a crescer `recuperacaoPorDia` por dia. */
      onReturn: number;
      min: number;
      max: number;
    };
  };
  /** Castigos disciplinares (RZ-106; docs/GAME_ENGINE.md §8). Contam por competição e época. */
  /**
   * Pré-história (RZ-265): as épocas anteriores ao arranque, só para o gamer ver de onde vêm os clubes e as cidades. Não há jogos nem
   * jogadores; tudo se reconstrói da seed.
   */
  preHistory: {
    /** Quantas épocas para trás (épocas 0, −1, …). */
    seasons: number;
    club: {
      /** Probabilidade de, em cada época, o clube ter subido (estava um escalão abaixo) ou descido (estava um acima) para chegar ao escalão seguinte. */
      promoted: number; relegated: number;
      /** Desvio (em fração da liga) da posição à volta do que a reputação indica. */
      positionNoise: number;
    };
    city: {
      /** Desvio anual dos indicadores (0-100), quanto da tendência para o alvo já se tinha feito, e desvio da variação anual da população (%). */
      indicatorNoise: number; trendShare: number; populationNoisePct: number;
    };
  };
  discipline: {
    /** Amarelos acumulados (na competição e época) em que se cumpre um jogo de suspensão: o 5.º, 9.º, 12.º e 14.º, como no regulamento disciplinar das ligas portuguesas. */
    yellowThresholds: number[];
    /** Vermelho direto: `jogos` de base; com probabilidade `pMaisUm` mais um jogo, repetido até ao máximo `max`. */
    directRed: { matches: number; morePA: number; max: number };
    /** Vermelho por segundo amarelo: jogos de suspensão. */
    secondYellow: { matches: number };
    /** Competições europeias (UEFA): um jogo de suspensão a cada `yellowEvery` amarelos; os amarelos apagam-se depois dos quartos de final. */
    europe: { yellowEvery: number };
  };
  /** Táticas (RZ-108; docs/GAME_ENGINE.md §7). Efeitos em pontos da escala 1-20 de força, ou multiplicadores. */
  tactic: {
    /** Pontos por unidade de «linha» a mais que o 4-3-3 (atacantes = PL + metade de extremos e MO; meio = MC, MDC + metade de extremos e MO). */
    formation: { attack: number; control: number; defence: number };
    styles: Record<"beautiful" | "balanced" | "direct" | "counterAttack", { control: number; attack: number; defence: number; fouls: number; shotCorner: number }>;
    /** Efeito de cada nível acima (+) ou abaixo (−) do 3 (normal). */
    intensity: { control: number; defence: number; fouls: number; fatigue: number };
    line: { control: number; attack: number; defence: number };
    /** Ritmo (agora ligado à intensidade): efeito nas oportunidades de golo e no cansaço. */
    tempo: { chances: number; fatigue: number };
    /** Mentalidade (RZ-249): pontos por nível acima (+) ou abaixo (−) do 3; mais atacante = mais ataque e controlo, menos defesa. */
    mentality: { attack: number; defence: number; control: number };
    /** Frequência de remate: por nível acima do 3, mais remates (logit) e remates piores (xG ×(1−xg·nível)); `skill` = efeito dos remates de longe do finalizador. */
    shooting: { shotLogit: number; xg: number; skill: number };
    /** Queimar tempo: a partir do minuto `start`, quem ganha e queima tempo corta `chances` das oportunidades dos dois lados e arrisca cartões (`cards`); o adversário provocado vê os seus cartões aumentarem `provoke`; `hurry` = oportunidades extra de quem aproveita cada segundo sem estar a ganhar. */
    timeWasting: { start: number; chances: number; cards: number; provoke: number; hurry: number };
    /** Área a explorar: pontos de ataque que a vantagem (ou desvantagem) dos jogadores dessa zona sobre os adversários dá, e a diferença de qualidade que vale o máximo. */
    area: { attack: number; scale: number };
    /** Contexto (RZ-249): as opções arrojadas valem ×(1 ± `home`) em casa/fora, ×(1 + `form`·(forma média − 0,95)) e ×(1 + `coach`·(treinador − 10)). */
    context: { home: number; form: number; coach: number; min: number; max: number };
    /** Multiplicador das faltas e pontos de defesa por nível de agressividade (1 = cavalheiro … 5 = agressivo; o fair play da tática é o inverso). */
    fairPlay: { fouls: number[]; defence: number[]; /** Multiplicador da probabilidade de cartão. */ cards: number[] };
    beautiful: { base: number; scale: number; max: number };
    attackDirectPerLine: number;
    /** Contra-ataque: por cada ponto de controlo que o adversário tem a mais (até `max`), ganha ataque e defesa. */
    counterAttack: { attackPerPoint: number; defencePerPoint: number; max: number };
    /** Cansaço: pontos de força perdidos no fim do jogo por uma equipa com intensidade e ritmo máximos; começa a contar a partir do minuto `inicio`. */
    fatigue: { max: number; start: number };
    /** Treinador (RZ-108): quanto uma formação favorita vale, em pontos de qualidade média do onze, para um treinador totalmente teimoso. */
    coach: { preferenceBonus: number; favourite: number };
  };
  /** Geração do mundo e das pessoas (GERACAO_MUNDO, MODELO_DADOS §15). */
  world: {
    talent: {
      /** Qualidade média (1-20) de um país de índice 0 e de índice 100. */
      muIndex0: number;
      muIndex100: number;
      sigma: number;
      /** Probabilidade de cauda (talento improvável) para índice 0 e 100; nunca zero. */
      seasonsIndex0: number;
      seasonsIndex100: number;
      /** Expoente da cauda de Pareto e escala (pontos de qualidade somados = escala × (pareto − 1)). */
      alphaPareto: number;
      scalePareto: number;
    };
    /** Qualidade-alvo atual (1-20) do plantel por escalão. */
    targetQuality: Record<Tier, { mean: number; deviation: number }>;
    /** Quanto a reputação do clube (0-10000) desloca a qualidade-alvo dentro do escalão, em pontos de qualidade para ±metade da amplitude. */
    qualityByReputation: number;
    /** Peso da reputação (o resto é o dinheiro, em escala logarítmica) na posição de um clube no seu escalão (RZ-263). */
    standingReputationWeight: number;
    /** Estrelas (RZ-916): qualidade relativa ao escalão onde joga, em meias estrelas. `centre` = estrelas de quem tem a qualidade média do escalão; `pointsPerStar` = pontos de qualidade (1-20) por estrela. */
    stars: { centre: number; pointsPerStar: number; freeAgentTier: Tier };
    /** Variação relativa (±) do % de estrangeiros com a reputação do clube dentro do escalão (0,35 → de −35 % a +35 % da média do escalão). */
    variationForeignersReputation: number;
    /** Tamanho do plantel por escalão. */
    squad: Record<Tier, number>;
    /** Lugares por posição num plantel-base de 25 (escala-se para o tamanho do plantel). */
    placesByPosition: Record<"GK" | "RB" | "CB" | "LB" | "DM" | "CM" | "AM" | "RW" | "LW" | "ST", number>;
    /** Jogadores sem clube e pessoas fora do plantel. */
    free: number;
    staffPerClub: number;
    /** Ligas estrangeiras inventadas (RZ-230): quantos países, quantos clubes por país e jogadores por clube. */
    foreignLeagues: { /** Clubes inventados por país (id do país → n.º de clubes): são o conjunto de onde saem os participantes das competições europeias. */ clubs: Record<string, number>; squad: number; /** Amplitude (em pontos de qualidade) entre o melhor e o pior clube de um país. */ rankSpread: number };
    /** Olheiros por clube no início, por escalão: sobe com a reputação (entre mínimo e máximo); `chance` = probabilidade de ter algum (distritais). */
    scouts: Record<Tier, { min: number; max: number; chance: number }>;
    /** Pessoas fora dos plantéis (GERACAO_MUNDO §1). */
    others: { businesspeople: number; fansOfficials: number; agents: number; referees: number; journalists: number; freeStaff: number };
    /** Salário mensal (€) de um jogador médio do escalão e elasticidade por ponto de qualidade (exp). */
    wage: { average: Record<Tier, number>; elasticity: number; yearsContractMin: number; yearsContractMax: number };
    age: { min: number; max: number; mean: number; deviation: number; /** No arranque, quem tem esta idade ou menos conta como formado no clube onde está. */ trainedAtStartMax: number };
    /** Idade a partir da qual o potencial deixa de crescer (potencial = atual aos X anos). */
    peakAge: number;
    /** Aptidão (1-20) nas posições alternativas relativamente à principal. */
    secondaryAptitude: number;
  };
  /** Ciclo anual dos plantéis (RZ-117): desenvolvimento, reforma, contratos, livres e formação. */
  squadCycle: {
    development: {
      /** Fração da distância ao potencial que um jogador abaixo do auge recupera num ano. */
      growthShare: number;
      /** Desvio (pontos de qualidade) da variação anual de um jogador. */
      yearlyNoise: number;
      /** Idade a partir da qual a qualidade desce, descida base por ano e aumento por ano de idade acima. */
      declineAge: number;
      declineBase: number;
      declinePerYear: number;
      /** Descida extra por ano acima da idade de declínio nos atributos físicos; ganho anual (até aos 29) nos mentais. */
      physicalExtra: number;
      mentalGain: number;
      /** Os atributos fora da posição seguem a variação com este peso. */
      offPositionWeight: number;
    };
    retirement: {
      /** Idade mínima, probabilidade nessa idade e aumento por ano; guarda-redes reformam-se mais tarde (anos). */
      fromAge: number;
      baseProbability: number;
      perYear: number;
      goalkeeperExtraYears: number;
      /** Idade em que reforma sempre. */
      maxAge: number;
      /** Multiplicador para jogadores sem clube. */
      freeMultiplier: number;
    };
    contracts: {
      yearsMin: number;
      yearsMax: number;
      /** Probabilidade de renovação = base + porPonto × (qualidade − média do escalão) − porAnoVelho × anos acima de `oldAge`. */
      renewBase: number;
      renewPerQualityPoint: number;
      renewPerOldYear: number;
      oldAge: number;
      /** Mínimo e máximo da probabilidade de renovação. */
      renewMin: number;
      renewMax: number;
      /** Ordenado de renovação relativo à fórmula do escalão (1 = igual). */
      renewalWageFactor: number;
      /** Renovações do clube do gamer (RZ-165): o jogador aceita ofertas a partir de `acceptFloor` × o pedido; a lealdade (por ponto acima de 10) e ser da terra baixam esse patamar; o pedido sobe com a ganância do agente (por ponto acima do pivô); anos pedidos. */
      negotiation: {
        acceptFloor: number; floorByLoyalty: number; floorNative: number; floorMin: number; askYears: number;
        /** Rondas de contrapropostas antes de o agente se recusar a negociar mais; abaixo de `walkAway` × o pedido ele sai logo; `concession` = fração da distância ao pedido que o agente mantém em cada ronda (a potência da ronda). */
        maxRounds: number; walkAway: number; concession: number; maxYears: number;
        /** Cláusula de rescisão: o agente pede `clauseWage` de ordenado a mais por cada «referência» acima de 1 (sem cláusula conta como `noClauseRatio`); acima de `clauseCeiling` × a referência corta-a. */
        clauseWage: number; noClauseRatio: number; clauseCeiling: number;
        /** Interesse: um jogador muito acima do nível do clube (`levelMargin` desvios), ambicioso e sem lealdade, não quer renovar; nos escalões em `distance.tiers` quem vem de outro distrito só fica por `distance.wageFactor` × o ordenado médio do escalão. */
        level: { margin: number; ambitionMin: number; loyaltyStay: number };
        distance: { tiers: Tier[]; wageFactor: number; loyaltyStay: number };
      };
    };
    squad: {
      /** Jogadores acima do plantel-alvo que a formação ainda pode juntar. */
      slack: number;
      /** Quanto a qualidade procurada num livre pode diferir da qualidade-alvo do clube. */
      freeAgentTolerance: number;
    };
    youth: {
      /** Entradas máximas por clube e por ano, por escalão. */
      perClub: Record<Tier, number>;
      ageMin: number;
      ageMax: number;
      /** Desvio à qualidade-alvo do escalão (positivo = formação melhor). */
      targetOffset: number;
      /** Probabilidade de o jovem ser da cidade do clube. */
      hometownProbability: number;
      /** Família de nomes dos jogadores formados. */
      nameFamily: string;
      /** Aposta do clube nos jovens (1 = média): desvio sorteado, efeito da paciência e da ambição do presidente, limites. */
      focus: { spread: number; byPatience: number; byAmbition: number; min: number; max: number };
      /**
       * Formação do clube (RZ-234): nível 0-100 que tende para `base` + `byFocus` por cada unidade de aposta nos jovens acima de 1 + `byCoach` por cada ponto
       * do treinador acima de 10 + `byFinances` por cada duplicação das finanças contra a mediana do escalão + `byEducation` por cada ponto de educação da
       * cidade acima de 50. Move-se `regression` do desvio por ano, no máximo `maxStep` pontos. O aproveitamento vai de `yieldMin` a `yieldMax`;
       * `potentialByYield` = potencial extra dos jovens por cada 0,1 de aproveitamento acima de `yieldPivot` (e a entrada de jovens escala com yield/yieldPivot);
       * `prideLocal` = variação da entrada de jovens da terra por orgulho acima de 50 (fração, a ±50).
       */
      development: { base: number; byFocus: number; byCoach: number; byFinances: number; byEducation: number; regression: number; maxStep: number; yieldMin: number; yieldMax: number; yieldPivot: number; potentialByYield: number; prideLocal: number };
      /** Penalização na escolha de livres por ano acima de 26, para um clube com aposta 1 (escala com a aposta). */
      agePenalty: number;
      /** Efeito da aposta (por unidade acima de 1) na qualidade e no potencial de quem sai da formação. */
      qualityByFocus: number;
      potentialByFocus: number;
      /** Efeito da aposta na renovação: sobe os jovens (≤ 21) e desce os veteranos (≥ 30), por unidade acima/abaixo de 1. */
      renewalYouthEffect: number;
      renewalVeteranEffect: number;
      /**
       * Talento local (RZ-234): jovens sem clube que nascem em cada concelho. Teto = população^expoente × cultura de futebol;
       * `perCityMean` jovens para o concelho médio (probabilidade de arredondamento por sorteio), idade à chegada, e quanto o teto
       * desloca o potencial (±`potentialShift` pontos de qualidade nos extremos). Quem ninguém contrata em 1 ano sai do futebol.
       */
      prospects: { perCityMean: number; ageMin: number; ageMax: number; popExponent: number; potentialShift: number; localLockDays: number };
    };
  };
  /** Empresas e patrocínios (RZ-219, RZ-311). */
  companies: {
    /** Empresas por cidade = base + porDécada × log10(população / 15 000), com mínimo. */
    perCity: { base: number; perDecade: number; min: number };
    /** Peso de cada escala = base + porDécada × décadas (nunca negativo), em função da população da cidade. */
    scaleWeight: Record<"local" | "regional" | "national" | "international", { base: number; perDecade: number }>;
    /** Capacidade (volume de negócio, €) mediana por escala e desvio do logaritmo. */
    capital: { median: Record<"local" | "regional" | "national" | "international", number>; sigma: number };
    /** Volume de negócio (€) por empregado, por escala: serve para estimar o número de empregados da empresa. */
    capitalPerEmployee: Record<"local" | "regional" | "national" | "international", number>;
    /** Empresas ↔ cidade (RZ-235). */
    city: {
      /** Empregos: parte dos empregados de cada escala que trabalha no concelho; pontos de emprego (e de economia, pelo volume de negócio) por duplicação face ao esperado para uma cidade deste tamanho, e limite; quotas do maior empregador para dependência média e alta. */
      jobs: { localShare: Record<"local" | "regional" | "national" | "international", number>; employmentK: number; employmentMax: number; economyK: number; economyMax: number; dependence: [number, number]; /** Empregos locais a partir dos quais abrir ou fechar uma empresa é notícia na cidade. */ eventJobs: number };
      /** Parceiros de serviços: setor da empresa → serviço que ajuda quando o orçamento da Câmara não chega; pontos por unidade de défice (1 − quociente de prioridade), peso por escala e limite por serviço. */
      partners: { sectors: Partial<Record<string, CityService>>; k: number; scale: Record<"local" | "regional" | "national" | "international", number>; max: number };
      /** Mecenato: probabilidade diária de uma proposta ao clube do gamer, dias de espera entre propostas e de validade, parte do valor anual de patrocínios que doa cada escala, bónus do naming, anos do naming. */
      patron: { dailyChance: number; cooldownDays: number; validDays: number; share: Record<"local" | "regional" | "national" | "international", number>; namingBonus: number; namingYears: number };
    };
    /** Evolução anual do capital: crescimento médio, efeito da economia da cidade (±metade da escala), desvio. */
    evolution: { growth: number; economyEffect: number; sigma: number; closureProbability: number; lowCapitalShare: number; lowCapitalClosure: number; foundingRate: number };
    sponsorship: {
      /** Tipos de patrocínio que o clube de cada escalão oferece e a quota de cada um no total do escalão. */
      slots: Record<Tier, ("shirt" | "stadium" | "youth")[]>;
      kindShare: Record<"shirt" | "stadium" | "youth", number>;
      /** Desvio do logaritmo do valor negociado. */
      valueSigma: number;
      extra: { startRatio: number; perRatio: number; max: Record<Tier, number>; valueShare: number };
      /** Fração máxima da capacidade da empresa que pode estar comprometida em patrocínios por ano. */
      maxShareOfCapital: number;
      yearsMin: number;
      yearsMax: number;
      /** Probabilidade de renovação, e os seus ajustes se o clube subiu ou desceu de escalão. */
      renewBase: number;
      renewPromoted: number;
      renewRelegated: number;
      /** Proximidade: mesmo concelho, mesmo distrito, resto; empresas nacionais e internacionais nunca descem de `farFloor`. */
      proximity: { city: number; district: number; elsewhere: number; nationalFloor: number };
      /** Quanto cada escala encaixa em cada escalão. */
      scaleFit: Record<Tier, Record<"local" | "regional" | "national" | "international", number>>;
    };
  };
  /** Direitos de transmissão (RZ-218): emissoras (televisão, rádio, streaming) disputam pacotes por escalão e jogos de interesse. */
  broadcast: {
    /** Emissoras nacionais criadas no arranque (na maior cidade); o capital é o volume de negócio. */
    national: { sector: "television" | "radio" | "streaming"; scale: "national" | "international"; capital: number }[];
    /** Fração do valor comercial do escalão (`annualCommercial`) que passa a vir do pacote de direitos. */
    packageShareOfCommercial: Record<Tier, number>;
    /** Máximo de licitantes por pacote (sorteados por interesse) e, em cada escalão, quanto cada tipo de emissora se interessa. */
    bidders: Record<Tier, number>;
    interest: Record<Tier, Record<"television" | "radio" | "streaming", Record<"local" | "regional" | "national" | "international", number>>>;
    /** Desvio do logaritmo de cada proposta, preço mínimo (fração do valor de referência) e prémio de quem já tinha os direitos. */
    bidSigma: number;
    reserve: number;
    incumbentBonus: number;
    /** Fração máxima do capital da emissora que pode estar comprometida em direitos. */
    maxShareOfCapital: number;
    /** Jogos de interesse por jornada em cada escalão; valor por jogo transmitido (€) e bónus do dérbi / limites do multiplicador de interesse. */
    featuredPerRound: Record<Tier, number>;
    matchFee: Record<Tier, number>;
    derbyBonus: number;
    interestRange: { min: number; max: number };
    /** Taça e Supertaça: jogos de interesse por ronda, valor por jogo e emissoras com interesse (nacionais). */
    cup: { featuredPerRound: number; matchFee: number; superCupFee: number };
  };
  /** Mercado de transferências entre clubes da IA (RZ-205/213): janelas, avaliação, propostas e consentimento do jogador. */
  market: {
    /** Janelas [mês, dia] de abertura e fecho (inclusive). */
    windows: { open: [number, number]; close: [number, number] }[];
    /** Dia da semana (0 = domingo) em que corre uma ronda; corre sempre também no último dia da janela. */
    roundWeekday: number;
    /** Probabilidade de um clube agir numa ronda normal e no último dia. */
    actProbability: number;
    actProbabilityLastDay: number;
    /** Negócios que cada clube pode tentar por ronda e peso de cada janela na probabilidade de agir (verão cheio, inverno mais calmo). */
    dealsPerRound: number;
    windowFactor: number[];
    /** Na janela de inverno cada clube volta a ter pelo menos esta fração do orçamento de transferências por defeito (recalculado com a caixa de então) e a massa salarial por defeito atual. */
    winterRefresh: number;
    /** Contratações máximas por clube e janela. */
    maxSigningsPerWindow: number;
    /** Um clube só compra se o plantel tiver menos do que alvo + folga. */
    squadSlack: number;
    /** Valor de mercado: múltiplo do ordenado anual por idade (interpolado), prémio do potencial por ponto, peso do contrato restante. */
    ageFactor: [number, number][];
    potentialPremium: number;
    potentialPremiumAgeMax: number;
    contractFullMonths: number;
    contractMinFactor: number;
    /** Preço pedido = valor × (base + ganância × (ganância do presidente − 10)); a oferta paga valor × (1 + prémio) com ruído. */
    askBase: number;
    askByGreed: number;
    bidPremium: number;
    bidNoise: number;
    /** Até quanto acima do valor o comprador sobe se o vendedor pedir mais (fração do valor), e folga sobre a massa salarial do orçamento. */
    counterTolerance: number;
    wageSlack: number;
    /** Folga de qualidade acima da procurada na escolha de candidatos. */
    qualityCeiling: number;
    /** Qualidade mínima que um reforço tem de trazer em relação ao pior titular da posição para valer a pena. */
    minUpgrade: number;
    /** Ordenado novo = máx(ordenado atual × subida, fórmula do escalão); anos de contrato novo. */
    wageRaise: number;
    contractYears: [number, number];
    /** Parte do dinheiro de uma venda que passa a poder ser gasta em transferências. */
    saleToBudget: number;
    /** Consentimento do jogador: probabilidade base de aceitar subir de escalão e de descer, efeito da ambição e da lealdade (por ponto acima de 10). */
    consent: { up: number; down: number; byAmbition: number; byLoyalty: number; byWageRatio: number };
    /**
     * Empréstimos (RZ-268): até ao fim da época; o clube que recebe paga `wageShares` do ordenado (a primeira fração que a massa salarial
     * deixa) e, se o jogador estava à venda, `feeRate` do valor. Emprestam-se excedentes e jovens (até `prospectAgeMax` anos, com `prospectGap`
     * pontos de potencial acima da qualidade, sem lugar no onze), para clubes do mesmo escalão ou inferiores; o clube dono nunca fica abaixo
     * de alvo − `lenderMinSquad` jogadores. Cada clube recebe no máximo `maxPerClub`; em janeiro o dono chama de volta com `recallProbability`.
     */
    loans: { actProbability: number; maxPerClub: number; wageShares: number[]; /** Percentagens do ordenado que o gamer pode propor (RZ-269) e probabilidade diária de uma proposta de empréstimo por um jogador seu. */ proposalShares: number[]; offerChance: number; feeRate: number; prospectAgeMax: number; prospectGap: number; lenderMinSquad: number; recallProbability: number };
    /**
     * Decisão do jogador (RZ-266): o jogador tem a palavra final. Compara o conjunto clube + cidade do clube que propõe com o de onde joga
     * (`club`: peso do escalão, da reputação e do estádio; `city`: peso de cada indicador e da população; `cityShare`: parte da cidade no
     * conjunto, mais para quem é leal), o ordenado (`wage`: por unidade de ln(novo/atual), vezes ganância/10), ser da terra (`home`) ou deixar
     * a terra (`leavingHome`), ter lugar no onze (`playingTime`, vezes ambição/10) e desemprego (`free`). `scale` = declive da curva (logit);
     * `byAmbition`/`byLoyalty`: efeito por ponto acima de 10. `minWillingness`: abaixo disto o clube nem tenta; `wagePremiums`: múltiplos do
     * ordenado normal que o clube pode oferecer para convencer. `listing`: transferíveis (excedentes além das vagas da posição + `surplus`;
     * com aperto financeiro, os mais caros) e o desconto no pedido do clube; `need`: peso de uma vaga por preencher e de cada ponto de
     * qualidade em falta; `homeScore`/`regionScore`: bónus de procurar jogadores da terra ou do distrito.
     */
    decision: {
      tier: Record<Tier, number>;
      club: { tier: number; reputation: number; stadium: number };
      city: { economy: number; employment: number; tourism: number; pride: number; footballCulture: number; notoriety: number; population: number; safety: number; entertainment: number; health: number; mobility: number; housing: number };
      cityShare: number; byLoyaltyCity: number;
      scale: number; bias: number; wage: number; home: number; leavingHome: number; playingTime: number; free: number;
      byAmbition: number; byLoyalty: number; minWillingness: number; wagePremiums: number[];
      listing: { surplus: number; discount: number; maxPerClub: number; stressMargin: number };
      need: { missing: number; gap: number };
      homeScore: number; regionScore: number;
      /** Orgulho da cidade (RZ-234): o apelo de jogar na terra natal varia `prideHome` por cada 50 pontos de orgulho acima ou abaixo de 50; veteranos (idade ≥ `returnHome.age`) a regressar à terra ganham `returnHome.bonus` (z) a mais. */
      prideHome: number; returnHome: { age: number; bonus: number };
      /** Pontos de preferência perdidos por cada escalão a mais (além de 1) que o clube vai buscar abaixo: os clubes olham sobretudo para o seu nível. */
      stepPenalty: number;
    };
    /** Agentes (RZ-206): quota de jogadores com agente por escalão do clube; peso de cada cliente já tido (agentes grandes atraem mais); comissão (fração do ordenado anual) e subida da comissão e do ordenado pedido por ponto de ganância acima de 10; efeito da ganância e da lealdade do agente no consentimento do jogador; pivôs = ganância e lealdade médias dos agentes (acima/abaixo disto o efeito é positivo/negativo, para o agente típico não mexer no equilíbrio do mercado). */
    agents: { share: Record<Tier, number>; popularity: number; commissionRate: number; commissionByGreed: number; wageByGreed: number; consentByGreed: number; consentByLoyalty: number; greedPivot: number; loyaltyPivot: number };
    /** Cláusulas (RZ-207): probabilidade de o clube vendedor negociar uma percentagem de revenda (sobe com a ganância do presidente por ponto acima de 10) e intervalo dessa percentagem (fração do valor da venda futura); cláusula de rescisão num contrato novo: probabilidade base, subida por ponto de ganância do agente acima do pivô, e múltiplo do valor de mercado. */
    clauses: { releaseProbability: number; releaseByAgentGreed: number; releaseFactor: [number, number] };
    /** Compensação de formação (RZ-207): quem contrata um livre com esta idade ou menos, formado noutro clube, paga ao clube formador `byTier` × ordenado anual do novo contrato (por escalão do clube formador; nas distritais costuma ser zero). */
    training: { ageMax: number; byTier: Record<Tier, number> };
    /** Propostas do gamer (RZ-231): o vendedor fecha a porta abaixo de `walkAway` × pedido; cede `concession`^ronda da distância; `maxRounds` rondas; um mês de espera depois de fechar. */
    /** Propostas da IA por jogadores do gamer (RZ-232): chance diária por jogador com a janela aberta, validade, folga máxima sobre o valor, rondas e cedência do comprador. */
    offers: { /** Jogador à venda: vezes mais propostas e o valor pedido fica a esta fração. */ forSaleChance: number; forSaleFee: number; dailyChance: number; validDays: number; feeSpread: [number, number]; maxMult: number; maxRounds: number; concession: number; minAge: number; sameWindowDays: number;
      /** Jovens formados pelo clube do gamer: clubes de escalão acima propõem (chance diária por jovem, idade máxima, potencial mínimo 1–20) e pagam a compensação de formação por cima do valor. */
      youth: { dailyChance: number; ageMax: number; minPotential: number } };
    /** Valor (€) a partir do qual uma transferência entre outros clubes é notícia. */
    news: { minFee: number };
    bids: {
      walkAway: number; concession: number; maxRounds: number; waitDays: number;
      /** Desvio (fração) das sugestões sem informação nenhuma sobre o jogador; desce com a observação (semana: metade; mês: zero). */
      suggestionNoise: number;
      /** Descer de escalão: o jogador pede `stepBackWage` × o ordenado atual, a não ser no fim da carreira (idade ≥ `endOfCareerAge`) ou se for da terra do clube. */
      stepBackWage: number; endOfCareerAge: number; /** Dias que o gamer tem para confirmar um acordo. */ confirmDays: number;
      /** Jogador importante para o vendedor fica mais caro: [posição no plantel (0 = melhor), multiplicador]; o primeiro escalão que servir. */ importance: [number, number][];
      /** Mais 15 % por desvio de qualidade acima da média do escalão do vendedor. */ qualityPremium: number;
      /** Com uma oferta a partir desta fração do pedido o clube dá mais uma ronda. */ closeBonus: number;
    };
  };
  /** O que se sabe sobre os outros (HISTORICO_EVENTOS §5.B, PERSONALIDADE §7). */
  /** Scouting do gamer (RZ-230): quantos jogadores aparecem, quanto custa observar e quanto demora. */
  scouting: {
    /** Fração dos jogadores nacionais visíveis: base + por olheiro (máx.); os estrangeiros só uma fração disso. */
    reach: { base: number; perScout: number; max: number; foreignFactor: number };
    /** Ordens (observações e pesquisas) em simultâneo por olheiro. */
    perScout: number;
    days: { week: number; month: number; search: number };
    /** Custo (€) de uma observação de uma semana, de um mês e de uma pesquisa por posição; estrangeiros custam mais (viagens). */
    cost: { week: number; month: number; search: number; foreignMultiplier: number };
    /** Um mês de observação sobe a qualidade; nunca passa do máximo. */
    monthBoost: number;
    monthQualityMax: number;
    /** Qualidade (0-1) das estimativas que a pesquisa por posição já traz. */
    searchQuality: number;
    search: { results: number; slack: number; potentialDiscount: number; noise: number; reachFactor: number };
  };
  knowledge: {
    /** Épocas sem nova observação a partir das quais a ficha mostra "desatualizado". */
    seasonsAfterOutdated: number;
    /** A incerteza (desvio) de uma observação cresce `1 + k × épocas` com o tempo. */
    uncertaintyGrowthPerSeason: number;
    /** Desvio do erro de uma observação de qualidade 0 e de qualidade 1 (escala 1-20). */
    worstSigmaQuality: number;
    bestSigmaQuality: number;
    /** Multiplicador da margem (1.28 ≈ intervalo a 80 %). */
    z: number;
    /** Qualidade (0-1) por omissão de cada fonte de observação. */
    qualityPerSource: Record<"clubOwn" | "scout" | "agent" | "againstMatch" | "press", number>;
    personality: {
      labelsMax: number;
      /** Faixas do traço: ≤ baixo é "baixo", ≥ alto é "alto" (PERSONALIDADE §7). */
      lowThreshold: number;
      highThreshold: number;
      /** Probabilidade de o rótulo vir com a faixa trocada, para qualidade 0 (desce até 0 com qualidade 1). */
      worstSubstitutionProbQuality: number;
    };
  };
};

export const DEFAULT_PARAMETERS: Params = {
  version: 1,
  prizes: {
    club: 2_000_000, city: 1_000_000,
    competitions: { firstLeague: 10_000_000, secondLeague: 2_000_000, thirdLeague: 500_000, cpSeries: 100_000, cpWinner: 100_000, district: 5_000, promotionPhase: 10_000, portugalCup: 2_000_000, superCup: 500_000, districtCup: 5_000, districtSuperCup: 2_500 },
    beatenFinalist: 0.25,
    portugalCupPerRound: { semi: 500_000, factor: 0.5, min: 5_000 },
    districtFactor: { min: 0.4, max: 2.5 },
  },
  pyramid: {
    firstLeague: { clubs: 20, drop: 3 },
    secondLeague: { clubs: 20, rise: 3, drop: 3 },
    thirdLeague: { clubs: 20, rise: 3, drop: 4 },
    cp: { series: 4, clubsPerSeries: 10, risePerSeries: 1 },
    promotion: { groups: 4, championsPerGroup: 5, promotedPerGroup: 2, legs: 1 },
    districts: 20,
  },
  districtLeagues: { target: 10, min: 8, max: 14, hardMin: 6 },
  standings: { winPoints: 3, drawPoints: 1 },
  tiebreak: {
    league: ["points", "headToHead", "difference", "scoredGoals", "wins", "lottery"],
    promotion: ["points", "headToHead", "difference", "scoredGoals", "smallerReputation", "lottery"],
  },
  competitionView: { topN: 10, minRatedGames: 3 },
  reputation: {
    levels: [
      { level: "worldClass", min: 9000 },
      { level: "continental", min: 6500 },
      { level: "national", min: 3500 },
      { level: "regional", min: 2000 },
      { level: "local", min: 1000 },
      { level: "obscure", min: 0 },
    ],
  },
  calendar: {
    seasonStartMonth: 7,
    seasonEndMonth: 6,
    windows: [
      { opens: { month: 7, day: 1 }, closes: { month: 8, day: 31 } },
      { opens: { month: 1, day: 1 }, closes: { month: 1, day: 31 } },
    ],
    daysPerAdvance: 1,
    initialYear: 2026,
    firstRound: { month: 8, day: 15 },
    lastRoundUntil: { month: 5, day: 18 },
    lastRoundPerTier: { district: { month: 4, day: 5 }, cp: { month: 4, day: 25 } },
    pauses: [
      { reason: "seleções (setembro)", from: { month: 9, day: 4 }, until: { month: 9, day: 10 } },
      { reason: "seleções (outubro)", from: { month: 10, day: 9 }, until: { month: 10, day: 15 } },
      { reason: "seleções (novembro)", from: { month: 11, day: 13 }, until: { month: 11, day: 19 } },
      { reason: "Natal", from: { month: 12, day: 22 }, until: { month: 1, day: 2 } },
      { reason: "seleções (março)", from: { month: 3, day: 20 }, until: { month: 3, day: 26 } },
    ],
    matchDays: { firstLeague: [6, 0], secondLeague: [6, 0], thirdLeague: [6, 0], cp: [0], district: [0] },
    simultaneousFinalRounds: 1,
    cpFinalPhase: { seriesAfterDays: 7, roundsBetweenDays: 7 },
  },
  europe: {
    size: 36,
    access: {
      seasonsCounted: 5, portugalQuality: 13.8, pointsPerQuality: 0.6, qualifierSensitivity: 0.5,
      bands: [
        { maxRank: 4, championsLeague: 4, championsQualifying: 0, europaLeague: 1, conferenceLeague: 1 },
        { maxRank: 7, championsLeague: 2, championsQualifying: 1, europaLeague: 1, conferenceLeague: 1 },
        { maxRank: 12, championsLeague: 1, championsQualifying: 1, europaLeague: 1, conferenceLeague: 1 },
        { maxRank: 99, championsLeague: 1, championsQualifying: 0, europaLeague: 1, conferenceLeague: 1 },
      ],
    },
    calendar: { anchor: { month: 9, day: 15 }, leaguePhaseWeeks: [0, 2, 5, 7, 10, 12, 18, 19, 20, 21], knockoutWeeks: [22, 23, 25, 26, 29, 30, 32, 33] },
    competitions: {
      championsLeague: { pots: 4, perPot: 2, weekday: 3, finalWeek: 37, finalWeekday: 6, prizes: { participation: 4_000_000, win: 500_000, draw: 170_000, topEight: 1_500_000, rounds: [800_000, 1_200_000, 1_800_000, 2_600_000], finalist: 3_500_000, winner: 5_500_000 } },
      europaLeague: { pots: 4, perPot: 2, weekday: 4, finalWeek: 35, finalWeekday: 3, prizes: { participation: 1_800_000, win: 220_000, draw: 75_000, topEight: 600_000, rounds: [350_000, 500_000, 750_000, 1_100_000], finalist: 1_500_000, winner: 2_300_000 } },
      conferenceLeague: { pots: 6, perPot: 1, weekday: 4, finalWeek: 36, finalWeekday: 3, prizes: { participation: 900_000, win: 110_000, draw: 40_000, topEight: 300_000, rounds: [180_000, 250_000, 380_000, 550_000], finalist: 750_000, winner: 1_150_000 } },
    },
    ratingNoise: 0.15,
  },
  cups: {
    cup: { wave: { district: 0, cp: 0, thirdLeague: 1, secondLeague: 1, firstLeague: 2 }, firstRound: { month: 9, day: 12 }, lastRound: { month: 5, day: 3 }, finalDaysAfterLeagues: 5, qualifiersPerDistrictWithoutHistory: 2 },
    supercupDaysBeforeFirstRound: 6,
    districtCup: { firstRound: { month: 10, day: 1 }, finalDaysAfterDistrictsEnd: 6 },
    nationalStadium: { name: "Estádio Nacional", locality: "Oeiras", capacity: 38_000 },
    minRestDays: 3,
  },
  saves: { daysAutosave: 7, rotatingAutosaves: 3, saveAtSeasonStart: true },
  fairPlay: { levels: 5, fallback: 3 },
  knockoutRounds: { penalties: { initial: 5, goalProb: 0.76, takerSkill: 0.012, keeperSkill: 0.008 } },
  coach: { offers: 3, surprises: 1, surpriseMargin: 600 },
  foreigners: { firstLeague: 0.55, secondLeague: 0.3, thirdLeague: 0.15, cp: 0.08, district: 0.03 },
  attendance: {
    finalMult: 2.5,
    relegationPromotionDecisionMult: 1.8,
    derby: 1.3,
    mutualDerby: 1.6,
    awayRegionalDerby: 0.2,
    bigCoefAway: 0.3,
  },
  finances: {
    riskMonthsBye: 1,
    tightMonthsBye: 3,
    bankruptcyRevenueAboutDebt: 0.5,
    bankruptcyDelayWagesMonths: 3,
    wealthPercentiles: [90, 70, 40, 15],
    rivalEstimateErrorProb: 0.25,
    budget: { revenueAboutBill: 0.7, monthsReserve: 3, transfersBye: 0.35, wageHeadroom: 0.05 },
    model: {
      refReputation: { firstLeague: 5300, secondLeague: 4650, thirdLeague: 3000, cp: 2590, district: 1295 },
      exponentReputation: 1.2,
      ratioReputation: { min: 0.5, max: 3 },
      ticketPrice: { firstLeague: 9, secondLeague: 8, thirdLeague: 7, cp: 6, district: 4.5 },
      occupancy: { firstLeague: 0.55, secondLeague: 0.45, thirdLeague: 0.4, cp: 0.35, district: 0.3 },
      cultureOccupancy: 0.3,
      annualSponsorship: { firstLeague: 1_400_000, secondLeague: 550_000, thirdLeague: 250_000, cp: 118_000, district: 34_000 },
      annualCommercial: { firstLeague: 600_000, secondLeague: 300_000, thirdLeague: 110_000, cp: 62_000, district: 21_000 },
      monthlyStaff: { firstLeague: 40_000, secondLeague: 12_000, thirdLeague: 4_500, cp: 1_200, district: 250 },
      monthlyFixed: { firstLeague: 35_000, secondLeague: 12_000, thirdLeague: 5_000, cp: 1_200, district: 300 },
      stadiumPerPlaceYear: { firstLeague: 40, secondLeague: 25, thirdLeague: 15, cp: 10, district: 4 },
    },
  },
  personality: {
    traitMin: 1,
    traitMax: 20,
    memory: { positiveHalfLifeMonths: 12, monthsBaseNegative: 6, negativePerPatience: 0.6, maxPerPerson: 40 },
  },
  inbox: { pointsRival: 3, placesRival: 3, matchesMinRival: 3 },
  city: {
    council: {
      loadings: {
        sport: { ambition: 0.3, vanity: 0.5, patience: 0, integrity: 0 },
        health: { ambition: 0, vanity: -0.1, patience: 0.4, integrity: 0.3 },
        education: { ambition: 0, vanity: -0.1, patience: 0.5, integrity: 0.2 },
        mobility: { ambition: 0.5, vanity: 0.2, patience: -0.1, integrity: 0 },
        housing: { ambition: 0, vanity: -0.2, patience: 0.2, integrity: 0.3 },
        safety: { ambition: 0.1, vanity: 0, patience: 0, integrity: 0.3 },
        leisure: { ambition: 0.1, vanity: 0.5, patience: -0.3, integrity: -0.1 },
      },
      sportSupport: 0.6, moodWeight: 0.5, jitter: 0.25, levelCuts: [0.6, 0.85, 1.15, 1.5],
      serviceByShare: 8, discretionary: 0.05, shareTrend: [0.05, 0.15],
      relation: { start: 50, approved: 6, refused: -2, prideDrift: 0.1, trend: 3, strongTrend: 8 },
      requests: {
        areas: { youth: "sport", matchday: "mobility", subsidy: "sport" },
        cost: { youth: 0.0008, matchday: 0.001, subsidy: 0 },
        subsidyRate: 0.0005, subsidyTier: { firstLeague: 0.15, secondLeague: 0.3, thirdLeague: 0.5, cp: 0.8, district: 1 },
        youthBonus: 12, matchdayBoost: 0.06,
        replyDays: [7, 21], cooldownDays: 120, cofunds: [0, 0.25, 0.5],
        decision: { bias: 0.2, relation: 1.6, priority: 1.4, sport: 0.9, vanity: 0.3, cost: 1.8, cofund: 1.2 },
      },
      election: {
        month: 10, day: 11, campaignDays: 28,
        candidatesBySize: [[0, 2], [20000, 3], [80000, 4]],
        pIncumbentRuns: 0.8, pExMayorRuns: 0.35, pRetiredPlayer: 0.3, retiredMinAge: 35,
        vote: { incumbent: 0.3, mood: 1.2, promises: 0.8, exMayor: 0.15, retired: 0.25, noise: 0.5 },
        gamer: { pride: 0.35, notoriety: 0.25, results: 0.25, security: 0.15, maxShift: 0.6 },
        relation: { backed: 8, backedRival: -6, neutralLost: -4, promiseKept: 5, promiseBroken: -5 },
      },
    },
    yearsMunicipalElections: 4,
    sinceTerm: 2025,
    levels: [20, 40, 60, 80],
    trendThreshold: 4,
    sectors: {
      TUR: { employment: 4, economy: 6, tourism: 30, populationPct: 0.2, entertainment: 10, housing: -8, mobility: 4 },
      MAR: { tourism: 12, populationPct: -0.2, housing: -3 },
      IND: { employment: 8, economy: 8, tourism: -8, populationPct: 0.2, safety: -2, mobility: 4 },
      AGR: { employment: -4, economy: -6, tourism: -6, populationPct: -0.4, mobility: -8, health: -4, education: -3, entertainment: -8, housing: 10 },
      UNI: { employment: 5, economy: 6, tourism: 4, populationPct: 0.6, education: 12, entertainment: 10, health: 4, housing: -4 },
      LOG: { employment: 6, economy: 6, populationPct: 0.3, mobility: 10 },
      PAT: { tourism: 20, entertainment: 4 },
      INT: { employment: -8, economy: -10, tourism: -4, populationPct: -0.8, mobility: -10, health: -6, education: -4, entertainment: -10, housing: 12 },
      FRO: { employment: -2, economy: -2, populationPct: -0.3, mobility: -6, health: -3, housing: 8 },
      TER: { tourism: 14, mobility: -2, housing: 4 },
      EMI: { employment: -2, economy: 2, tourism: 4, populationPct: -0.3, housing: 2 },
      DOR: { employment: 2, tourism: -10, populationPct: 0.9, mobility: 6, safety: -4, entertainment: -3, housing: -4 },
      ENE: { employment: 4, economy: 14, populationPct: 0.2 },
      SER: { employment: 8, economy: 10, tourism: 2, populationPct: 0.4, health: 4, education: 4, mobility: 6, entertainment: 4, housing: -6 },
      MUL: { populationPct: 0.8, entertainment: 2, safety: -2 },
      ILH: { employment: -2, economy: -2, tourism: 10, mobility: -4, health: -3, housing: -2 },
    },
    initial: {
      base: 50, noise: 6, byEconomyDecade: 8, byEmploymentDecade: 3,
      pride: { base: 35, byReputation: 40, noise: 5 },
      notoriety: { base: 15, byReputation: 55, byDecade: 8, noise: 4 },
      reputationMax: 10000,
    },
    services: {
      initial: {
        base: { health: 50, education: 50, mobility: 50, housing: 56, safety: 62, entertainment: 40 },
        byDecade: { health: 6, education: 5, mobility: 6, housing: -6, safety: -3, entertainment: 8 },
        byBudget: 10, noise: 5,
      },
      links: {
        health: { economy: 0.1, employment: 0, tourism: 0 },
        education: { economy: 0.05, employment: 0, tourism: 0 },
        mobility: { economy: 0.1, employment: 0, tourism: 0.05 },
        housing: { economy: -0.15, employment: 0, tourism: -0.1 },
        safety: { economy: 0.05, employment: 0.2, tourism: 0 },
        entertainment: { economy: 0.1, employment: 0, tourism: 0.25 },
      },
      regression: 0.15, noise: 2, strongTrend: 8,
      population: { byServices: 0.006, byEmployment: 0.006 },
      effects: {
        health: { recoveryPerPoint: 0.004 },
        nightlife: { formLoss: 0.06, recoveryExtra: 0.4 },
        attendance: { mobility: 0.1, tourismWarm: 0.12, warmMonths: [5, 6, 7, 8, 9] },
        wages: { housing: 0.1 },
        prospects: { education: 0.4, population: 0.15 },
      },
    },
    evolution: {
      regression: 0.2, noise: 3,
      pride: { champion: 8, promotion: 6, relegation: -6 },
      notoriety: { regression: 0.25, byPride: 0.05 },
      culture: { byPride: 0.03, champion: 0.8, promotion: 0.5 },
      population: { byEconomy: 0.012, byPride: 0.004, noisePct: 0.15, maxPct: 3 },
    },
    events: {
      cityProb: 0.12,
      hubProb: 0.1,
      types: {
        factory_closes: { regional: false, weight: { "*": 0.4, IND: 3, LOG: 1, MAR: 1 }, effects: { employment: -12, economy: -8, pride: -3, populationPct: -1.2, safety: -2 } },
        factory_opens: { regional: false, weight: { "*": 0.4, IND: 2, LOG: 2, ENE: 2, SER: 1.5, UNI: 1 }, effects: { employment: 10, economy: 7, populationPct: 1 } },
        european_funds: { regional: true, weight: { "*": 1, INT: 2, AGR: 1.5, FRO: 1.5 }, effects: { employment: 3, economy: 6, tourism: 3, mobility: 3, health: 2, education: 2 } },
        motorway: { regional: true, weight: { "*": 0.5, INT: 2, FRO: 1.5 }, effects: { economy: 4, tourism: 5, populationPct: 0.5, mobility: 8 } },
        festival: { regional: false, weight: { "*": 0.3, TUR: 2, PAT: 2, MAR: 1.5, EMI: 1 }, effects: { tourism: 8, notoriety: 4, pride: 2, entertainment: 5 } },
        bad_farming_year: { regional: false, weight: { "*": 0, AGR: 3, TER: 1 }, effects: { economy: -7, employment: -4 } },
        regional_crisis: { regional: true, weight: { "*": 1 }, effects: { economy: -6, employment: -5, health: -2, education: -1, safety: -2 } },
        fire: { regional: false, weight: { "*": 0.1, INT: 2, AGR: 1.5, FRO: 1 }, effects: { tourism: -6, economy: -4, pride: -2, populationPct: -0.5 } },
        university: { regional: false, weight: { "*": 0, UNI: 3 }, effects: { economy: 4, populationPct: 1.5, notoriety: 2, education: 8, entertainment: 4, housing: -4 } },
        new_hotel: { regional: false, weight: { "*": 0.2, TUR: 3, PAT: 1.5, TER: 1.5, MAR: 1 }, effects: { tourism: 6, employment: 3, housing: -3, entertainment: 2 } },
        new_hospital: { regional: false, weight: { "*": 0.15, UNI: 1.5, SER: 1, TUR: 0.5 }, effects: { health: 12, populationPct: 0.3, pride: 1 } },
        hospital_cuts: { regional: false, weight: { "*": 0.2, INT: 2, FRO: 1.5, AGR: 1.5 }, effects: { health: -10, populationPct: -0.3, pride: -2 } },
        crime_wave: { regional: false, weight: { "*": 0.2, DOR: 2, TUR: 1.5, SER: 1, MUL: 1 }, effects: { safety: -10, tourism: -3, pride: -2 } },
        new_school: { regional: false, weight: { "*": 0.2, UNI: 1, SER: 1, DOR: 1 }, effects: { education: 10, populationPct: 0.2 } },
        transport_works: { regional: false, weight: { "*": 0.2, SER: 1.5, DOR: 1.5, LOG: 1.5, TUR: 1 }, effects: { mobility: 10, economy: 2 } },
        new_venue: { regional: false, weight: { "*": 0.2, TUR: 2, UNI: 2, SER: 1 }, effects: { entertainment: 10, tourism: 2 } },
        rent_surge: { regional: false, weight: { "*": 0.1, TUR: 3, PAT: 1.5, DOR: 1, UNI: 1 }, effects: { housing: -10, tourism: 2 } },
        affordable_housing: { regional: false, weight: { "*": 0.15, DOR: 1.5, SER: 1, UNI: 1 }, effects: { housing: 10, populationPct: 0.3 } },
      },
    },
  },
  locality: { townThreshold: 1500, cityThreshold: 8000, hysteresis: 0.1 },
  match: {
    aptitude: { min: 0.55, unrecorded: 3, gkMin: 0.15, gkUnrecorded: 1 },
    form: { daysWindow: 7, normalWorkload: 90, lossPer90: 0.02, min: 0.9, ret: { initial: 0.88, gainByDay: 0.01 } },
    substitutions: { max: 5, pauses: 3 },
    duration: 90,
    stoppage: { min: 3, max: 8 },
    extraTime: { minutes: 30, stoppage: { min: 1, max: 4 } },
    chancesPerTeam: 24,
    homeAdvantage: 0.9,
    edge: { coachPoints: 0.12, crowdEffect: 0.6, smallStadium: 2000, bigStadium: 60000, capacityWeight: 0.6 },
    controlScale: 4,
    sensitivity: { shot: 0.3, xg: 0.2 },
    baseShotP: 0.42,
    xg: { base: 0.02, amplitude: 0.42, exponent: 4, min: 0.01, max: 0.85 },
    penalty: { xg: 0.76, pPerFoul: 0.012 },
    weight: { finishing: 0.9, goalkeeper: 0.9 },
    blockedP: 0.2,
    onTarget: { base: 0.28, porXg: 1.4, max: 0.95 },
    corners: { pIfBlocked: 0.25, pIfSaved: 0.2, shotP: 0.35, xgFactor: 0.65 },
    fouls: { byTeam: 12, shotFreeP: 0.06 },
    cards: { yellowP: 0.17, penaltyYellowP: 0.5, directRedP: 0.003, penaltyRedP: 0.06, alreadyYellow: { foul: 0.4, card: 0.55 }, sentOffPenalty: { attack: 1.6, control: 1.8, defence: 1.4 } },
    assistedP: 0.72,
    shotWeight: { GK: 0, RB: 0.4, CB: 0.5, LB: 0.4, DM: 0.5, CM: 1.4, AM: 3, RW: 3, LW: 3, ST: 5 },
    attendanceWeight: { GK: 0.05, RB: 1.5, CB: 0.4, LB: 1.5, DM: 1, CM: 3, AM: 3, RW: 2.5, LW: 2.5, ST: 1.2 },
    headingWeight: { GK: 0, RB: 0.4, CB: 3, LB: 0.4, DM: 1, CM: 0.6, AM: 0.4, RW: 0.4, LW: 0.4, ST: 2.5 },
    ratings: { base: 6, min: 3, max: 10, noise: 0.25, goal: 0.9, attendance: 0.5, onTargetShot: 0.1, missedChance: -0.2, missedPenalty: -0.7, foul: -0.08, grantedPenalty: -0.5, defence: 0.2, concededGoals: -0.25, yellow: -0.15, red: -1.2, zeroGoalmouth: 0.5, outcome: 0.3 },
    moments: { bigXg: 0.3 },
  },
  stories: { hattrick: 3, rout: 4, discounts: 3, turnaround: 2, seriousInjury: 4 },
  injuries: {
    pPerMatchPlayer: 0.016,
    risk: { byForm: 2, turf: 0.9, byPhysicalAptitude: 0.03, byMedical: 0.015, opponentPlayFair: [0.75, 0.88, 1, 1.25, 1.5], intensity: 0.07, relapse: 1.2, fatigue: 0.25 },
    severities: [
      { weight: 0.4, days: [3, 10] },
      { weight: 0.33, days: [10, 28] },
      { weight: 0.18, days: [28, 70] },
      { weight: 0.07, days: [70, 180] },
      { weight: 0.02, days: [180, 300] },
    ],
    recoveryPerMedical: 0.02,
    relapseDuration: 1.35,
    relapseWindow: 28,
    trainingPByDay: 0.0009,
    form: { base: 1, byRecentMatch: 0.025, window: 14, por90: 0.015, recoveryByDay: 0.02, onReturn: 0.8, min: 0.7, max: 1.1 },
  },
  preHistory: {
    seasons: 10,
    club: { promoted: 0.08, relegated: 0.08, positionNoise: 0.28 },
    city: { indicatorNoise: 2.5, trendShare: 0.5, populationNoisePct: 0.5 },
  },
  discipline: {
    yellowThresholds: [5, 9, 12, 14],
    directRed: { matches: 1, morePA: 0.35, max: 4 },
    secondYellow: { matches: 1 },
    europe: { yellowEvery: 3 },
  },
  tactic: {
    formation: { attack: 0.7, control: 0.5, defence: 0.6 },
    styles: {
      beautiful: { control: 0.8, attack: 0.1, defence: -0.4, fouls: 0.95, shotCorner: 0.9 },
      balanced: { control: 0, attack: 0, defence: 0, fouls: 1, shotCorner: 1 },
      direct: { control: -0.5, attack: 0.45, defence: 0.15, fouls: 1.12, shotCorner: 1.25 },
      counterAttack: { control: -0.6, attack: 0.1, defence: 0.2, fouls: 1.05, shotCorner: 1 },
    },
    intensity: { control: 0.2, defence: 0.15, fouls: 0.1, fatigue: 1 },
    line: { control: 0.2, attack: 0.2, defence: -0.5 },
    tempo: { chances: 0.06, fatigue: 0.6 },
    mentality: { attack: 0.8, defence: 0.8, control: 0 },
    shooting: { shotLogit: 0.25, xg: 0.07, skill: 0.06 },
    timeWasting: { start: 60, chances: 0.3, cards: 0.3, provoke: 0.25, hurry: 0.1 },
    area: { attack: 0.8, scale: 3 },
    context: { home: 0.2, form: 1, coach: 0.03, min: 0.5, max: 1.5 },
    fairPlay: { fouls: [0.7, 0.85, 1, 1.2, 1.45], defence: [-0.6, -0.3, 0, 0.3, 0.6], cards: [0.5, 0.75, 1, 1.35, 1.8] },
    counterAttack: { attackPerPoint: 1.2, defencePerPoint: 0.4, max: 4 },
    /** Jogo direto: por cada nível de linha defensiva que o adversário tem acima de 3 (bolas nas costas), ganha ataque. */
    attackDirectPerLine: 0.5,
    /** Jogo bonito só rende com técnica: o bónus de controlo e ataque escala com (controlo da equipa − `base`)/`escala`, entre 0 e `max`. */
    beautiful: { base: 7, scale: 3, max: 1.5 },
    fatigue: { max: 3.2, start: 30 },
    coach: { preferenceBonus: 2, favourite: 3 },
  },
  world: {
    talent: { muIndex0: 6.5, muIndex100: 10.5, sigma: 2.4, seasonsIndex0: 0.004, seasonsIndex100: 0.02, alphaPareto: 2.4, scalePareto: 3 },
    targetQuality: {
      firstLeague: { mean: 13, deviation: 1.8 },
      secondLeague: { mean: 11, deviation: 1.8 },
      thirdLeague: { mean: 9.5, deviation: 1.8 },
      cp: { mean: 8, deviation: 1.8 },
      district: { mean: 6.5, deviation: 1.8 },
    },
    qualityByReputation: 5,
    standingReputationWeight: 0.6,
    stars: { centre: 2.5, pointsPerStar: 1, freeAgentTier: "thirdLeague" },
    variationForeignersReputation: 0.35,
    squad: { firstLeague: 28, secondLeague: 26, thirdLeague: 25, cp: 23, district: 20 },
    placesByPosition: { GK: 3, RB: 2, CB: 4, LB: 2, DM: 2, CM: 3, AM: 2, RW: 2, LW: 2, ST: 3 },
    free: 3000,
    staffPerClub: 6,
    foreignLeagues: {
      clubs: { gb: 11, es: 10, de: 9, it: 9, fr: 9, nl: 7, tr: 6, be: 5, gr: 4, hr: 4, rs: 4, ch: 4, se: 4, dk: 4, pl: 4, ua: 4, ro: 4, cz: 3, no: 3, ie: 2, bg: 2, ba: 2 },
      squad: 22,
      rankSpread: 4,
    },
    scouts: { firstLeague: { min: 3, max: 6, chance: 1 }, secondLeague: { min: 2, max: 4, chance: 1 }, thirdLeague: { min: 1, max: 2, chance: 1 }, cp: { min: 1, max: 1, chance: 0.8 }, district: { min: 1, max: 1, chance: 0.4 } },
    others: { businesspeople: 500, fansOfficials: 400, agents: 150, referees: 250, journalists: 200, freeStaff: 500 },
    wage: { average: { firstLeague: 11000, secondLeague: 4200, thirdLeague: 1600, cp: 800, district: 280 }, elasticity: 0.22, yearsContractMin: 1, yearsContractMax: 4 },
    age: { min: 16, max: 38, mean: 26, deviation: 4.5, trainedAtStartMax: 22 },
    peakAge: 27,
    secondaryAptitude: 0.6,
  },
  squadCycle: {
    development: { growthShare: 0.4, yearlyNoise: 0.45, declineAge: 30, declineBase: 0.2, declinePerYear: 0.12, physicalExtra: 0.25, mentalGain: 0.1, offPositionWeight: 0.7 },
    retirement: { fromAge: 33, baseProbability: 0.06, perYear: 0.14, goalkeeperExtraYears: 3, maxAge: 40, freeMultiplier: 1.6 },
    contracts: { yearsMin: 1, yearsMax: 3, renewBase: 0.7, renewPerQualityPoint: 0.1, renewPerOldYear: 0.08, oldAge: 31, renewMin: 0.05, renewMax: 0.95, renewalWageFactor: 1, negotiation: { acceptFloor: 0.92, floorByLoyalty: 0.01, floorNative: 0.04, floorMin: 0.6, askYears: 2, maxRounds: 4, walkAway: 0.5, concession: 0.7, maxYears: 5, clauseWage: 0.08, noClauseRatio: 2.5, clauseCeiling: 2, level: { margin: 1.2, ambitionMin: 12, loyaltyStay: 14 }, distance: { tiers: ["cp", "district"], wageFactor: 1.5, loyaltyStay: 14 } } },
    squad: { slack: 2, freeAgentTolerance: 2.5 },
    youth: { perClub: { firstLeague: 4, secondLeague: 3, thirdLeague: 3, cp: 3, district: 2 }, ageMin: 16, ageMax: 18, targetOffset: 0, hometownProbability: 0.55, nameFamily: "portugal", focus: { spread: 0.4, byPatience: 0.05, byAmbition: 0.03, min: 0.25, max: 1.9 }, agePenalty: 0.25, qualityByFocus: 0.6, potentialByFocus: 1.0, renewalYouthEffect: 0.2, renewalVeteranEffect: 0.12, development: { base: 45, byFocus: 25, byCoach: 1.5, byFinances: 8, byEducation: 0.15, regression: 0.2, maxStep: 1.5, yieldMin: 0.4, yieldMax: 1.0, yieldPivot: 0.7, potentialByYield: 0.15, prideLocal: 0.2 }, prospects: { perCityMean: 5, ageMin: 15, ageMax: 17, popExponent: 0.6, potentialShift: 1, localLockDays: 150 } },
  },
  companies: {
    perCity: { base: 3, perDecade: 4, min: 2 },
    scaleWeight: { local: { base: 1, perDecade: 0 }, regional: { base: 0.3, perDecade: 0.35 }, national: { base: 0.02, perDecade: 0.12 }, international: { base: 0.004, perDecade: 0.04 } },
    capital: { median: { local: 300_000, regional: 3_000_000, national: 50_000_000, international: 600_000_000 }, sigma: 0.9 },
    capitalPerEmployee: { local: 15_000, regional: 60_000, national: 250_000, international: 600_000 },
    city: {
      jobs: { localShare: { local: 1, regional: 0.8, national: 0.25, international: 0.1 }, employmentK: 5, employmentMax: 10, economyK: 4, economyMax: 8, dependence: [0.6, 0.8], eventJobs: 30 },
      partners: { sectors: { health: "health", transport: "mobility", energy: "safety", media: "entertainment" }, k: 8, scale: { local: 0.4, regional: 0.7, national: 1, international: 1 }, max: 8 },
      patron: { dailyChance: 0.012, cooldownDays: 60, validDays: 21, share: { local: 0.03, regional: 0.06, national: 0.1, international: 0.1 }, namingBonus: 1.5, namingYears: 2 },
    },
    evolution: { growth: 0.03, economyEffect: 0.06, sigma: 0.18, closureProbability: 0.012, lowCapitalShare: 0.15, lowCapitalClosure: 0.15, foundingRate: 0.5 },
    sponsorship: {
      slots: { firstLeague: ["shirt", "stadium", "youth"], secondLeague: ["shirt", "stadium", "youth"], thirdLeague: ["shirt", "stadium"], cp: ["shirt", "stadium"], district: ["shirt"] },
      kindShare: { shirt: 0.6, stadium: 0.25, youth: 0.15 },
      valueSigma: 0.15,
      /** Contratos extra por reputação acima da normal do escalão (RZ-311): um a partir de `startRatio`, mais um por cada `perRatio`; cada extra vale `valueShare` do valor de referência do tipo. */
      extra: { startRatio: 1, perRatio: 0.45, max: { firstLeague: 4, secondLeague: 3, thirdLeague: 2, cp: 2, district: 1 }, valueShare: 0.4 },
      maxShareOfCapital: 0.08,
      yearsMin: 1,
      yearsMax: 3,
      renewBase: 0.65,
      renewPromoted: 0.2,
      renewRelegated: -0.3,
      proximity: { city: 1, district: 0.35, elsewhere: 0.04, nationalFloor: 0.5 },
      scaleFit: {
        firstLeague: { local: 0.05, regional: 0.4, national: 1, international: 1.2 },
        secondLeague: { local: 0.2, regional: 1, national: 0.8, international: 0.4 },
        thirdLeague: { local: 0.6, regional: 1, national: 0.3, international: 0.1 },
        cp: { local: 1, regional: 0.8, national: 0.1, international: 0.02 },
        district: { local: 1, regional: 0.35, national: 0.02, international: 0.005 },
      },
    },
  },
  broadcast: {
    national: [
      { sector: "television", scale: "national", capital: 500_000_000 },
      { sector: "television", scale: "national", capital: 350_000_000 },
      { sector: "television", scale: "national", capital: 180_000_000 },
      { sector: "radio", scale: "national", capital: 60_000_000 },
      { sector: "streaming", scale: "international", capital: 900_000_000 },
      { sector: "streaming", scale: "national", capital: 40_000_000 },
    ],
    packageShareOfCommercial: { firstLeague: 0.5, secondLeague: 0.35, thirdLeague: 0.2, cp: 0.08, district: 0.03 },
    bidders: { firstLeague: 4, secondLeague: 3, thirdLeague: 3, cp: 2, district: 2 },
    interest: {
      firstLeague: { television: { local: 0, regional: 0.1, national: 1, international: 1 }, radio: { local: 0, regional: 0.1, national: 0.6, international: 0.6 }, streaming: { local: 0, regional: 0.1, national: 0.8, international: 1.2 } },
      secondLeague: { television: { local: 0, regional: 0.3, national: 0.8, international: 0.6 }, radio: { local: 0.05, regional: 0.4, national: 0.6, international: 0.4 }, streaming: { local: 0.05, regional: 0.4, national: 0.8, international: 0.7 } },
      thirdLeague: { television: { local: 0.05, regional: 0.4, national: 0.3, international: 0.1 }, radio: { local: 0.2, regional: 0.8, national: 0.4, international: 0.1 }, streaming: { local: 0.2, regional: 0.8, national: 0.6, international: 0.3 } },
      cp: { television: { local: 0.05, regional: 0.3, national: 0.1, international: 0.05 }, radio: { local: 0.5, regional: 1, national: 0.2, international: 0.05 }, streaming: { local: 0.5, regional: 1, national: 0.4, international: 0.2 } },
      district: { television: { local: 0, regional: 0.1, national: 0, international: 0 }, radio: { local: 1, regional: 0.6, national: 0.02, international: 0 }, streaming: { local: 0.8, regional: 0.5, national: 0.05, international: 0.02 } },
    },
    bidSigma: 0.2,
    reserve: 0.7,
    incumbentBonus: 0.05,
    maxShareOfCapital: 0.12,
    featuredPerRound: { firstLeague: 3, secondLeague: 2, thirdLeague: 1, cp: 1, district: 1 },
    matchFee: { firstLeague: 15_000, secondLeague: 5_000, thirdLeague: 2_000, cp: 1_000, district: 400 },
    derbyBonus: 0.6,
    interestRange: { min: 0.6, max: 2.5 },
    cup: { featuredPerRound: 2, matchFee: 15_000, superCupFee: 80_000 },
  },
  market: {
    windows: [{ open: [7, 1], close: [9, 1] }, { open: [1, 1], close: [1, 31] }],
    roundWeekday: 1,
    actProbability: 0.45,
    actProbabilityLastDay: 0.9,
    dealsPerRound: 2,
    windowFactor: [1, 0.6],
    winterRefresh: 0.5,
    maxSigningsPerWindow: 8,
    squadSlack: 6,
    ageFactor: [[18, 11.9], [22, 11.2], [25, 9.8], [28, 7.7], [31, 4.2], [34, 1.4], [38, 0.35]],
    potentialPremium: 0.22,
    potentialPremiumAgeMax: 24,
    contractFullMonths: 24,
    contractMinFactor: 0.25,
    askBase: 1.1,
    askByGreed: 0.02,
    bidPremium: 0.12,
    bidNoise: 0.12,
    counterTolerance: 0.55,
    wageSlack: 0.1,
    qualityCeiling: 3.5,
    minUpgrade: 0.6,
    wageRaise: 1.1,
    contractYears: [2, 4],
    saleToBudget: 0.6,
    consent: { up: 0.9, down: 0.35, byAmbition: 0.03, byLoyalty: 0.025, byWageRatio: 0.5 },
    loans: { actProbability: 0.5, maxPerClub: 4, wageShares: [0.5, 0.75, 1], proposalShares: [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.75, 0.8, 0.9, 1], offerChance: 0.01, feeRate: 0.04, prospectAgeMax: 23, prospectGap: 2, lenderMinSquad: 3, recallProbability: 0.5 },
    decision: {
      tier: { firstLeague: 1, secondLeague: 0.72, thirdLeague: 0.48, cp: 0.25, district: 0.08 },
      club: { tier: 0.5, reputation: 0.35, stadium: 0.15 },
      city: { economy: 0.2, employment: 0.12, tourism: 0.12, pride: 0.1, footballCulture: 0.14, notoriety: 0.1, population: 0.22, safety: 0.12, entertainment: 0.08, health: 0.05, mobility: 0.04, housing: 0.06 },
      cityShare: 0.3, byLoyaltyCity: 0.015,
      scale: 5, bias: 0.4, wage: 1.6, home: 0.9, leavingHome: 0.4, playingTime: 0.7, free: 0.9,
      byAmbition: 0.05, byLoyalty: 0.09, minWillingness: 0.15, wagePremiums: [1, 1.3, 1.65, 2],
      listing: { surplus: 1, discount: 0.8, maxPerClub: 3, stressMargin: 0.05 },
      need: { missing: 3, gap: 1 },
      homeScore: 1.2, regionScore: 0.5, prideHome: 0.4, returnHome: { age: 29, bonus: 0.6 }, stepPenalty: 2,
    },
    agents: { share: { firstLeague: 0.85, secondLeague: 0.55, thirdLeague: 0.3, cp: 0.12, district: 0.04 }, popularity: 0.5, commissionRate: 0.08, commissionByGreed: 0.05, wageByGreed: 0.012, consentByGreed: 0.012, consentByLoyalty: 0.015, greedPivot: 14.4, loyaltyPivot: 7 },
    clauses: { releaseProbability: 0.2, releaseByAgentGreed: 0.02, releaseFactor: [1.2, 2.2] },
    training: { ageMax: 23, byTier: { firstLeague: 1.2, secondLeague: 0.8, thirdLeague: 0.4, cp: 0.08, district: 0 } },
    offers: { forSaleChance: 5, forSaleFee: 0.93, dailyChance: 0.012, validDays: 10, feeSpread: [0.85, 1.15], maxMult: 1.3, maxRounds: 3, concession: 0.5, minAge: 16, sameWindowDays: 45, youth: { dailyChance: 0.02, ageMax: 21, minPotential: 14 } },
    news: { minFee: 1500000 },
    bids: { walkAway: 0.6, concession: 0.55, maxRounds: 4, waitDays: 30, suggestionNoise: 0.3, stepBackWage: 1.4, endOfCareerAge: 33, confirmDays: 7, importance: [[0, 1.6], [2, 1.4], [5, 1.2]], qualityPremium: 0.15, closeBonus: 0.85 },
  },
  scouting: {
    reach: { base: 0.03, perScout: 0.06, max: 0.6, foreignFactor: 0.15 },
    perScout: 10,
    days: { week: 7, month: 30, search: 14 },
    cost: { week: 300, month: 900, search: 450, foreignMultiplier: 3 },
    monthBoost: 0.3,
    monthQualityMax: 0.97,
    searchQuality: 0.25,
    search: { results: 10, slack: 1, potentialDiscount: 2, noise: 0.8, reachFactor: 3 },
  },
  knowledge: {
    seasonsAfterOutdated: 2,
    uncertaintyGrowthPerSeason: 0.25,
    worstSigmaQuality: 4,
    bestSigmaQuality: 0.4,
    z: 1.28,
    qualityPerSource: { clubOwn: 0.9, scout: 0.6, agent: 0.4, againstMatch: 0.35, press: 0.15 },
    personality: { labelsMax: 3, lowThreshold: 5, highThreshold: 15, worstSubstitutionProbQuality: 0.35 },
  },
};

/** Valores derivados das regras da pirâmide (DESIGN_REGRAS §1). */
export function derived(p: Params) {
  const { cp, promotion, thirdLeague } = p.pyramid;
  const promotedAtCp = promotion.groups * promotion.promotedPerGroup;
  const cpRise = cp.series * cp.risePerSeries;
  const totalCp = cp.series * cp.clubsPerSeries;
  return {
    promotedAtCp,
    /** Para o CP manter o tamanho: descem tantos quantos entram (promovidos + descidos da Terceira Liga − os que sobem). */
    cpDrop: promotedAtCp + thirdLeague.drop - cpRise,
    totalCp,
    cpOutputPercentage: (cpRise + (promotedAtCp + thirdLeague.drop - cpRise)) / totalCp,
    dropPerMeanSeries: (promotedAtCp + thirdLeague.drop - cpRise) / cp.series,
  };
}

/** Devolve a lista de problemas (vazia se os parâmetros forem coerentes). */
export function validateParameters(p: Params): string[] {
  const errors: string[] = [];
  const ap = p.match.aptitude;
  if (!(ap.min > 0 && ap.min <= 1 && ap.gkMin > 0 && ap.gkMin <= 1)) errors.push("jogo.aptidao.minimo e minimoGR devem estar em (0, 1]");
  if (!(ap.unrecorded >= 1 && ap.unrecorded <= 20 && ap.gkUnrecorded >= 1 && ap.gkUnrecorded <= 20)) errors.push("jogo.aptidao.semRegisto deve estar entre 1 e 20");
  const fm = p.match.form;
  if (!(Number.isInteger(p.match.substitutions.max) && p.match.substitutions.max >= 0 && Number.isInteger(p.match.substitutions.pauses) && p.match.substitutions.pauses >= 0)) errors.push("jogo.substituicoes inválidas");
  if (!(fm.daysWindow >= 1 && fm.normalWorkload >= 0 && fm.lossPer90 >= 0 && fm.min > 0 && fm.min <= 1)) errors.push("jogo.forma inválida");
  if (!(fm.ret.initial > 0 && fm.ret.initial <= 1 && fm.ret.gainByDay >= 0)) errors.push("jogo.forma.regresso inválido");
  const pos = (name: string, v: number) => { if (!(v > 0)) errors.push(`${name} deve ser > 0 (é ${v})`); };
  pos("premios.clube", p.prizes.club);
  pos("premios.cidade", p.prizes.city);
  for (const [k, v] of Object.entries(p.prizes.competitions)) pos(`premios.competicoes.${k}`, v);
  if (!(p.prizes.portugalCupPerRound.factor > 0 && p.prizes.portugalCupPerRound.factor <= 1)) errors.push("premios.tacaPortugalPorRonda.fator deve estar em (0, 1]");
  if (!(p.prizes.beatenFinalist >= 0 && p.prizes.beatenFinalist <= 1)) errors.push("premios.finalistaVencido deve estar em [0, 1]");
  if (!(p.prizes.districtFactor.min > 0 && p.prizes.districtFactor.min <= 1 && p.prizes.districtFactor.max >= 1)) errors.push("premios.fatorDistrito deve ter min em (0, 1] e max >= 1");

  const { pyramid: pi, districtLeagues: d } = p;
  if (pi.promotion.groups !== pi.cp.series) errors.push("promotion.groups deve ser igual a cp.series (cada grupo promove para a sua série)");
  if (pi.promotion.groups * pi.promotion.championsPerGroup !== pi.districts) errors.push("groups × championsPerGroup deve ser igual ao número de distritos");
  if (pi.promotion.promotedPerGroup >= pi.promotion.championsPerGroup) errors.push("promovidosPorGrupo deve ser menor do que campeoesPorGrupo");
  if (pi.firstLeague.drop !== pi.secondLeague.rise) errors.push("primeiraLiga.descem deve ser igual a segundaLiga.sobem");
  if (pi.secondLeague.drop !== pi.thirdLeague.rise) errors.push("segundaLiga.descem deve ser igual a terceiraLiga.sobem");
  if (pi.thirdLeague.drop !== pi.cp.series * pi.cp.risePerSeries) errors.push("terceiraLiga.descem deve ser igual aos que sobem do CP (cp.series × sobemPorSerie)");
  if (!(d.hardMin <= d.min && d.min <= d.target && d.target <= d.max)) errors.push("distritais: minimoDuro ≤ min ≤ alvo ≤ max");

  const dv = derived(p);
  if (dv.cpDrop < 0 || !Number.isInteger(dv.cpDrop)) errors.push("descemDoCp deve ser um inteiro ≥ 0");
  if (!Number.isInteger(dv.dropPerMeanSeries)) errors.push("descemPorSerieMedia deve ser inteiro para manter as séries com o mesmo tamanho");

  if (!(p.standings.winPoints > p.standings.drawPoints && p.standings.drawPoints >= 0))
    errors.push("classificacao: pontosVitoria > pontosEmpate ≥ 0");

  const c = p.calendar;
  const okDate = (d: { month: number; day: number }) => d.month >= 1 && d.month <= 12 && d.day >= 1 && d.day <= 31;
  for (const d of [c.firstRound, c.lastRoundUntil, ...Object.values(c.lastRoundPerTier), ...c.pauses.flatMap((x) => [x.from, x.until])]) if (!okDate(d)) errors.push("calendario: datas com mês 1-12 e dia 1-31");
  for (const [tier, days] of Object.entries(c.matchDays))
    if (days.length === 0 || days.some((x) => x < 0 || x > 6)) errors.push(`calendario.diasDeJogo.${tier}: dias entre 0 e 6, pelo menos um`);
  if (c.cpFinalPhase.seriesAfterDays < 1 || c.cpFinalPhase.roundsBetweenDays < 1) errors.push("calendario: faseFinalCp com intervalos ≥ 1 dia");
  if (!(p.knockoutRounds.penalties.initial >= 1 && p.knockoutRounds.penalties.goalProb > 0 && p.knockoutRounds.penalties.goalProb < 1)) errors.push("knockoutRounds.penalties: initial ≥ 1 e goalProb entre 0 e 1");
  if (!(p.knockoutRounds.penalties.takerSkill >= 0 && p.knockoutRounds.penalties.keeperSkill >= 0)) errors.push("knockoutRounds.penalties: takerSkill e keeperSkill ≥ 0");
  if (!(p.match.extraTime.minutes > 0 && p.match.extraTime.stoppage.min >= 0 && p.match.extraTime.stoppage.min <= p.match.extraTime.stoppage.max)) errors.push("match.extraTime: minutes > 0 e 0 ≤ stoppage.min ≤ max");
  const cup = p.cups.cup;
  for (const [tier, w] of Object.entries(cup.wave)) if (!Number.isInteger(w) || w < 0 || w > 2) errors.push(`cups.cup.wave.${tier}: vaga entre 0 e 2`);
  if (!(cup.finalDaysAfterLeagues >= 1) || !(cup.qualifiersPerDistrictWithoutHistory >= 1)) errors.push("cups.cup: finalDaysAfterLeagues ≥ 1 e qualifiersPerDistrictWithoutHistory ≥ 1");
  const eu = p.europe;
  if (!(eu.size % eu.competitions.conferenceLeague.pots === 0 && eu.size % eu.competitions.championsLeague.pots === 0)) errors.push("europe.size tem de dividir pelos potes");
  if (!(eu.access.seasonsCounted >= 1 && eu.access.bands.length > 0 && eu.access.bands.every((b, i, a) => b.maxRank >= 1 && (i === 0 || b.maxRank > (a[i - 1] as { maxRank: number }).maxRank) && b.championsLeague + b.championsQualifying + b.europaLeague + b.conferenceLeague <= 10))) errors.push("europe.access inválido (faixas por ranking crescente, no máximo 10 vagas)");
  if (eu.calendar.knockoutWeeks.length !== 8 || eu.calendar.leaguePhaseWeeks.length < 9) errors.push("europe.calendar: 8 semanas de eliminatórias (play-off, oitavos, quartos e meias a duas mãos) e pelo menos 9 de fase de liga");
  if (!(eu.calendar.knockoutWeeks.every((w, i, a) => i === 0 || w > (a[i - 1] as number)) && eu.calendar.leaguePhaseWeeks.every((w, i, a) => i === 0 || w > (a[i - 1] as number)) && (eu.calendar.leaguePhaseWeeks.at(-1) as number) < (eu.calendar.knockoutWeeks[0] as number))) errors.push("europe.calendar: semanas crescentes e a fase de liga antes das eliminatórias");
  if (!(p.cups.supercupDaysBeforeFirstRound >= 1) || !(p.cups.districtCup.finalDaysAfterDistrictsEnd >= 1) || !(p.cups.minRestDays >= 1)) errors.push("cups: intervalos ≥ 1 dia");
  if (!(p.cups.nationalStadium.capacity > 0)) errors.push("cups.nationalStadium.capacity > 0");
  if (c.simultaneousFinalRounds < 0) errors.push("calendario: jornadasFinaisSimultaneas ≥ 0");
  for (const m of [c.seasonStartMonth, c.seasonEndMonth]) if (m < 1 || m > 12) errors.push("calendario: meses entre 1 e 12");
  if (c.windows.length === 0) errors.push("calendario: tem de existir pelo menos uma janela de transferências");
  if (p.saves.daysAutosave < 1 || p.saves.rotatingAutosaves < 1) errors.push("saves: autosaveDias e autosavesRotativos ≥ 1");
  if (p.coach.offers < 1 || p.coach.surprises < 0 || p.coach.surpriseMargin < 0) errors.push("treinador: pelo menos 1 oferta, surpresas e margem >= 0");
  if (p.fairPlay.levels < 2 || p.fairPlay.fallback < 1 || p.fairPlay.fallback > p.fairPlay.levels) errors.push("fairPlay: padrao dentro dos níveis");

  for (const [tier, v] of Object.entries(p.foreigners)) if (v < 0 || v > 1) errors.push(`estrangeiros.${tier} entre 0 e 1`);
  const f = p.finances;
  if (!(f.riskMonthsBye < f.tightMonthsBye)) errors.push("financas: folgaMesesRisco < folgaMesesApertado");
  const pr = f.wealthPercentiles;
  if (!(pr[0] > pr[1] && pr[1] > pr[2] && pr[2] > pr[3] && pr[3] > 0 && pr[0] < 100)) errors.push("finances.wealthPercentiles deve ser estritamente decrescente entre 0 e 100");
  if (f.rivalEstimateErrorProb < 0 || f.rivalEstimateErrorProb > 1) errors.push("financas.probErroEstimativaRival entre 0 e 1");
  const k = p.knowledge;
  if (k.seasonsAfterOutdated < 1) errors.push("conhecimento: desatualizadoAposEpocas ≥ 1");
  if (k.uncertaintyGrowthPerSeason < 0) errors.push("conhecimento: crescimentoIncertezaPorEpoca ≥ 0");
  if (!(k.bestSigmaQuality > 0 && k.bestSigmaQuality < k.worstSigmaQuality)) errors.push("conhecimento: 0 < sigmaMelhorQualidade < sigmaPiorQualidade");
  if (!(k.z > 0)) errors.push("conhecimento: z > 0");
  for (const [f, q] of Object.entries(k.qualityPerSource)) if (q < 0 || q > 1) errors.push(`conhecimento.qualidadePorFonte.${f} entre 0 e 1`);
  if (!(k.personality.lowThreshold < k.personality.highThreshold)) errors.push("conhecimento.personalidade: limiarBaixo < limiarAlto");
  if (k.personality.labelsMax < 1) errors.push("conhecimento.personalidade: maxRotulos ≥ 1");
  if (k.personality.worstSubstitutionProbQuality < 0 || k.personality.worstSubstitutionProbQuality > 1) errors.push("conhecimento.personalidade: probTrocaPiorQualidade entre 0 e 1");
  for (const [name, cs] of Object.entries(p.tiebreak)) {
    if (cs[0] !== "points" || new Set(cs).size !== cs.length || !cs.every((c) => CRITERIA.includes(c)) || !["smallerReputation", "lottery"].includes(cs.at(-1) as string))
      errors.push(`desempate.${name}: começa em «pontos», sem repetidos, critérios válidos e acaba em «reputacaoMenor» ou «sorteio»`);
  }
  const nv = p.reputation.levels;
  if (nv.map((n) => n.level).join() !== LEVELS_REPUTATION.join() || nv.at(-1)?.min !== 0 || nv.some((n, i) => i > 0 && n.min >= (nv[i - 1] as { min: number }).min))
    errors.push("reputacao.niveis: mundial → obscuro, `min` estritamente decrescente e o último a 0");
  const hi = p.stories;
  if (!(hi.hattrick >= 2 && hi.rout >= 2 && hi.discounts >= 1 && hi.turnaround >= 1 && hi.seriousInjury >= 1 && hi.seriousInjury <= 5)) errors.push("historias: hattrick ≥ 2, goleada ≥ 2, descontos ≥ 1, reviravolta ≥ 1, lesaoGrave entre 1 e 5");
  const ed = p.match.edge;
  if (!(ed.coachPoints >= 0 && ed.crowdEffect >= 0 && ed.crowdEffect < 1 && ed.smallStadium > 0 && ed.bigStadium > ed.smallStadium && ed.capacityWeight >= 0 && ed.capacityWeight <= 1)) errors.push("jogo.edge inválido");
  const ph = p.preHistory;
  if (!(Number.isInteger(ph.seasons) && ph.seasons >= 0 && ph.club.promoted >= 0 && ph.club.relegated >= 0 && ph.club.promoted + ph.club.relegated < 1 && ph.club.positionNoise >= 0 && ph.city.indicatorNoise >= 0 && ph.city.trendShare >= 0 && ph.city.trendShare <= 1 && ph.city.populationNoisePct >= 0)) errors.push("preHistory inválida");
  const le = p.injuries;
  if (!(le.pPerMatchPlayer >= 0 && le.pPerMatchPlayer <= 1 && le.trainingPByDay >= 0 && le.trainingPByDay <= 1)) errors.push("lesoes: probabilidades entre 0 e 1");
  if (le.severities.length !== 5 || Math.abs(le.severities.reduce((a, g) => a + g.weight, 0) - 1) > 1e-9 || !le.severities.every((g) => g.days[0] >= 1 && g.days[1] >= g.days[0])) errors.push("lesoes.gravidades: 5 níveis, pesos a somar 1 e dias [mín ≥ 1, máx ≥ mín]");
  if (le.risk.opponentPlayFair.length !== 5) errors.push("lesoes.risco.fairPlayAdversario: 5 níveis");
  if (!(le.form.min < le.form.max && le.form.min <= le.form.onReturn && le.form.onReturn <= le.form.max && le.form.base >= le.form.min && le.form.base <= le.form.max)) errors.push("lesoes.forma: min < max e base/aoRegressar dentro dos limites");
  const ln = p.market.loans;
  if (!(ln.actProbability >= 0 && ln.actProbability <= 1 && ln.maxPerClub >= 0 && ln.wageShares.length > 0 && ln.wageShares.every((x) => x > 0 && x <= 1) && ln.proposalShares.length > 0 && ln.proposalShares.every((x) => x > 0 && x <= 1) && ln.offerChance >= 0 && ln.offerChance <= 1 && ln.feeRate >= 0 && ln.recallProbability >= 0 && ln.recallProbability <= 1)) errors.push("market.loans: probabilidades entre 0 e 1, wageShares entre 0 e 1 (sem zero), feeRate ≥ 0");
  const dc = p.market.decision;
  if (!(dc.scale > 0 && dc.minWillingness >= 0 && dc.minWillingness < 1 && dc.wagePremiums.length > 0 && dc.wagePremiums.every((x) => x >= 1) && dc.cityShare >= 0 && dc.cityShare <= 1 && dc.listing.discount > 0 && dc.listing.discount <= 1 && dc.listing.maxPerClub >= 0)) errors.push("market.decision: scale > 0, 0 ≤ minWillingness < 1, wagePremiums ≥ 1, 0 ≤ cityShare ≤ 1, 0 < listing.discount ≤ 1");
  if (!(dc.prideHome >= 0 && dc.prideHome < 1 && dc.returnHome.age > 20 && dc.returnHome.bonus >= 0)) errors.push("market.decision: 0 ≤ prideHome < 1, returnHome.age > 20, returnHome.bonus ≥ 0");
  const yd = p.squadCycle.youth.development;
  if (!(yd.yieldMin > 0 && yd.yieldMin < yd.yieldMax && yd.yieldPivot > 0 && yd.regression > 0 && yd.regression <= 1 && yd.maxStep > 0 && yd.prideLocal >= 0 && yd.prideLocal < 1)) errors.push("squadCycle.youth.development: 0 < yieldMin < yieldMax, yieldPivot > 0, 0 < regression ≤ 1, maxStep > 0, 0 ≤ prideLocal < 1");
  const dis = p.discipline;
  if (!(dis.yellowThresholds.length > 0 && dis.yellowThresholds.every((n, i) => Number.isInteger(n) && n >= 1 && (i === 0 || n > (dis.yellowThresholds[i - 1] as number))) && dis.directRed.matches >= 1 && dis.directRed.max >= dis.directRed.matches && dis.directRed.morePA >= 0 && dis.directRed.morePA < 1 && dis.secondYellow.matches >= 1 && Number.isInteger(dis.europe.yellowEvery) && dis.europe.yellowEvery >= 1)) errors.push("disciplina: limiares de amarelos inteiros, crescentes e ≥ 1, vermelhoDireto.jogos ≥ 1 ≤ max, 0 ≤ pMaisUm < 1, segundoAmarelo.jogos ≥ 1");
  const t = p.tactic;
  if (!(t.timeWasting.start >= 0 && t.timeWasting.chances >= 0 && t.timeWasting.chances < 1 && t.area.scale > 0 && t.context.min > 0 && t.context.min <= 1 && t.context.max >= 1)) errors.push("tatica: urgencia.inicio ≥ 0, urgencia.oportunidades entre 0 e 1, area.escala > 0, contexto.min entre 0 e 1 e max ≥ 1");
  if (t.fairPlay.cards.length !== 5 || !t.fairPlay.cards.every((x) => x > 0)) errors.push("tatica.fairPlay.cartoes: 5 níveis, multiplicadores > 0");
  if (!(t.fairPlay.fouls.length === 5 && t.fairPlay.defence.length === 5 && t.fairPlay.fouls.every((x) => x > 0))) errors.push("tatica.fairPlay: 5 níveis, multiplicadores de faltas > 0");
  if (!(t.fatigue.max >= 0 && t.fatigue.start >= 0 && t.coach.preferenceBonus >= 0 && t.coach.favourite >= 1)) errors.push("tatica: fadiga.max ≥ 0, fadiga.inicio ≥ 0, treinador.bonusPreferencia ≥ 0 e favoritas ≥ 1");
  const j = p.match;
  for (const [n, x] of Object.entries({ yellowP: j.cards.yellowP, penaltyYellowP: j.cards.penaltyYellowP, directRedP: j.cards.directRedP, penaltyRedP: j.cards.penaltyRedP })) if (!(x >= 0 && x <= 1)) errors.push(`match.cards.${n} entre 0 e 1`);
  if (!(j.ratings.min < j.ratings.base && j.ratings.base < j.ratings.max && j.ratings.noise >= 0)) errors.push("jogo.notas: min < base < max e ruido ≥ 0");
  if (!(j.moments.bigXg > 0 && j.moments.bigXg < 1)) errors.push("jogo.momentos.xgGrande entre 0 e 1");
  if (!(j.duration > 0 && j.stoppage.min >= 0 && j.stoppage.min <= j.stoppage.max)) errors.push("jogo: duracao > 0 e 0 ≤ acrescimos.min ≤ max");
  if (!(j.chancesPerTeam > 0 && j.controlScale > 0)) errors.push("jogo: oportunidadesPorEquipa e escalaControlo > 0");
  for (const [n, x] of [["baseShotP", j.baseShotP], ["blockedP", j.blockedP], ["assistedP", j.assistedP], ["penalti.xg", j.penalty.xg], ["penalti.pPorFalta", j.penalty.pPerFoul], ["faltas.pLivreRemate", j.fouls.shotFreeP], ["cantos.pSeBloqueado", j.corners.pIfBlocked], ["cantos.pSeDefendido", j.corners.pIfSaved], ["cantos.pRemate", j.corners.shotP], ["aBaliza.max", j.onTarget.max]] as const)
    if (!(x >= 0 && x <= 1)) errors.push(`match.${n} entre 0 e 1`);
  if (!(j.xg.min > 0 && j.xg.min < j.xg.max && j.xg.max < 1 && j.xg.base >= 0 && j.xg.amplitude > 0 && j.xg.exponent > 0)) errors.push("jogo.xg: 0 < min < max < 1, base ≥ 0, amplitude e expoente > 0");
  for (const t of [j.shotWeight, j.attendanceWeight, j.headingWeight])
    for (const pos of ["GK", "RB", "CB", "LB", "DM", "CM", "AM", "RW", "LW", "ST"]) if (!(((t[pos] as number | undefined) ?? -1) >= 0)) errors.push(`jogo: peso em falta ou negativo para ${pos}`);
  const lo = p.locality;
  if (!(lo.townThreshold > 0 && lo.townThreshold < lo.cityThreshold)) errors.push("localidade: 0 < limiarVila < limiarCidade");
  if (!(lo.hysteresis >= 0 && lo.hysteresis < 0.5)) errors.push("localidade.histerese entre 0 e 0.5");
  if (!(p.inbox.pointsRival >= 0 && p.inbox.placesRival >= 0 && p.inbox.matchesMinRival >= 0)) errors.push("caixa: rivalPontos, rivalLugares e rivalMinJogos ≥ 0");
  const ci = p.city;
  if (!(ci.yearsMunicipalElections >= 1 && ci.sinceTerm > 1900)) errors.push("cidade: eleicoesAutarquicasAnos ≥ 1 e mandatoDesde válido");
  if (!ci.levels.every((x, i) => x > (ci.levels[i - 1] ?? 0) && x < 100)) errors.push("cidade.niveis: quatro cortes crescentes entre 0 e 100");
  if (!(ci.evolution.regression > 0 && ci.evolution.regression <= 1)) errors.push("cidade.evolucao.regressao entre 0 e 1");
  if (!(ci.evolution.population.maxPct > 0)) errors.push("cidade.evolucao.populacao.maxPct > 0");
  if (!(ci.events.cityProb >= 0 && ci.events.cityProb <= 1 && ci.events.hubProb >= 0 && ci.events.hubProb <= 1)) errors.push("cidade.eventos: probabilidades entre 0 e 1");
  for (const t of CITY_EVENT_TYPES) if (!ci.events.types[t]) errors.push(`city.events.types.${t} em falta`);
  for (const [t, e] of Object.entries(ci.events.types)) if (Object.values(e.weight).some((x) => x < 0)) errors.push(`city.events.types.${t}: pesos ≥ 0`);
  const sv = ci.services;
  if (!(sv.regression > 0 && sv.regression <= 1 && sv.strongTrend > ci.trendThreshold && sv.initial.byBudget >= 0)) errors.push("city.services: regression entre 0 e 1, strongTrend > trendThreshold, byBudget ≥ 0");
  if (!(sv.effects.attendance.warmMonths.every((x) => Number.isInteger(x) && x >= 1 && x <= 12) && sv.effects.health.recoveryPerPoint >= 0 && sv.effects.health.recoveryPerPoint * 50 < 0.5)) errors.push("city.services.effects inválido (meses 1-12; recoveryPerPoint × 50 < 0,5)");
  const cn = ci.council;
  if (!(cn.levelCuts.length === 4 && cn.levelCuts.every((x, i, a) => i === 0 || x > (a[i - 1] as number)) && cn.jitter >= 0 && cn.discretionary >= 0 && cn.discretionary < 1 && cn.requests.replyDays[0] >= 1 && cn.requests.replyDays[1] >= cn.requests.replyDays[0] && cn.requests.cooldownDays >= 0 && cn.requests.cofunds[0] === 0 && cn.requests.cofunds.every((x) => x >= 0 && x <= 1) && Object.values(cn.requests.cost).every((x) => x >= 0))) errors.push("city.council inválido (cortes crescentes, prazos, cofinanciamentos entre 0 e 1, custos ≥ 0)");
  const el = cn.election;
  if (!(el.month >= 1 && el.month <= 12 && el.day >= 1 && el.day <= 28 && el.campaignDays >= 1 && el.candidatesBySize.length > 0 && el.candidatesBySize.every(([, n]) => n >= 2) && [el.pIncumbentRuns, el.pExMayorRuns, el.pRetiredPlayer].every((x) => x >= 0 && x <= 1) && Math.abs(el.gamer.pride + el.gamer.notoriety + el.gamer.results + el.gamer.security - 1) < 1e-9 && el.gamer.maxShift >= 0 && el.vote.noise >= 0)) errors.push("city.council.election inválido (mês/dia, campanha ≥ 1, ≥ 2 candidatos, probabilidades 0-1, pesos do gamer somam 1)");
  const prosp = p.squadCycle.youth.prospects;
  if (!(prosp.perCityMean >= 0 && prosp.ageMin >= 14 && prosp.ageMax >= prosp.ageMin && prosp.ageMax <= 18 && prosp.popExponent > 0 && prosp.potentialShift >= 0 && Number.isInteger(prosp.localLockDays) && prosp.localLockDays >= 0)) errors.push("squadCycle.youth.prospects inválido (idades 14-18, expoente > 0)");
  const m = p.world;
  if (!(m.talent.muIndex0 < m.talent.muIndex100 && m.talent.sigma > 0)) errors.push("mundo.talento: muIndice0 < muIndice100 e sigma > 0");
  if (!(m.talent.seasonsIndex0 > 0 && m.talent.seasonsIndex0 <= m.talent.seasonsIndex100 && m.talent.seasonsIndex100 < 1)) errors.push("mundo.talento: 0 < epsIndice0 ≤ epsIndice100 < 1 (a cauda nunca é zero)");
  if (!(m.talent.alphaPareto > 0 && m.talent.scalePareto > 0)) errors.push("mundo.talento: paretoAlfa e paretoEscala > 0");
  for (const [tier, q] of Object.entries(m.targetQuality)) if (!(q.mean >= 1 && q.mean <= 20 && q.deviation > 0)) errors.push(`world.targetQuality.${tier} inválida`);
  if (!(m.stars.pointsPerStar > 0 && m.stars.centre >= 0.5 && m.stars.centre <= 5)) errors.push("world.stars inválido");
  for (const [tier, n] of Object.entries(m.squad)) if (n < 16) errors.push(`world.squad.${tier} ≥ 16`);
  if (!(m.foreignLeagues.squad >= 18 && m.foreignLeagues.rankSpread >= 0 && Object.values(m.foreignLeagues.clubs).every((n) => Number.isInteger(n) && n >= 1))) errors.push("world.foreignLeagues inválido (plantel ≥ 18, clubes ≥ 1 por país)");
  if (Object.values(m.placesByPosition).some((n) => n < 1)) errors.push("mundo.lugaresPorPosicao: pelo menos 1 por posição");
  if (Object.values(m.wage.average).some((x) => !(x > 0)) || m.wage.yearsContractMin < 1 || m.wage.yearsContractMax < m.wage.yearsContractMin) errors.push("mundo.salario inválido");
  if (!(m.age.min < m.age.max && m.age.min >= 15)) errors.push("mundo.idade: 15 ≤ min < max");
  const mk = p.market;
  if (!(mk.windows.length > 0 && mk.maxSigningsPerWindow >= 0 && mk.ageFactor.length >= 2 && mk.contractYears[0] >= 1 && mk.contractYears[1] >= mk.contractYears[0])) errors.push("market inválido");
  const co = p.companies;
  if (!(co.perCity.min >= 1 && co.perCity.base > 0 && co.capital.sigma >= 0)) errors.push("companies.perCity/capital inválido");
  if (!(co.sponsorship.yearsMin >= 1 && co.sponsorship.yearsMax >= co.sponsorship.yearsMin && co.sponsorship.maxShareOfCapital > 0)) errors.push("companies.sponsorship inválido");
  for (const [t, kinds] of Object.entries(co.sponsorship.slots)) if (kinds.length === 0 || kinds.some((k) => !(co.sponsorship.kindShare[k] > 0))) errors.push(`companies.sponsorship.slots.${t} inválido`);
  const sc = p.squadCycle;
  if (!(sc.development.growthShare > 0 && sc.development.growthShare <= 1 && sc.development.yearlyNoise >= 0)) errors.push("squadCycle.development: 0 < growthShare ≤ 1 e yearlyNoise ≥ 0");
  if (!(sc.retirement.fromAge < sc.retirement.maxAge && sc.retirement.baseProbability >= 0 && sc.retirement.baseProbability <= 1)) errors.push("squadCycle.retirement: fromAge < maxAge e baseProbability em [0, 1]");
  if (!(sc.contracts.yearsMin >= 1 && sc.contracts.yearsMax >= sc.contracts.yearsMin && sc.contracts.renewMin <= sc.contracts.renewMax)) errors.push("squadCycle.contracts inválido");
  if (!(sc.youth.ageMin >= 15 && sc.youth.ageMax >= sc.youth.ageMin && sc.squad.slack >= 0)) errors.push("squadCycle.youth/squad inválido");
  if (p.personality.traitMin >= p.personality.traitMax) errors.push("personalidade: tracoMin < tracoMax");
  return errors;
}

type DeepPartial<T> = { [K in keyof T]?: T[K] extends readonly unknown[] ? T[K] : T[K] extends object ? DeepPartial<T[K]> : T[K] };

function merge<T>(base: T, extra: DeepPartial<T> | undefined): T {
  if (extra === undefined || typeof base !== "object" || base === null || Array.isArray(base)) return (extra as T | undefined) ?? base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(extra as Record<string, unknown>)) {
    out[k] = v !== null && typeof v === "object" && !Array.isArray(v) ? merge(out[k], v as never) : v;
  }
  return out as T;
}

/** Cria parâmetros a partir dos padrões com alterações (p. ex. cenários, testes, modos de dificuldade). Lança erro se forem incoerentes. */
export function createParams(changes?: DeepPartial<Params>): Params {
  const p = merge(DEFAULT_PARAMETERS, changes);
  const errors = validateParameters(p);
  if (errors.length > 0) throw new Error("Parâmetros inválidos:\n - " + errors.join("\n - "));
  return p;
}
