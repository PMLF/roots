import { criarData } from "../calendario/datas";
import { PARAMETROS_PADRAO } from "../config/parametros";
import { VERSAO_ESQUEMA as ESQUEMA_BD } from "../persistencia/esquema";
import type { Repositorio } from "../persistencia/repositorio";
import { importarDados } from "../dados/importar";
import type { DadosBase, FontesCsv } from "../dados/tipos";
import { gerarMundo } from "../mundo/gerarMundo";
import { importarPaises, type Pais } from "../mundo/paises";
import { validarMundo } from "../mundo/validar";
import { competicoesDoMundo, jogoLab, ligaLab } from "../laboratorio/laboratorio";
import { nivelDeReputacao } from "../clube/reputacao";
import { nivelGeral } from "../mundo/nivel";
import { CHAVE } from "../mundo/jogador";
import type { Atributo, Posicao } from "../mundo/tipos";
import { Vista } from "../vista/vista";
import { indexar, pesquisar, type EntradaIndice, type Indexada } from "../pesquisa/pesquisar";
import type { NivelEstimado, VerdadePessoa, ClubeResumo, DiagnosticoBd, FichaClubeDados, FichaLocalidadeDados, FichaPessoaDados, RefEntidade, EstatutoLocalidade, Mensagem, PedidosMotor, ProgressoMundo, ResumoMundoCriado, TipoPedido } from "./contratos";

export const VERSAO_MOTOR = "0.1.0";
export const VERSAO_ESQUEMA = ESQUEMA_BD;

/** O que o motor precisa do exterior. O worker fornece o SQLite do browser; os testes, memória. */
export type Servicos = {
  /** Texto dos CSV de `data/` (o worker vai buscá-los a /dados/; os testes lêem do disco). */
  carregarDados(): Promise<FontesCsv & { paises: string }>;
  abrirRepositorio(): Promise<{
    repositorio: Repositorio;
    backend: DiagnosticoBd["backend"];
    versaoSqlite: string;
    motivoMemoria?: string;
  }>;
};

