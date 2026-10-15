/**
 * Importador dos CSV de data/ para o modelo (RZ-007).
 * Valida as mesmas regras de tools/build_dados.py e mais algumas (coerência entre ficheiros).
 * Função pura: recebe o texto dos CSV e devolve os dados ou a lista completa de erros
 * (nunca falha à primeira). Os totais esperados vêm dos parâmetros (RZ-006).
 */
import { PARAMETROS_PADRAO, type Escalao, type Parametros } from "../config/parametros";
import { lerTabela, type LinhaCsv } from "./csv";
import type {
  CidadeBase,
  ClubeBase,
  DadosBase,
  DistritoBase,
  FontesCsv,
  Propriedade,
  ResultadoImportacao,
  RivalidadeBase,
  SerieCP,
  Zona,
} from "./tipos";

const ESCALOES: Record<string, Escalao> = {
  "Primeira Liga": "primeiraLiga",
  "Segunda Liga": "segundaLiga",
  "Terceira Liga": "terceiraLiga",
  "Campeonato de Portugal": "cp",
  Distrital: "distrital",
};
const ZONAS: readonly Zona[] = ["centro", "perto", "periferia", "fora"];
const PROPRIEDADES: readonly Propriedade[] = ["clube", "municipal", "partilhada"];
const SERIES: readonly SerieCP[] = ["A", "B", "C", "D"];

const COLUNAS = {
  clubes: ["id", "nome", "cidade", "concelho", "distrito", "divisao", "liga", "rep", "fin", "cap", "estadio", "cores", "alcunha", "mascote", "rival", "setor", "tag2", "polo", "serie_cp", "estadio_prop", "est_local", "est_dist_km", "est_transportes", "est_acesso_rodov", "est_estacionamento", "est_lugares_estac", "est_envolvente", "est_terreno", "origem"],
  cidades: ["concelho", "distrito", "populacao", "setor", "tag2", "polo", "ilha", "orcamento_municipal", "autarca", "ambicao", "apoio_desporto", "vaidade", "paciencia", "integridade", "cultura_futebol", "clubes"],
  rivalidades: ["clube_a", "clube_b", "mutua", "mesmo_concelho", "mesmo_distrito", "mesmo_polo", "mesma_divisao"],
  distritos: ["distrito", "serie_cp", "Primeira Liga", "Segunda Liga", "Terceira Liga", "Campeonato de Portugal", "Distrital", "total"],
} as const;

/** Identificador estável: minúsculas, sem acentos, hífens. */
export function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

type Ctx = { erros: string[]; avisos: string[] };

function tabela(nome: keyof typeof COLUNAS, texto: string, ctx: Ctx): LinhaCsv[] {
  const t = lerTabela(texto);
  t.erros.forEach((e) => ctx.erros.push(`${nome}.csv ${e}`));
  const falta = COLUNAS[nome].filter((c) => !t.colunas.includes(c));
  if (falta.length > 0) {
    ctx.erros.push(`${nome}.csv: colunas em falta: ${falta.join(", ")}`);
    return [];
  }
  return t.linhas;
}

function leitor(ficheiro: string, l: LinhaCsv, ctx: Ctx) {
  const onde = `${ficheiro}.csv linha ${l.numero}`;
  const get = (c: string): string => l.valores[c] ?? "";
  return {
    onde,
    txt(c: string): string {
      const v = get(c);
      if (v === "") ctx.erros.push(`${onde}: "${c}" vazio`);
      return v;
    },
    txtOpc: (c: string): string => get(c),
    num(c: string, min: number, max: number, inteiro = false): number {
      const v = Number(get(c));
      if (get(c) === "" || !Number.isFinite(v) || (inteiro && !Number.isInteger(v)) || v < min || v > max) {
        ctx.erros.push(`${onde}: "${c}" = "${get(c)}" fora de [${min}, ${max}]${inteiro ? " (inteiro)" : ""}`);
        return min;
      }
      return v;
    },
    simNao(c: string): boolean {
      const v = get(c);
      if (v !== "sim" && v !== "não") ctx.erros.push(`${onde}: "${c}" deve ser "sim" ou "não" (é "${v}")`);
      return v === "sim";
    },
    em<T extends string>(c: string, validos: readonly T[]): T {
      const v = get(c) as T;
      if (!validos.includes(v)) {
        ctx.erros.push(`${onde}: "${c}" = "${v}" inválido (${validos.join("/")})`);
        return validos[0] as T;
      }
      return v;
    },
  };
}

