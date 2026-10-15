/**
 * Gerador do mundo e das pessoas (RZ-103; docs/GERACAO_MUNDO.md). Puro e determinístico:
 * mesma seed + mesmos dados + mesmos parâmetros → mesmo mundo. Cada clube tem o seu fluxo
 * aleatório (derivado do id), por isso acrescentar um clube não muda os outros.
 */
import { Rng, limitar } from "../aleatorio/rng";
import { criarData, somarDias } from "../calendario/datas";
import type { Escalao, Parametros } from "../config/parametros";
import type { ClubeBase, CidadeBase, DadosBase } from "../dados/tipos";
import { gerarPersonalidade, type PapelPessoa } from "../personalidade/gerar";
import { gerarAtributos, gerarCorpo, gerarPosicoes, qualidadeAtual, qualidadeEPotencial } from "./jogador";
import { gerarNome } from "./nomes";
import { pesoNascimento, pesoParaPortugal, type Pais } from "./paises";
import { densidadeEm, tabelaDensidade } from "./talento";
import { POSICOES, type CargoNovo, type ContratoNovo, type FuncaoCargo, type JogadorNovo, type LoteMundo, type PessoaNova, type Posicao } from "./tipos";

export type EntradaMundo = {
  seed: string;
  dados: DadosBase;
  paises: readonly Pais[];
  params: Parametros;
  aoProgredir?: (fase: string, feito: number, total: number) => void;
};

const ESCALOES: Escalao[] = ["primeiraLiga", "segundaLiga", "terceiraLiga", "cp", "distrital"];

/** Lugares por posição para um plantel de `n` (maior resto), com pelo menos 2 guarda-redes. */
export function distribuirPosicoes(n: number, base: Parametros["mundo"]["lugaresPorPosicao"]): Posicao[] {
  const soma = POSICOES.reduce((s, p) => s + base[p], 0);
  const brutos = POSICOES.map((p) => ({ p, x: (base[p] * n) / soma }));
  const cont: Record<string, number> = {};
  let usados = 0;
  for (const b of brutos) {
    cont[b.p] = Math.max(1, Math.floor(b.x));
    usados += cont[b.p] as number;
  }
  const restos = [...brutos].sort((a, b) => b.x - Math.floor(b.x) - (a.x - Math.floor(a.x)));
  for (let i = 0; usados < n; i++) {
    cont[(restos[i % restos.length] as { p: string }).p]!++;
    usados++;
  }
  while (usados > n) {
    const maior = POSICOES.filter((p) => (cont[p] as number) > 1).sort((a, b) => (cont[b] as number) - (cont[a] as number))[0] as Posicao;
    cont[maior]!--;
    usados--;
  }
  if ((cont.GR as number) < 2) {
    const maior = POSICOES.filter((p) => p !== "GR").sort((a, b) => (cont[b] as number) - (cont[a] as number))[0] as Posicao;
    cont[maior]!--;
    cont.GR!++;
  }
  return POSICOES.flatMap((p) => Array<Posicao>(cont[p] as number).fill(p));
}

type Ctx = {
  seed: Rng;
  params: Parametros;
  paises: readonly Pais[];
  porId: Map<string, Pais>;
  estrangeiros: Pais[];
  densidades: Map<string, Float64Array>;
  cidades: CidadeBase[];
  cidadesPorDistrito: Map<string, CidadeBase[]>;
  inicio: string;
  lote: LoteMundo;
  vistos: Set<string>;
  n: number;
};

const novoId = (c: Ctx) => `p${String(++c.n).padStart(6, "0")}`;

function cidadeSorteada(rng: Rng, xs: readonly CidadeBase[]): CidadeBase {
  return rng.ponderado(xs, (c) => Math.sqrt(c.populacao));
}

function criarPessoa(c: Ctx, rng: Rng, o: { pais: Pais; idade: number; papel: PapelPessoa; lod: 1 | 2 | 3; naturalDe?: string; ctx?: Parameters<typeof gerarPersonalidade>[2] }): PessoaNova {
  let nome = gerarNome(rng, o.pais.familiaNomes);
  const nascimento = somarDias(c.inicio, -Math.round(o.idade * 365.25));
  for (let i = 0; i < 10 && c.vistos.has(`${nome.completo}|${nascimento}`); i++) nome = gerarNome(rng, o.pais.familiaNomes);
  c.vistos.add(`${nome.completo}|${nascimento}`);
  const { personalidade, arquetipo } = gerarPersonalidade(rng, o.papel, o.ctx, c.params.personalidade.tracoMin, c.params.personalidade.tracoMax);
  const p: PessoaNova = {
    id: novoId(c),
    nome: nome.completo,
    nomeDesportivo: nome.desportivo,
    nascimento,
    nacionalidade: o.pais.id,
    papeis: [o.papel],
    personalidade,
    arquetipo,
    lod: o.lod,
    ...(o.naturalDe !== undefined ? { naturalDe: o.naturalDe } : {}),
  };
  c.lote.pessoas.push(p);
  return p;
}