/** Trata um pedido. Sem DOM nem worker, para ser testada diretamente. */
export async function tratar<K extends TipoPedido>(m: Mensagem<K>, servicos: Servicos, aoProgredir?: (p: ProgressoMundo) => void): Promise<PedidosMotor[K]["saida"]>;
export async function tratar(m: Mensagem, servicos: Servicos, aoProgredir: (p: ProgressoMundo) => void = () => undefined): Promise<unknown> {
  switch (m.tipo) {
    case "ping":
      return { eco: m.entrada.eco, relogioMs: Date.now() };
    case "versao":
      return { motor: VERSAO_MOTOR, esquema: VERSAO_ESQUEMA };
    case "parametros":
      return PARAMETROS_PADRAO;
    case "bd": {
      const a = await servicos.abrirRepositorio();
      const r = a.repositorio;
      r.acrescentarEvento({ tipo: "DIAGNOSTICO", data: new Date().toISOString().slice(0, 10), epoca: 0, vis: "privado", entidades: [], dados: {} });
      const saida: DiagnosticoBd = {
        backend: a.backend,
        persistente: a.backend === "opfs",
        ...(a.motivoMemoria !== undefined ? { motivoMemoria: a.motivoMemoria } : {}),
        sqlite: a.versaoSqlite,
        esquema: r.versaoEsquema,
        aberturas: r.contar("DIAGNOSTICO"),
        eventos: r.totalEventos(),
      };
      return saida;
    }
    case "clubes": {
      const { dados } = await dadosDoJogo(servicos);
      return dados.clubes.map((c): ClubeResumo => ({ id: c.id, nome: c.nome, liga: c.liga }));
    }
    case "estadoMundo": {
      const [{ repositorio }, { dados }] = await Promise.all([servicos.abrirRepositorio(), dadosDoJogo(servicos)]);
      if (repositorio.totalPessoas() === 0) return null;
      completarLocalidades(repositorio, dados);
      return resumoExistente(repositorio, dados);
    }
    case "criarMundo":
      return criarMundo(m.entrada.seed, servicos, aoProgredir);
    case "reiniciarMundo": {
      const { repositorio } = await servicos.abrirRepositorio();
      repositorio.reiniciar();
      indices.delete(repositorio);
      return criarMundo(m.entrada.seed, servicos, aoProgredir);
    }
    case "paises":
      return (await dadosDoJogo(servicos)).paises.map((p) => ({ id: p.id, nome: p.nome }));
    case "pesquisar": {
      const [{ repositorio }, jogo] = await Promise.all([servicos.abrirRepositorio(), dadosDoJogo(servicos)]);
      return pesquisar(m.entrada.q, indiceDePesquisa(repositorio, jogo.dados), m.entrada.limite ?? 12);
    }
    case "fichaPessoa": {
      const [{ repositorio }, { dados }] = await Promise.all([servicos.abrirRepositorio(), dadosDoJogo(servicos)]);
      const ficha = vistaDoGamer(repositorio).ficha(m.entrada.id);
      if (!ficha) return null;
      const vista = vistaDoGamer(repositorio);
      const saida: FichaPessoaDados = { ficha, stats: vista.statsJogador(m.entrada.id) };
      const contrato = repositorio.contrato(m.entrada.id);
      if (contrato) saida.contrato = { inicio: contrato.inicio, fim: contrato.fim };
      const nivel = nivelDoJogador(repositorio, m.entrada.id, ficha.publico.jogador?.posicao, ficha.atributos?.campos, m.entrada.verTudo === true);
      if (nivel) saida.nivel = nivel;
      if (m.entrada.verTudo) saida.verdade = verdadeDaPessoa(repositorio, m.entrada.id);
      const clube = ficha.publico.clube ? dados.clubes.find((c) => c.id === ficha.publico.clube) : undefined;
      if (clube) saida.clube = { k: "clube", id: clube.id, nome: clube.nome };
      const cidade = ficha.publico.naturalDe ? dados.cidades.find((c) => c.id === ficha.publico.naturalDe) : undefined;
      if (cidade) saida.naturalDe = { k: "cidade", id: cidade.id, nome: cidade.nome };
      return saida;
    }
    case "fichaClube": {
      const [{ repositorio }, { dados }] = await Promise.all([servicos.abrirRepositorio(), dadosDoJogo(servicos)]);
      const c = dados.clubes.find((x) => x.id === m.entrada.id);
      if (!c) return null;
      const verTudo = m.entrada.verTudo === true;
      const vista = vistaDoGamer(repositorio);
      const cidade = dados.cidades.find((x) => x.id === c.cidade);
      const rival = dados.clubes.find((x) => x.id === c.rival);
      const loc = repositorio.localidade(c.localidadeId);
      const saida: FichaClubeDados = {
        id: c.id, nome: c.nome, liga: c.liga,
        localidade: { k: "localidade", id: c.localidadeId, nome: c.localidade, estatuto: loc?.estatuto ?? dados.localidades.find((x) => x.id === c.localidadeId)?.estatuto ?? "vila" },
        cidade: { k: "cidade", id: c.cidade, nome: cidade?.nome ?? c.cidade },
        distrito: c.distrito, cores: c.cores, alcunha: c.alcunha, mascote: c.mascote, reputacao: c.reputacao,
        ...(rival ? { rival: { k: "clube", id: rival.id, nome: rival.nome } as RefEntidade } : {}),
        estadio: { nome: c.estadio.nome, capacidade: c.estadio.capacidade },
        plantel: vista.plantel(c.id),
        cargos: vista.cargos({ clube: c.id }),
        escalao: c.escalao,
        nivelReputacao: nivelDeReputacao(c.reputacao, PARAMETROS_PADRAO),
        estadioDetalhe: { propriedade: c.estadio.propriedade, zona: c.estadio.localizacao.zona, distanciaCentroKm: c.estadio.localizacao.distanciaCentroKm, transportes: c.estadio.localizacao.transportes, acessoRodoviario: c.estadio.localizacao.acessoRodoviario, estacionamento: c.estadio.localizacao.estacionamento, terrenoExpansao: c.estadio.localizacao.terrenoExpansao },
        historicoDivisoes: [{ epoca: 1, escalao: c.escalao, liga: c.liga }],
        plantelExtra: {},
      };
      for (const j of saida.plantel) {
        const ct = repositorio.contrato(j.id);
        const campos = verTudo ? undefined : vista.ficha(j.id)?.atributos?.campos;
        const nivel = nivelDoJogador(repositorio, j.id, j.jogador?.posicao, campos, verTudo);
        saida.plantelExtra[j.id] = { ...(ct ? { contratoFim: ct.fim } : {}), ...(nivel ? { nivel } : {}) };
      }
      if (verTudo) {
        const niveis = saida.plantel.map((j) => saida.plantelExtra[j.id]?.nivel?.valor).filter((v): v is number => v !== undefined);
        saida.verdade = {
          reputacao: c.reputacao,
          financas: c.financas,
          qualidadeStaff: Object.fromEntries(saida.cargos.flatMap((p) => { const q = repositorio.cargo(p.id)?.qualidade; return q ? [[p.id, q]] : []; })),
          plantelNivel: niveis.length ? Math.round((niveis.reduce((s, v) => s + v, 0) / niveis.length) * 10) / 10 : 0,
        };
      }
      return saida;
    }
    case "fichaLocalidade": {
      const [{ repositorio }, { dados }] = await Promise.all([servicos.abrirRepositorio(), dadosDoJogo(servicos)]);
      const base = dados.localidades.find((x) => x.id === m.entrada.id);
      if (!base) return null;
      // antes de haver mundo mostra-se o estado de arranque
      const atual = repositorio.localidade(m.entrada.id) ?? { populacao: base.populacao, estatuto: base.estatuto, desde: criarData(PARAMETROS_PADRAO.calendario.anoInicial, 7, 1) };
      const cidade = dados.cidades.find((x) => x.id === base.cidade);
      const historico = repositorio
        .eventosDe({ k: "localidade", id: base.id }, { apenasPublicos: true, tipo: "LOCALIDADE_ESTATUTO" })
        .map((e) => ({ data: e.data, de: e.dados.de as EstatutoLocalidade, para: e.dados.para as EstatutoLocalidade, populacao: Number(e.dados.populacao) }));
      const saida: FichaLocalidadeDados = {
        id: base.id, nome: base.nome, estatuto: atual.estatuto, populacao: atual.populacao, desde: atual.desde, sede: base.sede,
        cidade: { k: "cidade", id: base.cidade, nome: cidade?.nome ?? base.cidade }, distrito: base.distrito,
        clubes: base.clubes.flatMap((id) => {
          const c = dados.clubes.find((x) => x.id === id);
          return c ? [{ k: "clube" as const, id: c.id, nome: c.nome, liga: c.liga }] : [];
        }),
        historico,
      };
      return saida;
    }
    case "competicoes":
      return competicoesDoMundo((await dadosDoJogo(servicos)).dados);
    case "laboratorioJogo": {
      const [{ repositorio }, { dados }] = await Promise.all([servicos.abrirRepositorio(), dadosDoJogo(servicos)]);
      return jogoLab(repositorio, dados, PARAMETROS_PADRAO, m.entrada);
    }
    case "laboratorioLiga": {
      const [{ repositorio }, { dados }] = await Promise.all([servicos.abrirRepositorio(), dadosDoJogo(servicos)]);
      return ligaLab(repositorio, dados, PARAMETROS_PADRAO, m.entrada);
    }
    case "plantel": {
      const { repositorio } = await servicos.abrirRepositorio();
      const clube = m.entrada.clube;
      return vistaDoGamer(repositorio, clube).plantel(clube);
    }
  }
}

