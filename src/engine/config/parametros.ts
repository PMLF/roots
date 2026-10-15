/**
 * Parâmetros centrais do jogo (RZ-006). Única fonte de números de regras.
 * Valores iniciais de docs/DESIGN_REGRAS.md, HISTORICO_EVENTOS §5.1, GERACAO_MUNDO §4,
 * PERSONALIDADE §4 e CIDADE. Tudo isto é para calibrar no harness (RZ-123).
 */

export type Escalao = "primeiraLiga" | "segundaLiga" | "terceiraLiga" | "cp" | "distrital";

export type Parametros = {
  versao: 1;
  premios: {
    /** Prémio do Estado ao melhor classificado de cada distrito (uso livre). */
    clube: number;
    /** Prémio ao concelho (Câmara) do clube premiado. */
    cidade: number;
  };
  piramide: {
    primeiraLiga: { clubes: number; descem: number };
    segundaLiga: { clubes: number; sobem: number; descem: number };
    terceiraLiga: { clubes: number; sobem: number; descem: number };
    cp: { series: number; clubesPorSerie: number; sobemPorSerie: number };
    promocao: { grupos: number; campeoesPorGrupo: number; promovidosPorGrupo: number; voltas: 1 | 2 };
    distritos: number;
  };
  distritais: { alvo: number; min: number; max: number; minimoDuro: number };
  /** Pontos por resultado nas classificações de liga. */
  classificacao: { pontosVitoria: number; pontosEmpate: number };
  calendario: {
    mesInicioEpoca: number;
    mesFimEpoca: number;
    janelas: { abre: { mes: number; dia: number }; fecha: { mes: number; dia: number } }[];
    diasPorAvanco: number;
    /** A época 1 começa em agosto deste ano (2026 → 2026/27). */
    anoInicial: number;
    /** Dia a partir do qual se procura o primeiro sábado de jornada. */
    primeiraJornada: { mes: number; dia: number };
    /** Último dia em que pode haver jornadas das ligas (a Fase de Promoção joga-se depois). */
    ultimaJornadaAte: { mes: number; dia: number };
    /** Fins de semana sem jogos (inclusivo). `de` em agosto-dezembro é do ano em que a época começa; em janeiro-julho, do seguinte. */
    pausas: { motivo: string; de: { mes: number; dia: number }; ate: { mes: number; dia: number } }[];
    /** Dias da semana de jogo por escalão (0 = domingo … 6 = sábado); os jogos de uma jornada repartem-se por eles. */
    diasDeJogo: Record<Escalao, number[]>;
    /** As últimas N jornadas jogam-se todas no mesmo dia. */
    jornadasFinaisSimultaneas: number;
  };
  saves: { autosaveDias: number; autosavesRotativos: number; guardarNoInicioDeEpoca: boolean };
  fairPlay: { niveis: number; padrao: number };
  /** Percentagem média de estrangeiros nos plantéis, por escalão (GERACAO_MUNDO §4). */
  estrangeiros: Record<Escalao, number>;
  assistencia: {
    multFinal: number;
    multDecisaoSubidaDescida: number;
    derbi: number;
    derbiMutuo: number;
    derbiRegionalVisitantes: number;
    grandeVisitanteCoef: number;
  };
  financas: {
    /** Meses de folga: abaixo de `risco` = "Em risco", abaixo de `apertado` = "Apertado". */
    folgaMesesRisco: number;
    folgaMesesApertado: number;
    dividaSobreReceitaFalencia: number;
    mesesSalariosAtrasoFalencia: number;
    /** Percentis (do mais alto ao mais baixo) que separam as 5 bandas de riqueza. */
    percentisRiqueza: [number, number, number, number];
    probErroEstimativaRival: number;
  };
  personalidade: {
    tracoMin: number;
    tracoMax: number;
    memoria: { meiaVidaPositivaMeses: number; negativaBaseMeses: number; negativaPorPaciencia: number; maxPorPessoa: number };
  };
  cidade: { eleicoesAutarquicasAnos: number };
  /** Estatuto das localidades (RZ-136; docs/CIDADE.md §6b): limiares de população com histerese. */
  localidade: { limiarVila: number; limiarCidade: number; histerese: number };
  /** Motor de jogo por oportunidades (RZ-104; docs/MOTOR_JOGO.md). Escalas de atributos: 1-20. */
  jogo: {
    /** Minutos regulares e acréscimos (total, sorteado por jogo). */
    duracao: number;
    acrescimos: { min: number; max: number };
    /** Oportunidades por equipa num jogo equilibrado (o total do jogo é o dobro). */
    oportunidadesPorEquipa: number;
    /** Vantagem de jogar em casa, em pontos de "controlo" (1-20). */
    vantagemCasa: number;
    /** Pontos de diferença de controlo que dão ~73 % das oportunidades ao mais forte. */
    escalaControlo: number;
    /** Quanto a diferença ataque-defesa (em pontos de atributo) pesa no remate e no xG. */
    sensibilidade: { remate: number; xg: number };
    pRemateBase: number;
    /** xG de uma oportunidade: base + amplitude · u^expoente, com u uniforme. Média ≈ base + amplitude/(expoente+1). */
    xg: { base: number; amplitude: number; expoente: number; min: number; max: number };
    penalti: { xg: number; pPorFalta: number };
    /** Peso do finalizador e do guarda-redes na probabilidade de golo (em unidades de logit por 10 pontos de atributo). */
    peso: { finalizacao: number; guardaRedes: number };
    pBloqueado: number;
    aBaliza: { base: number; porXg: number; max: number };
    cantos: { pSeBloqueado: number; pSeDefendido: number; pRemate: number; fatorXg: number };
    faltas: { porEquipa: number; pLivreRemate: number };
    /** Cartões (RZ-106). Probabilidades por falta, antes dos multiplicadores de fair play e agressividade do infrator. */
    cartoes: {
      pAmarelo: number;
      /** Falta que dá penálti. */
      pAmareloPenalti: number;
      pVermelhoDireto: number;
      pVermelhoPenalti: number;
      /** Quem já tem amarelo joga com mais cuidado: fator no peso para cometer a falta e na probabilidade de novo cartão. */
      jaAmarelo: { falta: number; cartao: number };
      /** Pontos de ataque, controlo e defesa que a equipa perde por cada jogador expulso. */
      penalizacaoExpulso: { ataque: number; controlo: number; defesa: number };
    };
    pAssistido: number;
    /** Peso de cada posição a rematar, a assistir e a cabecear (cantos). */
    pesoRemate: Record<string, number>;
    pesoAssistencia: Record<string, number>;
    pesoCabeceamento: Record<string, number>;
    /** Notas dos jogadores (RZ-105), escala 1-10. Valores somados à nota base. */
    notas: {
      base: number;
      min: number;
      max: number;
      /** Variação aleatória estável (±) por jogador e jogo. */
      ruido: number;
      golo: number;
      assistencia: number;
      /** Remate à baliza que não é golo (defendido). */
      remateABaliza: number;
      /** Grande ocasião falhada (xG ≥ momentos.xgGrande). */
      ocasiaoFalhada: number;
      penaltiFalhado: number;
      falta: number;
      penaltiConcedido: number;
      /** Por defesa do guarda-redes. */
      defesa: number;
      /** Por golo sofrido, para defesas e guarda-redes (GR, DD, DC, DE; MDC a metade). */
      golosSofridos: number;
      amarelo: number;
      vermelho: number;
      /** Baliza a zero: bónus para GR, DD, DC, DE (MDC a metade). */
      balizaZero: number;
      /** Bónus de vitória e penalização de derrota para todos os onze. */
      resultado: number;
    };
    /** Momentos-chave do jogo (RZ-105). */
    momentos: { xgGrande: number };
  };
  /** Lesões e forma (RZ-107; docs/MOTOR_JOGO.md §9). */
  lesoes: {
    /** Probabilidade base de um jogador se lesionar num jogo de 90 minutos (equipa e adversário normais, relvado médio). */
    pPorJogadorJogo: number;
    /** Multiplicadores do risco. */
    risco: {
      /** Por ponto de «forma» abaixo de 1 (fadiga, calendário apertado). */
      porForma: number;
      /** Relvado 0 (péssimo) … 1 (perfeito): risco ×(1 + (0,5 − relvado) · `relvado`). */
      relvado: number;
      /** Por ponto de aptidão física abaixo de 10 (acima de 10 baixa o risco). */
      porAptidaoFisica: number;
      /** Por ponto de qualidade médica abaixo de 10 (staff médico melhor, menos lesões). */
      porMedico: number;
      /** Fair play do adversário (1 cavalheiro … 5 agressivo). */
      fairPlayAdversario: number[];
      /** Por nível de intensidade da própria equipa acima de 3. */
      intensidade: number;
      /** Acrescento ao risco de quem regressou há pouco da mesma lesão (recaída). */
      recaida: number;
      /** Quanto o cansaço (pontos de força perdidos) soma ao risco, por ponto. */
      fadiga: number;
    };
    /** Distribuição das gravidades (1 ligeira … 5 gravíssima), somam 1, e dias de paragem [mín, máx] de cada uma. */
    gravidades: { peso: number; dias: [number, number] }[];
    /** Por ponto de qualidade médica acima de 10, encurta a paragem (e alonga abaixo). */
    recuperacaoPorMedico: number;
    /** Uma recaída dura mais. */
    duracaoRecaida: number;
    /** Dias após o regresso em que ainda se está em risco de recaída. */
    janelaRecaida: number;
    /** Probabilidade diária de lesão em treino (jogador com forma 1, relvado/staff normais). */
    pTreinoPorDia: number;
    /** Forma (0,7-1,1): calendário e descanso. */
    forma: {
      /** Valor de um jogador descansado. */
      base: number;
      /** Perda por jogo nos últimos `janela` dias (além do primeiro). */
      porJogoRecente: number;
      janela: number;
      /** Perda por cada 90 minutos jogados nos últimos `janela` dias. */
      por90: number;
      /** Ganho por dia de descanso desde o último jogo, até `base`. */
      recuperacaoPorDia: number;
      /** Forma de quem regressa de lesão, a crescer `recuperacaoPorDia` por dia. */
      aoRegressar: number;
      min: number;
      max: number;
    };
  };
  /** Castigos disciplinares (RZ-106; docs/MOTOR_JOGO.md §8). Contam por competição e época. */
  disciplina: {
    /** Amarelos acumulados que dão um jogo de suspensão (de 5 em 5). */
    amarelosPorSuspensao: number;
    /** Vermelho direto: `jogos` de base; com probabilidade `pMaisUm` mais um jogo, repetido até ao máximo `max`. */
    vermelhoDireto: { jogos: number; pMaisUm: number; max: number };
    /** Vermelho por segundo amarelo: jogos de suspensão. */
    segundoAmarelo: { jogos: number };
  };
  /** Táticas (RZ-108; docs/MOTOR_JOGO.md §7). Efeitos em pontos da escala 1-20 de força, ou multiplicadores. */
  tatica: {
    /** Pontos por unidade de «linha» a mais que o 4-3-3 (atacantes = PL + metade de extremos e MO; meio = MC, MDC + metade de extremos e MO). */
    formacao: { ataque: number; controlo: number; defesa: number };
    estilos: Record<"bonito" | "equilibrado" | "direto" | "contraAtaque", { controlo: number; ataque: number; defesa: number; faltas: number; cantoRemate: number }>;
    /** Efeito de cada nível acima (+) ou abaixo (−) do 3 (normal). */
    intensidade: { controlo: number; defesa: number; faltas: number; fadiga: number };
    linha: { controlo: number; ataque: number; defesa: number };
    ritmo: { oportunidades: number; fadiga: number };
    /** Multiplicador das faltas e pontos de defesa por nível de fair play (1 = cavalheiro … 5 = agressivo). */
    fairPlay: { faltas: number[]; defesa: number[]; /** Multiplicador da probabilidade de cartão. */ cartoes: number[] };
    bonito: { base: number; escala: number; max: number };
    diretoAtaquePorLinha: number;
    /** Contra-ataque: por cada ponto de controlo que o adversário tem a mais (até `max`), ganha ataque e defesa. */
    contraAtaque: { ataquePorPonto: number; defesaPorPonto: number; max: number };
    /** Cansaço: pontos de força perdidos no fim do jogo por uma equipa com intensidade e ritmo máximos; começa a contar a partir do minuto `inicio`. */
    fadiga: { max: number; inicio: number };
    /** Treinador (RZ-108): quanto uma formação favorita vale, em pontos de qualidade média do onze, para um treinador totalmente teimoso. */
    treinador: { bonusPreferencia: number; favoritas: number };
  };
  /** Geração do mundo e das pessoas (GERACAO_MUNDO, MODELO_DADOS §15). */
  mundo: {
    talento: {
      /** Qualidade média (1-20) de um país de índice 0 e de índice 100. */
      muIndice0: number;
      muIndice100: number;
      sigma: number;
      /** Probabilidade de cauda (talento improvável) para índice 0 e 100; nunca zero. */
      epsIndice0: number;
      epsIndice100: number;
      /** Expoente da cauda de Pareto e escala (pontos de qualidade somados = escala × (pareto − 1)). */
      paretoAlfa: number;
      paretoEscala: number;
    };
    /** Qualidade-alvo atual (1-20) do plantel por escalão. */
    qualidadeAlvo: Record<Escalao, { media: number; desvio: number }>;
    /** Quanto a reputação do clube (0-10000) desloca a qualidade-alvo dentro do escalão, em pontos de qualidade para ±metade da amplitude. */
    qualidadePorReputacao: number;
    /** Variação relativa (±) do % de estrangeiros com a reputação do clube dentro do escalão (0,35 → de −35 % a +35 % da média do escalão). */
    estrangeirosVariacaoReputacao: number;
    /** Tamanho do plantel por escalão. */
    plantel: Record<Escalao, number>;
    /** Lugares por posição num plantel-base de 25 (escala-se para o tamanho do plantel). */
    lugaresPorPosicao: Record<"GR" | "DD" | "DC" | "DE" | "MDC" | "MC" | "MO" | "ED" | "EE" | "PL", number>;
    /** Jogadores sem clube e pessoas fora do plantel. */
    livres: number;
    staffPorClube: number;
    /** Pessoas fora dos plantéis (GERACAO_MUNDO §1). */
    outros: { empresarios: number; dirigentesAdeptos: number; agentes: number; arbitros: number; jornalistas: number; staffLivres: number };
    /** Salário mensal (€) de um jogador médio do escalão e elasticidade por ponto de qualidade (exp). */
    salario: { medio: Record<Escalao, number>; elasticidade: number; contratoAnosMin: number; contratoAnosMax: number };
    idade: { min: number; max: number; media: number; desvio: number };
    /** Idade a partir da qual o potencial deixa de crescer (potencial = atual aos X anos). */
    idadePico: number;
    /** Aptidão (1-20) nas posições alternativas relativamente à principal. */
    aptidaoSecundaria: number;
  };
  /** O que se sabe sobre os outros (HISTORICO_EVENTOS §5.B, PERSONALIDADE §7). */
  conhecimento: {
    /** Épocas sem nova observação a partir das quais a ficha mostra "desatualizado". */
    desatualizadoAposEpocas: number;
    /** A incerteza (desvio) de uma observação cresce `1 + k × épocas` com o tempo. */
    crescimentoIncertezaPorEpoca: number;
    /** Desvio do erro de uma observação de qualidade 0 e de qualidade 1 (escala 1-20). */
    sigmaPiorQualidade: number;
    sigmaMelhorQualidade: number;
    /** Multiplicador da margem (1.28 ≈ intervalo a 80 %). */
    z: number;
    /** Qualidade (0-1) por omissão de cada fonte de observação. */
    qualidadePorFonte: Record<"proprioClube" | "olheiro" | "agente" | "jogoContra" | "imprensa", number>;
    personalidade: {
      maxRotulos: number;
      /** Faixas do traço: ≤ baixo é "baixo", ≥ alto é "alto" (PERSONALIDADE §7). */
      limiarBaixo: number;
      limiarAlto: number;
      /** Probabilidade de o rótulo vir com a faixa trocada, para qualidade 0 (desce até 0 com qualidade 1). */
      probTrocaPiorQualidade: number;
    };
  };
};