function paisPortugal(c: Ctx): Pais {
  return c.porId.get("pt") as Pais;
}

function idadeJogador(rng: Rng, m: Parametros["mundo"]): number {
  return limitar(rng.gauss(m.idade.media, m.idade.desvio), m.idade.min, m.idade.max);
}

/** Escolhe a nacionalidade de um jogador de um clube do escalão. */
function escolherPais(c: Ctx, rng: Rng, esc: Escalao, pEstrangeiro: number, qAlvo: number): Pais {
  if (!rng.prob(pEstrangeiro)) return paisPortugal(c);
  return rng.ponderado(c.estrangeiros, (p) => pesoParaPortugal(p, esc) * densidadeEm(c.densidades.get(p.id) as Float64Array, qAlvo));
}

function naturalidade(c: Ctx, rng: Rng, pais: Pais, clube: ClubeBase | undefined): string | undefined {
  if (pais.id !== "pt" || rng.prob(0.06)) return undefined; // luso-descendentes e naturalizados nascem lá fora
  if (clube) {
    const r = rng.float();
    if (r < 0.35) return clube.cidade;
    const dist = c.cidadesPorDistrito.get(clube.distrito);
    if (r < 0.75 && dist && dist.length > 0) return cidadeSorteada(rng, dist).id;
  }
  return cidadeSorteada(rng, c.cidades).id;
}

function criarJogador(
  c: Ctx,
  rng: Rng,
  o: { pos: Posicao; esc: Escalao; qAlvo: number; clube?: ClubeBase; pEstrangeiro: number; lod: 1 | 2; escalaSalario: number },
): void {
  const m = c.params.mundo;
  const idade = idadeJogador(rng, m);
  const pais = escolherPais(c, rng, o.esc, o.pEstrangeiro, o.qAlvo);
  const naturalDe = naturalidade(c, rng, pais, o.clube);
  const natural = naturalDe !== undefined && naturalDe === o.clube?.cidade;
  const pessoa = criarPessoa(c, rng, {
    pais,
    idade,
    papel: "jogador",
    lod: o.lod,
    ...(naturalDe !== undefined ? { naturalDe } : {}),
    ctx: { naturalDaCidade: natural, origemDificil: pais.indice < 30 },
  });
  const { atual, potencial } = qualidadeEPotencial(rng, o.qAlvo, idade, m);
  const atributos = gerarAtributos(rng, o.pos, atual, idade);
  const j: JogadorNovo = {
    pessoa: pessoa.id,
    posicoes: gerarPosicoes(rng, o.pos, m.aptidaoSecundaria),
    atributos,
    // o potencial nunca fica abaixo da qualidade realmente medida nos atributos
    potencial: Math.round(Math.max(potencial, qualidadeAtual(atributos, o.pos)) * 10) / 10,
    ...gerarCorpo(rng, o.pos),
    ...(o.clube ? { clube: o.clube.id } : {}),
    estado: o.clube ? "ativo" : "livre",
  };
  c.lote.jogadores.push(j);
  if (o.clube) {
    const anos = rng.inteiro(m.salario.contratoAnosMin, m.salario.contratoAnosMax);
    const k = rng.inteiro(0, anos - 1);
    const salario = m.salario.medio[o.esc] * Math.exp(m.salario.elasticidade * (atual - m.qualidadeAlvo[o.esc].media)) * o.escalaSalario;
    const ano0 = m.idade.min > 0 ? c.params.calendario.anoInicial : 2026;
    const ct: ContratoNovo = {
      pessoa: pessoa.id,
      clube: o.clube.id,
      salarioMensal: Math.max(50, Math.round(salario / 10) * 10),
      inicio: criarData(ano0 - k, 7, 1),
      fim: criarData(ano0 - k + anos, 6, 30),
    };
    c.lote.contratos.push(ct);
  }
}