/** Nível geral do jogador: exato com «ver tudo»; senão estimado a partir dos atributos que se conhecem (e só se se conhecem todos os da posição). */
function nivelDoJogador(r: Repositorio, id: string, posicao: string | undefined, campos: Record<string, { valor: number; margem: number }> | undefined, verTudo: boolean): NivelEstimado | undefined {
  if (!posicao || !(posicao in CHAVE)) return undefined;
  const pos = posicao as Posicao;
  if (verTudo) {
    const at = r.jogador(id)?.atributos;
    const v = at ? nivelGeral((a) => at[a], pos) : undefined;
    return v === undefined ? undefined : { valor: v, margem: 0, exato: true };
  }
  if (!campos) return undefined;
  const v = nivelGeral((a: Atributo) => campos[a]?.valor, pos);
  if (v === undefined) return undefined;
  const margens = CHAVE[pos].map((a) => campos[a]?.margem ?? 0);
  return { valor: v, margem: Math.round((margens.reduce((s, x) => s + x, 0) / margens.length) * 10) / 10, exato: false };
}

function verdadeDaPessoa(r: Repositorio, id: string): VerdadePessoa | undefined {
  const p = r.pessoa(id);
  if (!p) return undefined;
  const j = r.jogador(id);
  const ct = r.contrato(id);
  const cg = r.cargo(id);
  return {
    personalidade: p.personalidade, arquetipo: p.arquetipo, lod: p.lod,
    ...(j ? { atributos: j.atributos, potencial: j.potencial, posicoes: j.posicoes } : {}),
    ...(ct ? { salarioMensal: ct.salarioMensal } : {}),
    ...(cg?.qualidade ? { qualidade: cg.qualidade } : {}),
  };
}