export const PARAMETROS_PADRAO: Parametros = {
  versao: 1,
  premios: { clube: 2_000_000, cidade: 1_000_000 },
  piramide: {
    primeiraLiga: { clubes: 20, descem: 3 },
    segundaLiga: { clubes: 18, sobem: 3, descem: 3 },
    terceiraLiga: { clubes: 20, sobem: 3, descem: 4 },
    cp: { series: 4, clubesPorSerie: 10, sobemPorSerie: 1 },
    promocao: { grupos: 4, campeoesPorGrupo: 5, promovidosPorGrupo: 2, voltas: 1 },
    distritos: 20,
  },
  distritais: { alvo: 10, min: 8, max: 14, minimoDuro: 6 },
  classificacao: { pontosVitoria: 3, pontosEmpate: 1 },
  calendario: {
    mesInicioEpoca: 8,
    mesFimEpoca: 5,
    janelas: [
      { abre: { mes: 7, dia: 1 }, fecha: { mes: 8, dia: 31 } },
      { abre: { mes: 1, dia: 1 }, fecha: { mes: 1, dia: 31 } },
    ],
    diasPorAvanco: 1,
    anoInicial: 2026,
    primeiraJornada: { mes: 8, dia: 15 },
    ultimaJornadaAte: { mes: 5, dia: 18 },
    pausas: [
      { motivo: "seleções (setembro)", de: { mes: 9, dia: 4 }, ate: { mes: 9, dia: 10 } },
      { motivo: "seleções (outubro)", de: { mes: 10, dia: 9 }, ate: { mes: 10, dia: 15 } },
      { motivo: "seleções (novembro)", de: { mes: 11, dia: 13 }, ate: { mes: 11, dia: 19 } },
      { motivo: "Natal", de: { mes: 12, dia: 22 }, ate: { mes: 1, dia: 2 } },
      { motivo: "seleções (março)", de: { mes: 3, dia: 20 }, ate: { mes: 3, dia: 26 } },
    ],
    diasDeJogo: { primeiraLiga: [6, 0], segundaLiga: [6, 0], terceiraLiga: [6, 0], cp: [0], distrital: [0] },
    jornadasFinaisSimultaneas: 1,
  },
  saves: { autosaveDias: 7, autosavesRotativos: 3, guardarNoInicioDeEpoca: true },
  fairPlay: { niveis: 5, padrao: 3 },
  estrangeiros: { primeiraLiga: 0.55, segundaLiga: 0.3, terceiraLiga: 0.15, cp: 0.08, distrital: 0.03 },
  assistencia: {
    multFinal: 2.5,
    multDecisaoSubidaDescida: 1.8,
    derbi: 1.3,
    derbiMutuo: 1.6,
    derbiRegionalVisitantes: 0.2,
    grandeVisitanteCoef: 0.3,
  },
  financas: {
    folgaMesesRisco: 1,
    folgaMesesApertado: 3,
    dividaSobreReceitaFalencia: 0.5,
    mesesSalariosAtrasoFalencia: 3,
    percentisRiqueza: [90, 70, 40, 15],
    probErroEstimativaRival: 0.25,
  },
  personalidade: {
    tracoMin: 1,
    tracoMax: 20,
    memoria: { meiaVidaPositivaMeses: 12, negativaBaseMeses: 6, negativaPorPaciencia: 0.6, maxPorPessoa: 40 },
  },
  cidade: { eleicoesAutarquicasAnos: 4 },
  localidade: { limiarVila: 1500, limiarCidade: 8000, histerese: 0.1 },
  jogo: {
    duracao: 90,
    acrescimos: { min: 3, max: 8 },
    oportunidadesPorEquipa: 24,
    vantagemCasa: 0.9,
    escalaControlo: 4,
    sensibilidade: { remate: 0.3, xg: 0.2 },
    pRemateBase: 0.42,
    xg: { base: 0.02, amplitude: 0.42, expoente: 4, min: 0.01, max: 0.85 },
    penalti: { xg: 0.76, pPorFalta: 0.012 },
    peso: { finalizacao: 0.9, guardaRedes: 0.9 },
    pBloqueado: 0.2,
    aBaliza: { base: 0.28, porXg: 1.4, max: 0.95 },
    cantos: { pSeBloqueado: 0.25, pSeDefendido: 0.2, pRemate: 0.35, fatorXg: 0.65 },
    faltas: { porEquipa: 12, pLivreRemate: 0.06 },
    cartoes: { pAmarelo: 0.17, pAmareloPenalti: 0.5, pVermelhoDireto: 0.003, pVermelhoPenalti: 0.06, jaAmarelo: { falta: 0.4, cartao: 0.55 }, penalizacaoExpulso: { ataque: 1.6, controlo: 1.8, defesa: 1.4 } },
    pAssistido: 0.72,
    pesoRemate: { GR: 0, DD: 0.4, DC: 0.5, DE: 0.4, MDC: 0.5, MC: 1.4, MO: 3, ED: 3, EE: 3, PL: 5 },
    pesoAssistencia: { GR: 0.05, DD: 1.5, DC: 0.4, DE: 1.5, MDC: 1, MC: 3, MO: 3, ED: 2.5, EE: 2.5, PL: 1.2 },
    pesoCabeceamento: { GR: 0, DD: 0.4, DC: 3, DE: 0.4, MDC: 1, MC: 0.6, MO: 0.4, ED: 0.4, EE: 0.4, PL: 2.5 },
    notas: { base: 6, min: 3, max: 10, ruido: 0.25, golo: 0.9, assistencia: 0.5, remateABaliza: 0.1, ocasiaoFalhada: -0.2, penaltiFalhado: -0.7, falta: -0.08, penaltiConcedido: -0.5, defesa: 0.2, golosSofridos: -0.25, amarelo: -0.15, vermelho: -1.2, balizaZero: 0.5, resultado: 0.3 },
    momentos: { xgGrande: 0.3 },
  },
  lesoes: {
    pPorJogadorJogo: 0.016,
    risco: { porForma: 2, relvado: 0.9, porAptidaoFisica: 0.03, porMedico: 0.015, fairPlayAdversario: [0.75, 0.88, 1, 1.25, 1.5], intensidade: 0.07, recaida: 1.2, fadiga: 0.25 },
    gravidades: [
      { peso: 0.4, dias: [3, 10] },
      { peso: 0.33, dias: [10, 28] },
      { peso: 0.18, dias: [28, 70] },
      { peso: 0.07, dias: [70, 180] },
      { peso: 0.02, dias: [180, 300] },
    ],
    recuperacaoPorMedico: 0.02,
    duracaoRecaida: 1.35,
    janelaRecaida: 28,
    pTreinoPorDia: 0.0009,
    forma: { base: 1, porJogoRecente: 0.025, janela: 14, por90: 0.015, recuperacaoPorDia: 0.02, aoRegressar: 0.8, min: 0.7, max: 1.1 },
  },
  disciplina: {
    amarelosPorSuspensao: 5,
    vermelhoDireto: { jogos: 1, pMaisUm: 0.35, max: 4 },
    segundoAmarelo: { jogos: 1 },
  },
  tatica: {
    formacao: { ataque: 0.7, controlo: 0.5, defesa: 0.6 },
    estilos: {
      bonito: { controlo: 0.8, ataque: 0.1, defesa: -0.4, faltas: 0.95, cantoRemate: 0.9 },
      equilibrado: { controlo: 0, ataque: 0, defesa: 0, faltas: 1, cantoRemate: 1 },
      direto: { controlo: -0.5, ataque: 0.45, defesa: 0.15, faltas: 1.12, cantoRemate: 1.25 },
      contraAtaque: { controlo: -0.6, ataque: 0.1, defesa: 0.2, faltas: 1.05, cantoRemate: 1 },
    },
    intensidade: { controlo: 0.2, defesa: 0.15, faltas: 0.1, fadiga: 1 },
    linha: { controlo: 0.2, ataque: 0.2, defesa: -0.5 },
    ritmo: { oportunidades: 0.06, fadiga: 0.6 },
    fairPlay: { faltas: [0.7, 0.85, 1, 1.2, 1.45], defesa: [-0.6, -0.3, 0, 0.3, 0.6], cartoes: [0.5, 0.75, 1, 1.35, 1.8] },
    contraAtaque: { ataquePorPonto: 1.2, defesaPorPonto: 0.4, max: 4 },
    /** Jogo direto: por cada nível de linha defensiva que o adversário tem acima de 3 (bolas nas costas), ganha ataque. */
    diretoAtaquePorLinha: 0.5,
    /** Jogo bonito só rende com técnica: o bónus de controlo e ataque escala com (controlo da equipa − `base`)/`escala`, entre 0 e `max`. */
    bonito: { base: 7, escala: 3, max: 1.5 },
    fadiga: { max: 3.2, inicio: 30 },
    treinador: { bonusPreferencia: 2, favoritas: 3 },
  },
  mundo: {
    talento: { muIndice0: 6.5, muIndice100: 10.5, sigma: 2.4, epsIndice0: 0.004, epsIndice100: 0.02, paretoAlfa: 2.4, paretoEscala: 3 },
    qualidadeAlvo: {
      primeiraLiga: { media: 13, desvio: 1.8 },
      segundaLiga: { media: 11, desvio: 1.8 },
      terceiraLiga: { media: 9.5, desvio: 1.8 },
      cp: { media: 8, desvio: 1.8 },
      distrital: { media: 6.5, desvio: 1.8 },
    },
    qualidadePorReputacao: 2,
    estrangeirosVariacaoReputacao: 0.35,
    plantel: { primeiraLiga: 28, segundaLiga: 26, terceiraLiga: 25, cp: 23, distrital: 20 },
    lugaresPorPosicao: { GR: 3, DD: 2, DC: 4, DE: 2, MDC: 2, MC: 3, MO: 2, ED: 2, EE: 2, PL: 3 },
    livres: 3000,
    staffPorClube: 6,
    outros: { empresarios: 500, dirigentesAdeptos: 400, agentes: 150, arbitros: 250, jornalistas: 200, staffLivres: 500 },
    salario: { medio: { primeiraLiga: 9000, segundaLiga: 3500, terceiraLiga: 1400, cp: 700, distrital: 250 }, elasticidade: 0.22, contratoAnosMin: 1, contratoAnosMax: 4 },
    idade: { min: 16, max: 38, media: 26, desvio: 4.5 },
    idadePico: 27,
    aptidaoSecundaria: 0.6,
  },
  conhecimento: {
    desatualizadoAposEpocas: 2,
    crescimentoIncertezaPorEpoca: 0.25,
    sigmaPiorQualidade: 4,
    sigmaMelhorQualidade: 0.4,
    z: 1.28,
    qualidadePorFonte: { proprioClube: 0.9, olheiro: 0.6, agente: 0.4, jogoContra: 0.35, imprensa: 0.15 },
    personalidade: { maxRotulos: 3, limiarBaixo: 5, limiarAlto: 15, probTrocaPiorQualidade: 0.35 },
  },
};