function contar<T>(xs: T[], chave: (x: T) => string): Map<string, number> {
  const m = new Map<string, number>();
  for (const x of xs) m.set(chave(x), (m.get(chave(x)) ?? 0) + 1);
  return m;
}

export function importarDados(fontes: FontesCsv, params: Parametros = PARAMETROS_PADRAO): ResultadoImportacao {
  const ctx: Ctx = { erros: [], avisos: [] };
  const { erros } = ctx;

  // ---------- distritos ----------
  const distritos: DistritoBase[] = [];
  for (const l of tabela("distritos", fontes.distritos, ctx)) {
    const r = leitor("distritos", l, ctx);
    const nome = r.txt("distrito");
    const por = (c: string) => r.num(c, 0, 100, true);
    const novo: DistritoBase = {
      id: slug(nome),
      nome,
      serieCP: r.em("serie_cp", SERIES),
      clubesPorEscalao: {
        primeiraLiga: por("Primeira Liga"),
        segundaLiga: por("Segunda Liga"),
        terceiraLiga: por("Terceira Liga"),
        cp: por("Campeonato de Portugal"),
        distrital: por("Distrital"),
      },
    };
    distritos.push(novo);
    const soma = Object.values(novo.clubesPorEscalao).reduce((a, b) => a + b, 0);
    if (soma !== r.num("total", 0, 1000, true)) erros.push(`${r.onde}: "total" não é a soma dos escalões (${soma})`);
  }
  if (distritos.length !== params.piramide.distritos)
    erros.push(`distritos.csv: ${distritos.length} distritos (esperado ${params.piramide.distritos})`);
  for (const [id, n] of contar(distritos, (d) => d.id)) if (n > 1) erros.push(`distrito duplicado: ${id}`);
  const distritoPorNome = new Map(distritos.map((d) => [d.nome, d]));
  const seriesUsadas = new Set(distritos.map((d) => d.serieCP));
  if (seriesUsadas.size !== params.piramide.cp.series)
    erros.push(`distritos.csv: ${seriesUsadas.size} séries do CP (esperado ${params.piramide.cp.series})`);

  // ---------- clubes ----------
  const clubes: ClubeBase[] = [];
  const serieDeclarada = new Map<string, string>();
  for (const l of tabela("clubes", fontes.clubes, ctx)) {
    const r = leitor("clubes", l, ctx);
    const nome = r.txt("nome");
    const id = r.txt("id");
    const divisao = r.txt("divisao");
    const escalao = ESCALOES[divisao];
    if (!escalao) erros.push(`${r.onde}: divisão desconhecida "${divisao}"`);
    const cap = r.num("cap", 100, 200_000, true);
    clubes.push({
      id,
      nome,
      localidade: r.txt("cidade"),
      cidade: slug(r.txt("concelho")),
      distrito: r.txt("distrito"),
      escalao: escalao ?? "distrital",
      liga: r.txt("liga"),
      reputacao: r.num("rep", 0, 10_000, true),
      financas: r.num("fin", 0, 1e10, true),
      estadio: {
        nome: r.txt("estadio"),
        propriedade: r.em("estadio_prop", PROPRIEDADES),
        capacidade: cap,
        localizacao: {
          zona: r.em("est_local", ZONAS),
          distanciaCentroKm: r.num("est_dist_km", 0, 200),
          transportes: r.num("est_transportes", 0, 100),
          acessoRodoviario: r.num("est_acesso_rodov", 0, 100),
          estacionamento: r.num("est_estacionamento", 0, 100),
          lugaresEstacionamento: r.num("est_lugares_estac", 0, 100_000, true),
          envolvente: r.num("est_envolvente", 0, 100),
          terrenoExpansao: r.num("est_terreno", 0, 100),
        },
      },
      cores: r.txt("cores"),
      alcunha: r.txtOpc("alcunha"),
      mascote: r.txtOpc("mascote"),
      rival: r.txt("rival"), // nome; resolvido abaixo
      setor: r.txt("setor"),
      tag2: r.txt("tag2"),
      polo: r.txt("polo"),
      origem: r.em("origem", ["existente", "novo"] as const),
    });
    serieDeclarada.set(id, r.txtOpc("serie_cp"));
    if (r.txtOpc("alcunha") === "" || r.txtOpc("mascote") === "")
      ctx.avisos.push(`${r.onde}: ${nome} sem alcunha ou mascote`);
  }

  const idPorNome = new Map<string, string>();
  for (const c of clubes) {
    if (idPorNome.has(c.nome)) erros.push(`nome de clube duplicado: ${c.nome}`);
    idPorNome.set(c.nome, c.id);
  }
  for (const [id, n] of contar(clubes, (c) => c.id)) if (n > 1) erros.push(`id de clube duplicado: ${id}`);
  const clubePorId = new Map(clubes.map((c) => [c.id, c]));
  for (const c of clubes) {
    const rival = idPorNome.get(c.rival);
    if (!rival) erros.push(`rival inexistente: ${c.nome} -> ${c.rival}`);
    else if (rival === c.id) erros.push(`rival é o próprio clube: ${c.nome}`);
    c.rival = rival ?? c.rival;
  }

  // ---------- coerência clubes ↔ distritos ----------
  for (const c of clubes) {
    const d = distritoPorNome.get(c.distrito);
    if (!d) {
      erros.push(`${c.nome}: distrito "${c.distrito}" não existe em distritos.csv`);
      continue;
    }
    if (serieDeclarada.get(c.id) !== d.serieCP)
      erros.push(`${c.nome}: serie_cp "${serieDeclarada.get(c.id)}" != série do distrito ${d.nome} (${d.serieCP})`);
    if (c.escalao === "cp" && c.liga !== `CP Série ${d.serieCP}`)
      erros.push(`${c.nome}: distrito ${d.nome} pertence à série ${d.serieCP} mas a liga é "${c.liga}"`);
    if (c.escalao === "distrital" && c.liga !== `Distrital ${d.nome}`)
      erros.push(`${c.nome}: liga "${c.liga}" não corresponde ao distrito ${d.nome}`);
  }

  // ---------- totais por competição (a partir dos parâmetros) ----------
  const pir = params.piramide;
  const total = contar(clubes, (c) => c.escalao);
  const esperados: [Escalao, number][] = [
    ["primeiraLiga", pir.primeiraLiga.clubes],
    ["segundaLiga", pir.segundaLiga.clubes],
    ["terceiraLiga", pir.terceiraLiga.clubes],
    ["cp", pir.cp.series * pir.cp.clubesPorSerie],
    ["distrital", pir.distritos * params.distritais.alvo],
  ];
  for (const [e, n] of esperados) if ((total.get(e) ?? 0) !== n) erros.push(`${e}: ${total.get(e) ?? 0} clubes (esperado ${n})`);
  const porLiga = contar(clubes, (c) => c.liga);
  for (const s of seriesUsadas)
    if ((porLiga.get(`CP Série ${s}`) ?? 0) !== pir.cp.clubesPorSerie)
      erros.push(`CP Série ${s} tem ${porLiga.get(`CP Série ${s}`) ?? 0} clubes (esperado ${pir.cp.clubesPorSerie})`);
  for (const d of distritos)
    if ((porLiga.get(`Distrital ${d.nome}`) ?? 0) !== params.distritais.alvo)
      erros.push(`Distrital ${d.nome} tem ${porLiga.get(`Distrital ${d.nome}`) ?? 0} clubes (esperado ${params.distritais.alvo})`);
  const porDistritoEscalao = contar(clubes, (c) => `${c.distrito}|${c.escalao}`);
  for (const d of distritos)
    for (const [e, n] of Object.entries(d.clubesPorEscalao))
      if ((porDistritoEscalao.get(`${d.nome}|${e}`) ?? 0) !== n)
        erros.push(`distritos.csv: ${d.nome} ${e} = ${n} mas há ${porDistritoEscalao.get(`${d.nome}|${e}`) ?? 0} clubes`);

  // ---------- cidades ----------
  const cidades: CidadeBase[] = [];
  const nomesClubesCidade: string[][] = [];
  for (const l of tabela("cidades", fontes.cidades, ctx)) {
    const r = leitor("cidades", l, ctx);
    const nome = r.txt("concelho");
    const x2 = (c: string) => r.num(c, 1, 10, true) * 2;
    const distrito = r.txt("distrito");
    if (!distritoPorNome.has(distrito)) erros.push(`${r.onde}: distrito "${distrito}" não existe`);
    cidades.push({
      id: slug(nome),
      nome,
      distrito,
      populacao: r.num("populacao", 1, 10_000_000, true),
      setor: r.txt("setor"),
      tag2: r.txt("tag2"),
      polo: r.txt("polo"),
      ilha: r.simNao("ilha"),
      orcamentoMunicipal: r.num("orcamento_municipal", 0, 1e10, true),
      autarca: {
        nome: r.txt("autarca"),
        tracos: { ambicao: x2("ambicao"), vaidade: x2("vaidade"), paciencia: x2("paciencia"), integridade: x2("integridade") },
        apoioDesporto: r.num("apoio_desporto", 1, 10, true),
      },
      culturaFutebol: r.num("cultura_futebol", 0, 100),
      clubes: [],
    });
    nomesClubesCidade.push(r.txtOpc("clubes").split(";").map((s) => s.trim()).filter(Boolean));
  }
  for (const [id, n] of contar(cidades, (c) => c.id)) if (n > 1) erros.push(`concelho duplicado: ${id}`);
  const cidadePorId = new Map(cidades.map((c) => [c.id, c]));
  cidades.forEach((c, i) => {
    for (const nome of nomesClubesCidade[i] ?? []) {
      const id = idPorNome.get(nome);
      const clube = id ? clubePorId.get(id) : undefined;
      if (!clube) erros.push(`cidade ${c.nome}: clube inexistente "${nome}"`);
      else if (clube.cidade !== c.id) erros.push(`cidade ${c.nome}: o clube ${nome} é de outro concelho (${clube.cidade})`);
      else c.clubes.push(clube.id);
    }
  });
  for (const c of clubes) {
    const cidade = cidadePorId.get(c.cidade);
    if (!cidade) erros.push(`${c.nome}: concelho "${c.cidade}" não existe em cidades.csv`);
    else {
      if (cidade.distrito !== c.distrito) erros.push(`${c.nome}: distrito "${c.distrito}" != concelho ${cidade.nome} ("${cidade.distrito}")`);
      if (!cidade.clubes.includes(c.id)) erros.push(`${c.nome}: não consta na lista de clubes de ${cidade.nome}`);
    }
  }

  // ---------- rivalidades ----------
  const rivalidades: RivalidadeBase[] = [];
  const arestas = new Set<string>();
  for (const l of tabela("rivalidades", fontes.rivalidades, ctx)) {
    const r = leitor("rivalidades", l, ctx);
    const a = idPorNome.get(r.txt("clube_a"));
    const b = idPorNome.get(r.txt("clube_b"));
    if (!a || !b) {
      erros.push(`${r.onde}: clube inexistente (${r.txtOpc("clube_a")} / ${r.txtOpc("clube_b")})`);
      continue;
    }
    const chave = [a, b].sort().join("|");
    if (a === b) erros.push(`${r.onde}: rivalidade de um clube consigo próprio`);
    if (arestas.has(chave)) erros.push(`${r.onde}: rivalidade duplicada`);
    arestas.add(chave);
    const ca = clubePorId.get(a);
    const cb = clubePorId.get(b);
    if (!ca || !cb) continue;
    const rv: RivalidadeBase = {
      a, b,
      mutua: r.simNao("mutua"),
      mesmoConcelho: r.simNao("mesmo_concelho"),
      mesmoDistrito: r.simNao("mesmo_distrito"),
      mesmoPolo: r.simNao("mesmo_polo"),
      mesmaDivisao: r.simNao("mesma_divisao"),
    };
    const esperada: Record<string, boolean> = {
      mutua: ca.rival === b && cb.rival === a,
      mesmoConcelho: ca.cidade === cb.cidade,
      mesmoDistrito: ca.distrito === cb.distrito,
      mesmoPolo: ca.polo === cb.polo,
      mesmaDivisao: ca.escalao === cb.escalao,
    };
    for (const k of Object.keys(esperada))
      if ((rv as unknown as Record<string, boolean>)[k] !== esperada[k]) erros.push(`${r.onde}: "${k}" incoerente com os dados dos clubes`);
    rivalidades.push(rv);
  }
  for (const c of clubes)
    if (!arestas.has([c.id, c.rival].sort().join("|"))) erros.push(`${c.nome}: o rival principal não consta em rivalidades.csv`);

  if (erros.length > 0) return { ok: false, erros };
  const dados: DadosBase = { distritos, cidades, clubes, rivalidades };
  return { ok: true, dados, avisos: ctx.avisos };
}