type DadosDoJogo = { dados: DadosBase; paises: Pais[] };
const cache = new WeakMap<Servicos, Promise<DadosDoJogo>>();

/** Lê e valida os CSV uma vez por conjunto de serviços. */
function dadosDoJogo(servicos: Servicos): Promise<DadosDoJogo> {
  let p = cache.get(servicos);
  if (!p) {
    p = servicos.carregarDados().then((f) => {
      const d = importarDados(f);
      if (!d.ok) throw new Error("Dados inválidos:\n" + d.erros.join("\n"));
      const pa = importarPaises(f.paises);
      if (!pa.ok) throw new Error("Países inválidos:\n" + pa.erros.join("\n"));
      return { dados: d.dados, paises: pa.paises };
    });
    cache.set(servicos, p);
    p.catch(() => cache.delete(servicos));
  }
  return p;
}

async function criarMundo(seed: string, servicos: Servicos, aoProgredir: (p: ProgressoMundo) => void): Promise<ResumoMundoCriado> {
  const [{ repositorio }, { dados, paises }] = await Promise.all([servicos.abrirRepositorio(), dadosDoJogo(servicos)]);
  if (repositorio.totalPessoas() > 0) {
    // reabrir um save que já tem mundo: não se gera outra vez
    completarLocalidades(repositorio, dados);
    return resumoExistente(repositorio, dados);
  }
  const t0 = Date.now();
  const params = PARAMETROS_PADRAO;
  const lote = gerarMundo({ seed, dados, paises, params, aoProgredir: (fase, feito, total) => aoProgredir({ fase, feito, total }) });
  aoProgredir({ fase: "validar", feito: 0, total: 1 });
  const v = validarMundo(lote, dados, paises, params);
  if (v.erros.length > 0) throw new Error("Mundo gerado inválido:\n" + v.erros.slice(0, 10).join("\n"));
  repositorio.transacao(() => {
    repositorio.definirMeta("seed", seed);
    repositorio.definirMeta("mundo.jogadores", String(lote.jogadores.length));
    guardarLocalidadesDeArranque(repositorio, dados);
    repositorio.guardarMundo(lote, (feito, total) => aoProgredir({ fase: "guardar", feito, total }));
  });
  return { seed, clubes: dados.clubes.length, pessoas: lote.pessoas.length, jogadores: lote.jogadores.length, ms: Date.now() - t0, avisos: v.avisos, jaExistia: false };
}

