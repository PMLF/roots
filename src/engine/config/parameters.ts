/**
 * Parâmetros centrais do jogo (RZ-006). Única fonte de números de regras.
 * Valores iniciais de docs/DESIGN_RULES.md, HISTORICO_EVENTOS §5.1, GERACAO_MUNDO §4,
 * PERSONALIDADE §4 e CIDADE. Tudo isto é para calibrar no harness (RZ-123).
 */

export type Criterion = "points" | "headToHead" | "difference" | "scoredGoals" | "wins" | "smallerReputation" | "lottery";
export type LevelReputation = "worldClass" | "continental" | "national" | "regional" | "local" | "obscure";
export const LEVELS_REPUTATION: readonly LevelReputation[] = ["worldClass", "continental", "national", "regional", "local", "obscure"];
export const CRITERIA: readonly Criterion[] = ["points", "headToHead", "difference", "scoredGoals", "wins", "smallerReputation", "lottery"];

export type Tier = "firstLeague" | "secondLeague" | "thirdLeague" | "cp" | "district";


/** Acontecimentos que mexem com uma cidade (ou com todas as de um polo) ao fim de cada época. */
export type CityEventType =
  | "factory_closes" | "factory_opens" | "european_funds" | "motorway" | "festival"
  | "bad_farming_year" | "regional_crisis" | "fire" | "university" | "new_hotel";
