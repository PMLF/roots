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