function guardarLocalidadesDeArranque(r: Repositorio, dados: DadosBase): void {
  r.guardarLocalidades(
    dados.localidades.map((l) => ({
      id: l.id, nome: l.nome, cidade: l.cidade, populacao: l.populacao, estatuto: l.estatuto,
      desde: criarData(PARAMETROS_PADRAO.calendario.anoInicial, 7, 1),
    })),
  );
}

/** Saves criados antes da migração 4 não têm localidades: preenche-as com o estado de arranque (idempotente). */
function completarLocalidades(r: Repositorio, dados: DadosBase): void {
  if (r.localidades().length === 0) guardarLocalidadesDeArranque(r, dados);
}

function resumoExistente(r: Repositorio, dados: DadosBase): ResumoMundoCriado {
  return { seed: r.meta("seed") ?? "?", clubes: dados.clubes.length, pessoas: r.totalPessoas(), jogadores: Number(r.meta("mundo.jogadores") ?? 0), ms: 0, avisos: [], jaExistia: true };
}

/**
 * A Vista de quem joga. Enquanto não há escolha de clube (RZ-134/RZ-120), o observador é o clube
 * guardado em `clube.gamer` ou ninguém: só factos públicos.
 */
function vistaDoGamer(r: Repositorio, observador?: string): Vista {
  const clube = observador ?? r.meta("clube.gamer") ?? "";
  const hoje = criarData(PARAMETROS_PADRAO.calendario.anoInicial, 7, 1);
  return new Vista(r, { observador: clube, participantes: new Set(clube ? [`clube:${clube}`] : []), data: hoje, epoca: 1 }, PARAMETROS_PADRAO.conhecimento);
}

const indices = new WeakMap<Repositorio, { pessoas: number; indice: Indexada[] }>();

/** Índice de pesquisa (clubes, cidades, pessoas); refaz-se só se o nº de pessoas mudar. */
function indiceDePesquisa(r: Repositorio, dados: DadosBase): Indexada[] {
  const total = r.totalPessoas();
  const guardado = indices.get(r);
  if (guardado && guardado.pessoas === total) return guardado.indice;
  const nomeClube = new Map(dados.clubes.map((c) => [c.id, c.nome] as const));
  const entradas: EntradaIndice[] = [
    ...dados.clubes.map((c): EntradaIndice => ({ k: "clube", id: c.id, titulo: c.nome, subtitulo: c.liga, extra: `${c.localidade} ${c.alcunha}` })),
    ...dados.cidades.map((c): EntradaIndice => ({ k: "cidade", id: c.id, titulo: c.nome, subtitulo: c.distrito })),
    ...dados.localidades.filter((l) => !l.sede).map((l): EntradaIndice => ({ k: "localidade", id: l.id, titulo: l.nome, subtitulo: `${l.estatuto} · ${dados.cidades.find((c) => c.id === l.cidade)?.nome ?? ""}` })),
    ...r.indicePessoas().map((p): EntradaIndice => ({
      k: "pessoa", id: p.id, titulo: p.nomeDesportivo,
      subtitulo: [p.posicao ?? p.funcao, p.clube ? nomeClube.get(p.clube) : undefined].filter(Boolean).join(" · "),
      extra: p.nome,
    })),
  ];
  const indice = indexar(entradas);
  indices.set(r, { pessoas: total, indice });
  return indice;
}