export const CITY_EVENT_TYPES: readonly CityEventType[] = [
  "factory_closes", "factory_opens", "european_funds", "motorway", "festival",
  "bad_farming_year", "regional_crisis", "fire", "university", "new_hotel",
];
export type CityEffects = { employment?: number; economy?: number; tourism?: number; pride?: number; notoriety?: number; populationPct?: number };
export type CfgCityEvent = {
  /** Atinge todos os concelhos do polo (e não só um). */
  regional: boolean;
  /** Peso por setor (principal a 100 %, secundário a 50 %); `*` é o peso por omissão. */
  weight: Record<string, number>;
  effects: CityEffects;
};
export type CityParameters = {
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
export type FinancesModel = {
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
      portugalCup: number; superCup: number; districtCup: number;
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
    pauses: { reason: string; de: { month: number; day: number }; until: { month: number; day: number } }[];
    /** Dias da semana de jogo por escalão (0 = domingo … 6 = sábado); os jogos de uma jornada repartem-se por eles. */
    matchDays: Record<Tier, number[]>;
    /** As últimas N jornadas jogam-se todas no mesmo dia. */
    simultaneousFinalRounds: number;
    /** Fase final do CP (meias-finais e final entre os campeões das séries; domingos): dias depois da última jornada das séries e entre rondas. Tem de acabar em maio. */
    cpFinalPhase: { seriesAfterDays: number; roundsBetweenDays: number };
  };
  saves: { daysAutosave: number; rotatingAutosaves: number; saveAtSeasonStart: boolean };
  fairPlay: { levels: number; fallback: number };
  /** Jogos a eliminar: se acabam empatados, decide-se nos penáltis (série inicial de `iniciais` cobranças por equipa, depois morte súbita). */
  knockoutRounds: { penalties: { initial: number; goalProb: number } };
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
    budget: { revenueAboutBill: number; monthsReserve: number; transfersBye: number };
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
    /** Oportunidades por equipa num jogo equilibrado (o total do jogo é o dobro). */
    chancesPerTeam: number;
    /** Vantagem de jogar em casa, em pontos de "controlo" (1-20). */
    homeAdvantage: number;
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
  discipline: {
    /** Amarelos acumulados que dão um jogo de suspensão (de 5 em 5). */
    yellowsPerSuspension: number;
    /** Vermelho direto: `jogos` de base; com probabilidade `pMaisUm` mais um jogo, repetido até ao máximo `max`. */
    directRed: { matches: number; morePA: number; max: number };
    /** Vermelho por segundo amarelo: jogos de suspensão. */
    secondYellow: { matches: number };
  };
  /** Táticas (RZ-108; docs/GAME_ENGINE.md §7). Efeitos em pontos da escala 1-20 de força, ou multiplicadores. */
  tactic: {
    /** Pontos por unidade de «linha» a mais que o 4-3-3 (atacantes = PL + metade de extremos e MO; meio = MC, MDC + metade de extremos e MO). */
    formation: { attack: number; control: number; defence: number };
    styles: Record<"beautiful" | "balanced" | "direct" | "counterAttack", { control: number; attack: number; defence: number; fouls: number; shotCorner: number }>;
    /** Efeito de cada nível acima (+) ou abaixo (−) do 3 (normal). */
    intensity: { control: number; defence: number; fouls: number; fatigue: number };
    line: { control: number; attack: number; defence: number };
    tempo: { chances: number; fatigue: number };
    /** Multiplicador das faltas e pontos de defesa por nível de fair play (1 = cavalheiro … 5 = agressivo). */
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
    /** Variação relativa (±) do % de estrangeiros com a reputação do clube dentro do escalão (0,35 → de −35 % a +35 % da média do escalão). */
    variationForeignersReputation: number;
    /** Tamanho do plantel por escalão. */
    squad: Record<Tier, number>;
    /** Lugares por posição num plantel-base de 25 (escala-se para o tamanho do plantel). */
    placesByPosition: Record<"GK" | "RB" | "CB" | "LB" | "DM" | "CM" | "AM" | "RW" | "LW" | "ST", number>;
    /** Jogadores sem clube e pessoas fora do plantel. */
    free: number;
    staffPerClub: number;
    /** Pessoas fora dos plantéis (GERACAO_MUNDO §1). */
    others: { businesspeople: number; fansOfficials: number; agents: number; referees: number; journalists: number; freeStaff: number };
    /** Salário mensal (€) de um jogador médio do escalão e elasticidade por ponto de qualidade (exp). */
    wage: { average: Record<Tier, number>; elasticity: number; yearsContractMin: number; yearsContractMax: number };
    age: { min: number; max: number; mean: number; deviation: number };
    /** Idade a partir da qual o potencial deixa de crescer (potencial = atual aos X anos). */
    peakAge: number;
    /** Aptidão (1-20) nas posições alternativas relativamente à principal. */
    secondaryAptitude: number;
  };
  /** O que se sabe sobre os outros (HISTORICO_EVENTOS §5.B, PERSONALIDADE §7). */
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
    competitions: { firstLeague: 10_000_000, secondLeague: 2_000_000, thirdLeague: 500_000, cpSeries: 100_000, cpWinner: 100_000, district: 5_000, promotionPhase: 10_000, portugalCup: 2_000_000, superCup: 500_000, districtCup: 5_000 },
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
      { reason: "seleções (setembro)", de: { month: 9, day: 4 }, until: { month: 9, day: 10 } },
      { reason: "seleções (outubro)", de: { month: 10, day: 9 }, until: { month: 10, day: 15 } },
      { reason: "seleções (novembro)", de: { month: 11, day: 13 }, until: { month: 11, day: 19 } },
      { reason: "Natal", de: { month: 12, day: 22 }, until: { month: 1, day: 2 } },
      { reason: "seleções (março)", de: { month: 3, day: 20 }, until: { month: 3, day: 26 } },
    ],
    matchDays: { firstLeague: [6, 0], secondLeague: [6, 0], thirdLeague: [6, 0], cp: [0], district: [0] },
    simultaneousFinalRounds: 1,
    cpFinalPhase: { seriesAfterDays: 7, roundsBetweenDays: 7 },
  },
  saves: { daysAutosave: 7, rotatingAutosaves: 3, saveAtSeasonStart: true },
  fairPlay: { levels: 5, fallback: 3 },
  knockoutRounds: { penalties: { initial: 5, goalProb: 0.76 } },
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
    budget: { revenueAboutBill: 0.7, monthsReserve: 3, transfersBye: 0.35 },
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
    yearsMunicipalElections: 4,
    sinceTerm: 2025,
    levels: [20, 40, 60, 80],
    trendThreshold: 4,
    sectors: {
      TUR: { employment: 4, economy: 6, tourism: 30, populationPct: 0.2 },
      MAR: { tourism: 12, populationPct: -0.2 },
      IND: { employment: 8, economy: 8, tourism: -8, populationPct: 0.2 },
      AGR: { employment: -4, economy: -6, tourism: -6, populationPct: -0.4 },
      UNI: { employment: 5, economy: 6, tourism: 4, populationPct: 0.6 },
      LOG: { employment: 6, economy: 6, populationPct: 0.3 },
      PAT: { tourism: 20 },
      INT: { employment: -8, economy: -10, tourism: -4, populationPct: -0.8 },
      FRO: { employment: -2, economy: -2, populationPct: -0.3 },
      TER: { tourism: 14 },
      EMI: { employment: -2, economy: 2, tourism: 4, populationPct: -0.3 },
      DOR: { employment: 2, tourism: -10, populationPct: 0.9 },
      ENE: { employment: 4, economy: 14, populationPct: 0.2 },
      SER: { employment: 8, economy: 10, tourism: 2, populationPct: 0.4 },
      MUL: { populationPct: 0.8 },
      ILH: { employment: -2, economy: -2, tourism: 10 },
    },
    initial: {
      base: 50, noise: 6, byEconomyDecade: 8, byEmploymentDecade: 3,
      pride: { base: 35, byReputation: 40, noise: 5 },
      notoriety: { base: 15, byReputation: 55, byDecade: 8, noise: 4 },
      reputationMax: 10000,
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
        factory_closes: { regional: false, weight: { "*": 0.4, IND: 3, LOG: 1, MAR: 1 }, effects: { employment: -12, economy: -8, pride: -3, populationPct: -1.2 } },
        factory_opens: { regional: false, weight: { "*": 0.4, IND: 2, LOG: 2, ENE: 2, SER: 1.5, UNI: 1 }, effects: { employment: 10, economy: 7, populationPct: 1 } },
        european_funds: { regional: true, weight: { "*": 1, INT: 2, AGR: 1.5, FRO: 1.5 }, effects: { employment: 3, economy: 6, tourism: 3 } },
        motorway: { regional: true, weight: { "*": 0.5, INT: 2, FRO: 1.5 }, effects: { economy: 4, tourism: 5, populationPct: 0.5 } },
        festival: { regional: false, weight: { "*": 0.3, TUR: 2, PAT: 2, MAR: 1.5, EMI: 1 }, effects: { tourism: 8, notoriety: 4, pride: 2 } },
        bad_farming_year: { regional: false, weight: { "*": 0, AGR: 3, TER: 1 }, effects: { economy: -7, employment: -4 } },
        regional_crisis: { regional: true, weight: { "*": 1 }, effects: { economy: -6, employment: -5 } },
        fire: { regional: false, weight: { "*": 0.1, INT: 2, AGR: 1.5, FRO: 1 }, effects: { tourism: -6, economy: -4, pride: -2, populationPct: -0.5 } },
        university: { regional: false, weight: { "*": 0, UNI: 3 }, effects: { economy: 4, populationPct: 1.5, notoriety: 2 } },
        new_hotel: { regional: false, weight: { "*": 0.2, TUR: 3, PAT: 1.5, TER: 1.5, MAR: 1 }, effects: { tourism: 6, employment: 3 } },
      },
    },
  },
  locality: { townThreshold: 1500, cityThreshold: 8000, hysteresis: 0.1 },
  match: {
    aptitude: { min: 0.55, unrecorded: 3, gkMin: 0.15, gkUnrecorded: 1 },
    form: { daysWindow: 7, normalWorkload: 90, lossPer90: 0.03, min: 0.85, ret: { initial: 0.88, gainByDay: 0.01 } },
    substitutions: { max: 5, pauses: 3 },
    duration: 90,
    stoppage: { min: 3, max: 8 },
    chancesPerTeam: 24,
    homeAdvantage: 0.9,
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
  discipline: {
    yellowsPerSuspension: 5,
    directRed: { matches: 1, morePA: 0.35, max: 4 },
    secondYellow: { matches: 1 },
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
    qualityByReputation: 2,
    variationForeignersReputation: 0.35,
    squad: { firstLeague: 28, secondLeague: 26, thirdLeague: 25, cp: 23, district: 20 },
    placesByPosition: { GK: 3, RB: 2, CB: 4, LB: 2, DM: 2, CM: 3, AM: 2, RW: 2, LW: 2, ST: 3 },
    free: 3000,
    staffPerClub: 6,
    others: { businesspeople: 500, fansOfficials: 400, agents: 150, referees: 250, journalists: 200, freeStaff: 500 },
    wage: { average: { firstLeague: 9000, secondLeague: 3500, thirdLeague: 1400, cp: 700, district: 250 }, elasticity: 0.22, yearsContractMin: 1, yearsContractMax: 4 },
    age: { min: 16, max: 38, mean: 26, deviation: 4.5 },
    peakAge: 27,
    secondaryAptitude: 0.6,
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
  for (const d of [c.firstRound, c.lastRoundUntil, ...Object.values(c.lastRoundPerTier), ...c.pauses.flatMap((x) => [x.de, x.until])]) if (!okDate(d)) errors.push("calendario: datas com mês 1-12 e dia 1-31");
  for (const [tier, days] of Object.entries(c.matchDays))
    if (days.length === 0 || days.some((x) => x < 0 || x > 6)) errors.push(`calendario.diasDeJogo.${tier}: dias entre 0 e 6, pelo menos um`);
  if (c.cpFinalPhase.seriesAfterDays < 1 || c.cpFinalPhase.roundsBetweenDays < 1) errors.push("calendario: faseFinalCp com intervalos ≥ 1 dia");
  if (!(p.knockoutRounds.penalties.initial >= 1 && p.knockoutRounds.penalties.goalProb > 0 && p.knockoutRounds.penalties.goalProb < 1)) errors.push("eliminatorias.penaltis: iniciais ≥ 1 e probGolo entre 0 e 1");
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
  const le = p.injuries;
  if (!(le.pPerMatchPlayer >= 0 && le.pPerMatchPlayer <= 1 && le.trainingPByDay >= 0 && le.trainingPByDay <= 1)) errors.push("lesoes: probabilidades entre 0 e 1");
  if (le.severities.length !== 5 || Math.abs(le.severities.reduce((a, g) => a + g.weight, 0) - 1) > 1e-9 || !le.severities.every((g) => g.days[0] >= 1 && g.days[1] >= g.days[0])) errors.push("lesoes.gravidades: 5 níveis, pesos a somar 1 e dias [mín ≥ 1, máx ≥ mín]");
  if (le.risk.opponentPlayFair.length !== 5) errors.push("lesoes.risco.fairPlayAdversario: 5 níveis");
  if (!(le.form.min < le.form.max && le.form.min <= le.form.onReturn && le.form.onReturn <= le.form.max && le.form.base >= le.form.min && le.form.base <= le.form.max)) errors.push("lesoes.forma: min < max e base/aoRegressar dentro dos limites");
  const dis = p.discipline;
  if (!(Number.isInteger(dis.yellowsPerSuspension) && dis.yellowsPerSuspension >= 1 && dis.directRed.matches >= 1 && dis.directRed.max >= dis.directRed.matches && dis.directRed.morePA >= 0 && dis.directRed.morePA < 1 && dis.secondYellow.matches >= 1)) errors.push("disciplina: amarelosPorSuspensao inteiro ≥ 1, vermelhoDireto.jogos ≥ 1 ≤ max, 0 ≤ pMaisUm < 1, segundoAmarelo.jogos ≥ 1");
  const t = p.tactic;
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
  const m = p.world;
  if (!(m.talent.muIndex0 < m.talent.muIndex100 && m.talent.sigma > 0)) errors.push("mundo.talento: muIndice0 < muIndice100 e sigma > 0");
  if (!(m.talent.seasonsIndex0 > 0 && m.talent.seasonsIndex0 <= m.talent.seasonsIndex100 && m.talent.seasonsIndex100 < 1)) errors.push("mundo.talento: 0 < epsIndice0 ≤ epsIndice100 < 1 (a cauda nunca é zero)");
  if (!(m.talent.alphaPareto > 0 && m.talent.scalePareto > 0)) errors.push("mundo.talento: paretoAlfa e paretoEscala > 0");
  for (const [tier, q] of Object.entries(m.targetQuality)) if (!(q.mean >= 1 && q.mean <= 20 && q.deviation > 0)) errors.push(`world.targetQuality.${tier} inválida`);
  for (const [tier, n] of Object.entries(m.squad)) if (n < 16) errors.push(`world.squad.${tier} ≥ 16`);
  if (Object.values(m.placesByPosition).some((n) => n < 1)) errors.push("mundo.lugaresPorPosicao: pelo menos 1 por posição");
  if (Object.values(m.wage.average).some((x) => !(x > 0)) || m.wage.yearsContractMin < 1 || m.wage.yearsContractMax < m.wage.yearsContractMin) errors.push("mundo.salario inválido");
  if (!(m.age.min < m.age.max && m.age.min >= 15)) errors.push("mundo.idade: 15 ≤ min < max");
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