/** Valores derivados das regras da pirâmide (DESIGN_REGRAS §1). */
export function derivados(p: Parametros) {
  const { cp, promocao, terceiraLiga } = p.piramide;
  const promovidosAoCp = promocao.grupos * promocao.promovidosPorGrupo;
  const sobemDoCp = cp.series * cp.sobemPorSerie;
  const totalCp = cp.series * cp.clubesPorSerie;
  return {
    promovidosAoCp,
    /** Para o CP manter o tamanho: descem tantos quantos entram (promovidos + descidos da Terceira Liga − os que sobem). */
    descemDoCp: promovidosAoCp + terceiraLiga.descem - sobemDoCp,
    totalCp,
    percentagemSaidaCp: (sobemDoCp + (promovidosAoCp + terceiraLiga.descem - sobemDoCp)) / totalCp,
    descemPorSerieMedia: (promovidosAoCp + terceiraLiga.descem - sobemDoCp) / cp.series,
  };
}

/** Devolve a lista de problemas (vazia se os parâmetros forem coerentes). */
export function validarParametros(p: Parametros): string[] {
  const erros: string[] = [];
  const pos = (nome: string, v: number) => { if (!(v > 0)) erros.push(`${nome} deve ser > 0 (é ${v})`); };
  pos("premios.clube", p.premios.clube);
  pos("premios.cidade", p.premios.cidade);

  const { piramide: pi, distritais: d } = p;
  if (pi.promocao.grupos !== pi.cp.series) erros.push("promocao.grupos deve ser igual a cp.series (cada grupo promove para a sua série)");
  if (pi.promocao.grupos * pi.promocao.campeoesPorGrupo !== pi.distritos) erros.push("grupos × campeoesPorGrupo deve ser igual ao número de distritos");
  if (pi.promocao.promovidosPorGrupo >= pi.promocao.campeoesPorGrupo) erros.push("promovidosPorGrupo deve ser menor do que campeoesPorGrupo");
  if (pi.primeiraLiga.descem !== pi.segundaLiga.sobem) erros.push("primeiraLiga.descem deve ser igual a segundaLiga.sobem");
  if (pi.segundaLiga.descem !== pi.terceiraLiga.sobem) erros.push("segundaLiga.descem deve ser igual a terceiraLiga.sobem");
  if (pi.terceiraLiga.descem !== pi.cp.series * pi.cp.sobemPorSerie) erros.push("terceiraLiga.descem deve ser igual aos que sobem do CP (cp.series × sobemPorSerie)");
  if (!(d.minimoDuro <= d.min && d.min <= d.alvo && d.alvo <= d.max)) erros.push("distritais: minimoDuro ≤ min ≤ alvo ≤ max");

  const dv = derivados(p);
  if (dv.descemDoCp < 0 || !Number.isInteger(dv.descemDoCp)) erros.push("descemDoCp deve ser um inteiro ≥ 0");
  if (!Number.isInteger(dv.descemPorSerieMedia)) erros.push("descemPorSerieMedia deve ser inteiro para manter as séries com o mesmo tamanho");

  if (!(p.classificacao.pontosVitoria > p.classificacao.pontosEmpate && p.classificacao.pontosEmpate >= 0))
    erros.push("classificacao: pontosVitoria > pontosEmpate ≥ 0");

  const c = p.calendario;
  const dataOk = (d: { mes: number; dia: number }) => d.mes >= 1 && d.mes <= 12 && d.dia >= 1 && d.dia <= 31;
  for (const d of [c.primeiraJornada, c.ultimaJornadaAte, ...c.pausas.flatMap((x) => [x.de, x.ate])]) if (!dataOk(d)) erros.push("calendario: datas com mês 1-12 e dia 1-31");
  for (const [esc, dias] of Object.entries(c.diasDeJogo))
    if (dias.length === 0 || dias.some((x) => x < 0 || x > 6)) erros.push(`calendario.diasDeJogo.${esc}: dias entre 0 e 6, pelo menos um`);
  if (c.jornadasFinaisSimultaneas < 0) erros.push("calendario: jornadasFinaisSimultaneas ≥ 0");
  for (const m of [c.mesInicioEpoca, c.mesFimEpoca]) if (m < 1 || m > 12) erros.push("calendario: meses entre 1 e 12");
  if (c.janelas.length === 0) erros.push("calendario: tem de existir pelo menos uma janela de transferências");
  if (p.saves.autosaveDias < 1 || p.saves.autosavesRotativos < 1) erros.push("saves: autosaveDias e autosavesRotativos ≥ 1");
  if (p.fairPlay.niveis < 2 || p.fairPlay.padrao < 1 || p.fairPlay.padrao > p.fairPlay.niveis) erros.push("fairPlay: padrao dentro dos níveis");

  for (const [esc, v] of Object.entries(p.estrangeiros)) if (v < 0 || v > 1) erros.push(`estrangeiros.${esc} entre 0 e 1`);
  const f = p.financas;
  if (!(f.folgaMesesRisco < f.folgaMesesApertado)) erros.push("financas: folgaMesesRisco < folgaMesesApertado");
  const pr = f.percentisRiqueza;
  if (!(pr[0] > pr[1] && pr[1] > pr[2] && pr[2] > pr[3] && pr[3] > 0 && pr[0] < 100)) erros.push("financas.percentisRiqueza deve ser estritamente decrescente entre 0 e 100");
  if (f.probErroEstimativaRival < 0 || f.probErroEstimativaRival > 1) erros.push("financas.probErroEstimativaRival entre 0 e 1");
  const k = p.conhecimento;
  if (k.desatualizadoAposEpocas < 1) erros.push("conhecimento: desatualizadoAposEpocas ≥ 1");
  if (k.crescimentoIncertezaPorEpoca < 0) erros.push("conhecimento: crescimentoIncertezaPorEpoca ≥ 0");
  if (!(k.sigmaMelhorQualidade > 0 && k.sigmaMelhorQualidade < k.sigmaPiorQualidade)) erros.push("conhecimento: 0 < sigmaMelhorQualidade < sigmaPiorQualidade");
  if (!(k.z > 0)) erros.push("conhecimento: z > 0");
  for (const [f, q] of Object.entries(k.qualidadePorFonte)) if (q < 0 || q > 1) erros.push(`conhecimento.qualidadePorFonte.${f} entre 0 e 1`);
  if (!(k.personalidade.limiarBaixo < k.personalidade.limiarAlto)) erros.push("conhecimento.personalidade: limiarBaixo < limiarAlto");
  if (k.personalidade.maxRotulos < 1) erros.push("conhecimento.personalidade: maxRotulos ≥ 1");
  if (k.personalidade.probTrocaPiorQualidade < 0 || k.personalidade.probTrocaPiorQualidade > 1) erros.push("conhecimento.personalidade: probTrocaPiorQualidade entre 0 e 1");
  const le = p.lesoes;
  if (!(le.pPorJogadorJogo >= 0 && le.pPorJogadorJogo <= 1 && le.pTreinoPorDia >= 0 && le.pTreinoPorDia <= 1)) erros.push("lesoes: probabilidades entre 0 e 1");
  if (le.gravidades.length !== 5 || Math.abs(le.gravidades.reduce((a, g) => a + g.peso, 0) - 1) > 1e-9 || !le.gravidades.every((g) => g.dias[0] >= 1 && g.dias[1] >= g.dias[0])) erros.push("lesoes.gravidades: 5 níveis, pesos a somar 1 e dias [mín ≥ 1, máx ≥ mín]");
  if (le.risco.fairPlayAdversario.length !== 5) erros.push("lesoes.risco.fairPlayAdversario: 5 níveis");
  if (!(le.forma.min < le.forma.max && le.forma.min <= le.forma.aoRegressar && le.forma.aoRegressar <= le.forma.max && le.forma.base >= le.forma.min && le.forma.base <= le.forma.max)) erros.push("lesoes.forma: min < max e base/aoRegressar dentro dos limites");
  const dis = p.disciplina;
  if (!(Number.isInteger(dis.amarelosPorSuspensao) && dis.amarelosPorSuspensao >= 1 && dis.vermelhoDireto.jogos >= 1 && dis.vermelhoDireto.max >= dis.vermelhoDireto.jogos && dis.vermelhoDireto.pMaisUm >= 0 && dis.vermelhoDireto.pMaisUm < 1 && dis.segundoAmarelo.jogos >= 1)) erros.push("disciplina: amarelosPorSuspensao inteiro ≥ 1, vermelhoDireto.jogos ≥ 1 ≤ max, 0 ≤ pMaisUm < 1, segundoAmarelo.jogos ≥ 1");
  const t = p.tatica;
  if (t.fairPlay.cartoes.length !== 5 || !t.fairPlay.cartoes.every((x) => x > 0)) erros.push("tatica.fairPlay.cartoes: 5 níveis, multiplicadores > 0");
  if (!(t.fairPlay.faltas.length === 5 && t.fairPlay.defesa.length === 5 && t.fairPlay.faltas.every((x) => x > 0))) erros.push("tatica.fairPlay: 5 níveis, multiplicadores de faltas > 0");
  if (!(t.fadiga.max >= 0 && t.fadiga.inicio >= 0 && t.treinador.bonusPreferencia >= 0 && t.treinador.favoritas >= 1)) erros.push("tatica: fadiga.max ≥ 0, fadiga.inicio ≥ 0, treinador.bonusPreferencia ≥ 0 e favoritas ≥ 1");
  const j = p.jogo;
  for (const [n, x] of Object.entries({ pAmarelo: j.cartoes.pAmarelo, pAmareloPenalti: j.cartoes.pAmareloPenalti, pVermelhoDireto: j.cartoes.pVermelhoDireto, pVermelhoPenalti: j.cartoes.pVermelhoPenalti })) if (!(x >= 0 && x <= 1)) erros.push(`jogo.cartoes.${n} entre 0 e 1`);
  if (!(j.notas.min < j.notas.base && j.notas.base < j.notas.max && j.notas.ruido >= 0)) erros.push("jogo.notas: min < base < max e ruido ≥ 0");
  if (!(j.momentos.xgGrande > 0 && j.momentos.xgGrande < 1)) erros.push("jogo.momentos.xgGrande entre 0 e 1");
  if (!(j.duracao > 0 && j.acrescimos.min >= 0 && j.acrescimos.min <= j.acrescimos.max)) erros.push("jogo: duracao > 0 e 0 ≤ acrescimos.min ≤ max");
  if (!(j.oportunidadesPorEquipa > 0 && j.escalaControlo > 0)) erros.push("jogo: oportunidadesPorEquipa e escalaControlo > 0");
  for (const [n, x] of [["pRemateBase", j.pRemateBase], ["pBloqueado", j.pBloqueado], ["pAssistido", j.pAssistido], ["penalti.xg", j.penalti.xg], ["penalti.pPorFalta", j.penalti.pPorFalta], ["faltas.pLivreRemate", j.faltas.pLivreRemate], ["cantos.pSeBloqueado", j.cantos.pSeBloqueado], ["cantos.pSeDefendido", j.cantos.pSeDefendido], ["cantos.pRemate", j.cantos.pRemate], ["aBaliza.max", j.aBaliza.max]] as const)
    if (!(x >= 0 && x <= 1)) erros.push(`jogo.${n} entre 0 e 1`);
  if (!(j.xg.min > 0 && j.xg.min < j.xg.max && j.xg.max < 1 && j.xg.base >= 0 && j.xg.amplitude > 0 && j.xg.expoente > 0)) erros.push("jogo.xg: 0 < min < max < 1, base ≥ 0, amplitude e expoente > 0");
  for (const t of [j.pesoRemate, j.pesoAssistencia, j.pesoCabeceamento])
    for (const pos of ["GR", "DD", "DC", "DE", "MDC", "MC", "MO", "ED", "EE", "PL"]) if (!(((t[pos] as number | undefined) ?? -1) >= 0)) erros.push(`jogo: peso em falta ou negativo para ${pos}`);
  const lo = p.localidade;
  if (!(lo.limiarVila > 0 && lo.limiarVila < lo.limiarCidade)) erros.push("localidade: 0 < limiarVila < limiarCidade");
  if (!(lo.histerese >= 0 && lo.histerese < 0.5)) erros.push("localidade.histerese entre 0 e 0.5");
  const m = p.mundo;
  if (!(m.talento.muIndice0 < m.talento.muIndice100 && m.talento.sigma > 0)) erros.push("mundo.talento: muIndice0 < muIndice100 e sigma > 0");
  if (!(m.talento.epsIndice0 > 0 && m.talento.epsIndice0 <= m.talento.epsIndice100 && m.talento.epsIndice100 < 1)) erros.push("mundo.talento: 0 < epsIndice0 ≤ epsIndice100 < 1 (a cauda nunca é zero)");
  if (!(m.talento.paretoAlfa > 0 && m.talento.paretoEscala > 0)) erros.push("mundo.talento: paretoAlfa e paretoEscala > 0");
  for (const [esc, q] of Object.entries(m.qualidadeAlvo)) if (!(q.media >= 1 && q.media <= 20 && q.desvio > 0)) erros.push(`mundo.qualidadeAlvo.${esc} inválida`);
  for (const [esc, n] of Object.entries(m.plantel)) if (n < 16) erros.push(`mundo.plantel.${esc} ≥ 16`);
  if (Object.values(m.lugaresPorPosicao).some((n) => n < 1)) erros.push("mundo.lugaresPorPosicao: pelo menos 1 por posição");
  if (Object.values(m.salario.medio).some((x) => !(x > 0)) || m.salario.contratoAnosMin < 1 || m.salario.contratoAnosMax < m.salario.contratoAnosMin) erros.push("mundo.salario inválido");
  if (!(m.idade.min < m.idade.max && m.idade.min >= 15)) erros.push("mundo.idade: 15 ≤ min < max");
  if (p.personalidade.tracoMin >= p.personalidade.tracoMax) erros.push("personalidade: tracoMin < tracoMax");
  return erros;
}

type Parcial<T> = { [K in keyof T]?: T[K] extends readonly unknown[] ? T[K] : T[K] extends object ? Parcial<T[K]> : T[K] };

function fundir<T>(base: T, extra: Parcial<T> | undefined): T {
  if (extra === undefined || typeof base !== "object" || base === null || Array.isArray(base)) return (extra as T | undefined) ?? base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(extra as Record<string, unknown>)) {
    out[k] = v !== null && typeof v === "object" && !Array.isArray(v) ? fundir(out[k], v as never) : v;
  }
  return out as T;
}

/** Cria parâmetros a partir dos padrões com alterações (p. ex. cenários, testes, modos de dificuldade). Lança erro se forem incoerentes. */
export function criarParametros(alteracoes?: Parcial<Parametros>): Parametros {
  const p = fundir(PARAMETROS_PADRAO, alteracoes);
  const erros = validarParametros(p);
  if (erros.length > 0) throw new Error("Parâmetros inválidos:\n - " + erros.join("\n - "));
  return p;
}