function criarCargo(c: Ctx, rng: Rng, funcao: FuncaoCargo, papel: PapelPessoa, idadeMedia: number, o: { clube?: string; cidade?: string; pais?: Pais; qualidade?: Record<string, number>; ctx?: Parameters<typeof gerarPersonalidade>[2]; naturalDe?: string }): PessoaNova {
  const idade = limitar(rng.gauss(idadeMedia, 8), 24, 75);
  const pessoa = criarPessoa(c, rng, { pais: o.pais ?? paisPortugal(c), idade, papel, lod: 2, ...(o.ctx ? { ctx: o.ctx } : {}), ...(o.naturalDe ? { naturalDe: o.naturalDe } : {}) });
  const cargo: CargoNovo = { pessoa: pessoa.id, funcao, ...(o.clube ? { clube: o.clube } : {}), ...(o.cidade ? { cidade: o.cidade } : {}), ...(o.qualidade ? { qualidade: o.qualidade } : {}) };
  c.lote.cargos.push(cargo);
  return pessoa;
}

const FUNCOES_STAFF: { funcao: FuncaoCargo; areas: string[] }[] = [
  { funcao: "treinador", areas: ["taticas", "formacaoJovens", "motivacao"] },
  { funcao: "adjunto", areas: ["taticas", "motivacao"] },
  { funcao: "olheiro", areas: ["scouting"] },
  { funcao: "medico", areas: ["medicina"] },
  { funcao: "fisio", areas: ["medicina", "preparacaoFisica"] },
  { funcao: "comunidade", areas: ["relacaoAdeptos"] },
];

function mediana(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s.length === 0 ? 1 : (s[Math.floor(s.length / 2)] as number);
}

export function gerarMundo(e: EntradaMundo): LoteMundo {
  const { params, dados } = e;
  const m = params.mundo;
  const lote: LoteMundo = { pessoas: [], jogadores: [], contratos: [], cargos: [] };
  const porId = new Map(e.paises.map((p) => [p.id, p]));
  if (!porId.has("pt")) throw new Error("A tabela de países tem de incluir Portugal (pt)");
  const estrangeiros = e.paises.filter((p) => p.id !== "pt");
  const densidades = new Map(e.paises.map((p) => [p.id, tabelaDensidade(p, m.talento)]));
  const cidadesPorDistrito = new Map<string, CidadeBase[]>();
  for (const cd of dados.cidades) cidadesPorDistrito.set(cd.distrito, [...(cidadesPorDistrito.get(cd.distrito) ?? []), cd]);
  const c: Ctx = {
    seed: new Rng(e.seed, "mundo"),
    params,
    paises: e.paises,
    porId,
    estrangeiros,
    densidades,
    cidades: dados.cidades,
    cidadesPorDistrito,
    inicio: criarData(params.calendario.anoInicial, 7, 1),
    lote,
    vistos: new Set(),
    n: 0,
  };
  const progresso = e.aoProgredir ?? (() => undefined);

  // estatísticas por escalão para normalizar reputação e finanças
  const porEsc = new Map<Escalao, ClubeBase[]>();
  for (const esc of ESCALOES) porEsc.set(esc, dados.clubes.filter((cl) => cl.escalao === esc));
  const stats = new Map<Escalao, { repMin: number; repMax: number; repMedia: number; finMediana: number }>();
  for (const [esc, cls] of porEsc) {
    const reps = cls.map((x) => x.reputacao);
    const repMin = Math.min(...reps);
    const repMax = Math.max(...reps);
    const norm = (r: number) => (repMax > repMin ? (r - repMin) / (repMax - repMin) : 0.5);
    stats.set(esc, { repMin, repMax, repMedia: reps.length ? reps.reduce((a, b) => a + norm(b), 0) / reps.length : 0.5, finMediana: mediana(cls.map((x) => x.financas)) });
  }

  // ---------- clubes: plantel, treinador, staff, presidente
  const clubes = [...dados.clubes].sort((a, b) => (a.id < b.id ? -1 : 1));
  clubes.forEach((cl, i) => {
    progresso("clubes", i, clubes.length);
    const rng = c.seed.derivar(`clube/${cl.id}`);
    const esc = cl.escalao;
    const st = stats.get(esc) as { repMin: number; repMax: number; repMedia: number; finMediana: number };
    const repNorm = st.repMax > st.repMin ? (cl.reputacao - st.repMin) / (st.repMax - st.repMin) : 0.5;
    const alvo = m.qualidadeAlvo[esc];
    const pEstr = limitar(params.estrangeiros[esc] * (1 + m.estrangeirosVariacaoReputacao * (repNorm - st.repMedia) * 2), 0, 0.95);
    const escalaSalario = limitar((cl.financas / st.finMediana) ** 0.4, 0.4, 2.5);
    for (const pos of distribuirPosicoes(m.plantel[esc], m.lugaresPorPosicao)) {
      const qAlvo = limitar(rng.gauss(alvo.media + m.qualidadePorReputacao * (repNorm - st.repMedia), alvo.desvio), 1, 20);
      criarJogador(c, rng, { pos, esc, qAlvo, clube: cl, pEstrangeiro: pEstr, lod: 1, escalaSalario });
    }
    FUNCOES_STAFF.slice(0, m.staffPorClube).forEach(({ funcao, areas }) => {
      const qualidade = Object.fromEntries(areas.map((a) => [a, limitar(Math.round(rng.gauss(alvo.media + 0.5, 2)), 1, 20)]));
      const estr = funcao === "treinador" && rng.prob(Math.min(0.5, pEstr));
      const pais = estr ? rng.ponderado(estrangeiros, (p) => pesoParaPortugal(p, esc)) : undefined;
      criarCargo(c, rng, funcao, funcao === "treinador" ? "treinador" : "staff", funcao === "treinador" ? 47 : 42, {
        clube: cl.id,
        qualidade,
        ...(pais ? { pais } : {}),
        ctx: funcao === "treinador" ? { veterano: rng.prob(0.3) } : {},
      });
    });
    criarCargo(c, rng, "presidente", "presidente", 56, { clube: cl.id, cidade: cl.cidade, naturalDe: cl.cidade });
  });
  progresso("clubes", clubes.length, clubes.length);

  // ---------- autarcas (traços do CSV) e empresários
  const cidades = [...dados.cidades].sort((a, b) => (a.id < b.id ? -1 : 1));
  cidades.forEach((cd, i) => {
    progresso("cidades", i, cidades.length);
    const rng = c.seed.derivar(`cidade/${cd.id}`);
    criarCargo(c, rng, "autarca", "autarca", 54, { cidade: cd.id, naturalDe: cd.id, ctx: { fixos: cd.autarca.tracos } });
  });
  progresso("cidades", cidades.length, cidades.length);

  const rngOutros = c.seed.derivar("outros");
  const nOutros = m.outros;
  const gerarVarios = (n: number, funcao: FuncaoCargo, papel: PapelPessoa, idade: number, porCidade: boolean, estrangeiro = 0) => {
    for (let i = 0; i < n; i++) {
      const cd = porCidade ? cidadeSorteada(rngOutros, cidades) : undefined;
      const pais = rngOutros.prob(estrangeiro) ? rngOutros.ponderado(estrangeiros, (p) => pesoNascimento(p) * p.afinidadePortugal) : undefined;
      criarCargo(c, rngOutros, funcao, papel, idade, { ...(cd ? { cidade: cd.id, naturalDe: cd.id } : {}), ...(pais ? { pais } : {}) });
    }
  };
  gerarVarios(nOutros.empresarios, "empresario", "empresario", 50, true);
  gerarVarios(nOutros.dirigentesAdeptos, "dirigenteAdeptos", "adepto", 46, true);
  gerarVarios(nOutros.agentes, "agente", "agente", 44, false, 0.3);
  gerarVarios(nOutros.arbitros, "arbitro", "arbitro", 34, false);
  gerarVarios(nOutros.jornalistas, "jornalista", "jornalista", 40, false);
  for (let i = 0; i < nOutros.staffLivres; i++) {
    const f = rngOutros.escolher(FUNCOES_STAFF);
    criarCargo(c, rngOutros, f.funcao, f.funcao === "treinador" ? "treinador" : "staff", 44, {
      qualidade: Object.fromEntries(f.areas.map((a) => [a, limitar(Math.round(rngOutros.gauss(9, 3)), 1, 20)])),
    });
  }
  progresso("outros", 1, 1);

  // ---------- jogadores sem clube
  const rngLivres = c.seed.derivar("livres");
  const pesoEsc: Record<Escalao, number> = { primeiraLiga: 5, segundaLiga: 10, terceiraLiga: 15, cp: 30, distrital: 40 };
  for (let i = 0; i < m.livres; i++) {
    if (i % 250 === 0) progresso("livres", i, m.livres);
    const esc = rngLivres.ponderado(ESCALOES, (x) => pesoEsc[x]);
    const alvo = m.qualidadeAlvo[esc];
    const pos = rngLivres.ponderado([...POSICOES], (p) => m.lugaresPorPosicao[p]);
    const qAlvo = limitar(rngLivres.gauss(alvo.media - 0.7, alvo.desvio + 0.4), 1, 20);
    criarJogador(c, rngLivres, { pos, esc, qAlvo, pEstrangeiro: params.estrangeiros[esc] * 1.1, lod: 2, escalaSalario: 1 });
  }
  progresso("livres", m.livres, m.livres);
  return lote;
}
