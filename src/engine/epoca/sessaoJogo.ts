/**
 * Jogo do gamer ao vivo (RZ-170): o jogo não se simula de uma vez. A sessão guarda o ponto de partida (equipas e tática
 * escolhidas), o minuto atual e as mudanças de tática feitas a meio; como o motor é determinístico e retomável por minuto,
 * o estado reconstrói-se sempre a partir disto (`reproduzir`). Cada passo simula só os minutos pedidos, com a tática em vigor
 * em cada momento. Nada vai para o histórico (nem notícias, nem caixa de entrada) até ao apito final (`finalizar`).
 */
import type { Parametros } from "../config/parametros";
import type { DadosBase } from "../dados/tipos";
import { SimuladorJogo } from "../jogo/simulador";
import { jogarJogo, resolverJogo } from "../jogo/detalhe";
import type { EntradaJogo, EventoJogo, Lado, Tatica } from "../jogo/tipos";
import type { Repositorio } from "../persistencia/repositorio";
import type { Data } from "../persistencia/tipos";
import { coresDos, equipaParaJogo, tabelaAntes, zonasDa } from "./avancar";
import { CHAVE_SESSAO, guardarJogoVivo, linhasDoJogo, type JogoVivo, type LinhaTabelaVivo, type OutroJogoVivo } from "./jogoAoVivo";
import { dadosDaEpoca } from "./piramideEpoca";
import { eventoRival, motivoDeRival } from "./rivais";
import { lerPlano, validarTatica } from "./planoDeJogo";
import { prepararEpoca } from "./preparar";

type Mudanca = { minuto: number; tatica: Tatica };
export type SessaoGuardada = {
  jogo: string;
  competicao: string;
  jornada: number;
  epoca: number;
  data: Data;
  lado: Lado;
  entrada: EntradaJogo;
  mudancas: Mudanca[];
  minuto: number;
  tabela: LinhaTabelaVivo[];
  outros: OutroJogoVivo[];
  pontosVitoria: number;
  pontosEmpate: number;
  cores: Record<string, string>;
  zonas?: { promovidos: number; descidos: number };
};

export function lerSessao(repo: Repositorio): SessaoGuardada | undefined {
  const bruto = repo.meta(CHAVE_SESSAO);
  return bruto ? (JSON.parse(bruto) as SessaoGuardada) : undefined;
}
const guardar = (repo: Repositorio, s: SessaoGuardada) => repo.definirMeta(CHAVE_SESSAO, JSON.stringify(s));

/** Refaz o simulador até ao minuto atual, aplicando as mudanças de tática no minuto em que foram feitas. */
function reproduzir(s: SessaoGuardada, params: Parametros, ate: number = s.minuto): { sim: SimuladorJogo; eventos: EventoJogo[] } {
  const sim = new SimuladorJogo(s.entrada, params);
  const eventos: EventoJogo[] = [];
  const mudancas = s.mudancas.filter((m) => m.minuto <= ate);
  for (const m of mudancas) {
    eventos.push(...sim.simularAte(m.minuto));
    sim.mudarTatica(s.lado, m.tatica);
  }
  eventos.push(...sim.simularAte(ate));
  return { sim, eventos };
}

/** A vista do jogo no minuto atual: o mesmo formato do jogo guardado, só com o que já aconteceu. */
function vista(repo: Repositorio, s: SessaoGuardada, params: Parametros, nomes: ReadonlyMap<string, string>): JogoVivo {
  const { sim, eventos } = reproduzir(s, params);
  const resumo = sim.resumo();
  const nomePessoa = (id: string) => repo.pessoaPublica(id)?.nomeDesportivo ?? id;
  const linhas = linhasDoJogo(eventos, sim.duracao, nomePessoa).filter((l) => l.minuto <= s.minuto && (l.tipo !== "fim" || sim.terminado));
  const ultima = [...s.mudancas].reverse()[0]?.tatica ?? (s.lado === "casa" ? s.entrada.casa.tatica : s.entrada.fora.tatica);
  const outros = s.outros.map((o) => {
    const golos = o.golos.filter((g) => g.minuto <= s.minuto);
    return { ...o, golos, golosCasa: golos.filter((g) => g.lado === "casa").length, golosFora: golos.filter((g) => g.lado === "fora").length };
  });
  return {
    id: s.jogo, competicao: s.competicao, jornada: s.jornada, data: s.data,
    casa: { id: s.entrada.casa.clube, nome: nomes.get(s.entrada.casa.clube) ?? s.entrada.casa.clube },
    fora: { id: s.entrada.fora.clube, nome: nomes.get(s.entrada.fora.clube) ?? s.entrada.fora.clube },
    duracao: sim.duracao, golosCasa: resumo.casa.golos, golosFora: resumo.fora.golos, linhas,
    tabela: s.tabela, pontosVitoria: s.pontosVitoria, pontosEmpate: s.pontosEmpate, outros, cores: s.cores, ...(s.zonas ? { zonas: s.zonas } : {}),
    resumo, ladoGamer: s.lado, emCurso: true, minuto: s.minuto, ...(ultima ? { tatica: ultima } : {}),
  };
}

const nomesDe = (dados: DadosBase) => new Map(dados.clubes.map((c) => [c.id, c.nome] as const));

/** Começa o jogo do gamer (já com a tática e o onze do plano). Não regista nada no histórico. */
export function iniciarSessao(repo: Repositorio, base: DadosBase, params: Parametros, clubeGamer: string, jogo: string): JogoVivo {
  const existente = lerSessao(repo);
  const dados = dadosDaEpoca(repo, base);
  const nomes = nomesDe(dados);
  if (existente) {
    if (existente.jogo !== jogo) throw new Error("Já há um jogo a decorrer");
    return vista(repo, existente, params, nomes);
  }
  const { hoje, epoca } = prepararEpoca(repo, dados, params);
  const g = repo.jogosDoDia(hoje).find((x) => x.id === jogo);
  if (!g || repo.jogo(g.id) || (g.casa !== clubeGamer && g.fora !== clubeGamer)) throw new Error("Este jogo não é para jogar hoje");
  const seed = repo.meta("seed") ?? "?";
  const plano = lerPlano(repo, clubeGamer);
  const casa = equipaParaJogo(repo, g.casa, g.competicao, epoca, g.jornada, hoje, seed, params, g.casa === clubeGamer ? plano : undefined);
  const fora = equipaParaJogo(repo, g.fora, g.competicao, epoca, g.jornada, hoje, seed, params, g.fora === clubeGamer ? plano : undefined);
  const lado: Lado = g.casa === clubeGamer ? "casa" : "fora";
  // os outros jogos da competição, no mesmo dia: já se sabe o que vão dar (não dependem do teu jogo) mas só se mostram ao minuto
  const outros: OutroJogoVivo[] = [];
  for (const o of repo.jogosDoDia(hoje)) {
    if (o.id === g.id || o.competicao !== g.competicao || repo.jogo(o.id)) continue;
    const ec = equipaParaJogo(repo, o.casa, o.competicao, epoca, o.jornada, hoje, seed, params);
    const ef = equipaParaJogo(repo, o.fora, o.competicao, epoca, o.jornada, hoje, seed, params);
    const r = jogarJogo({ seed, id: o.id, casa: ec, fora: ef }, 1, { id: o.id, competicao: o.competicao, epoca, jornada: o.jornada, data: hoje }, params);
    outros.push({ id: o.id, casa: { id: o.casa, nome: nomes.get(o.casa) ?? o.casa }, fora: { id: o.fora, nome: nomes.get(o.fora) ?? o.fora }, duracao: r.relatorio.duracao, golos: r.relatorio.golos.map((x) => ({ minuto: x.minuto, lado: x.lado })), golosCasa: r.relatorio.golosCasa, golosFora: r.relatorio.golosFora });
  }
  const tabela = tabelaAntes(repo, g.competicao, epoca, nomes);
  const s: SessaoGuardada = {
    jogo: g.id, competicao: g.competicao, jornada: g.jornada, epoca, data: hoje, lado, entrada: { seed, id: g.id, casa, fora }, mudancas: [], minuto: 0,
    tabela, outros, pontosVitoria: params.classificacao.pontosVitoria, pontosEmpate: params.classificacao.pontosEmpate, cores: coresDos(dados, [g.casa, g.fora, ...tabela.map((l) => l.clube)]), zonas: zonasDa(dados, params, clubeGamer),
  };
  guardar(repo, s);
  return vista(repo, s, params, nomes);
}

/** O jogo a decorrer, se houver, no minuto em que está. */
export function sessaoAtual(repo: Repositorio, base: DadosBase, params: Parametros): JogoVivo | null {
  const s = lerSessao(repo);
  return s ? vista(repo, s, params, nomesDe(dadosDaEpoca(repo, base))) : null;
}

/** Avança `minutos` minutos (a partir de agora, com a tática em vigor). No apito final regista o jogo. */
export function passoSessao(repo: Repositorio, base: DadosBase, params: Parametros, minutos: number): JogoVivo {
  const s = lerSessao(repo);
  if (!s) throw new Error("Não há jogo a decorrer");
  const dados = dadosDaEpoca(repo, base);
  const { sim } = reproduzir(s, params);
  const novo = { ...s, minuto: Math.min(sim.duracao, s.minuto + Math.max(0, Math.floor(minutos))) };
  if (novo.minuto >= sim.duracao) return finalizar(repo, dados, params, novo);
  guardar(repo, novo);
  return vista(repo, novo, params, nomesDe(dados));
}

/** Muda a tática do gamer a partir do minuto seguinte. */
export function mudarTaticaSessao(repo: Repositorio, base: DadosBase, params: Parametros, tatica: Tatica): JogoVivo {
  const s = lerSessao(repo);
  if (!s) throw new Error("Não há jogo a decorrer");
  validarTatica(tatica);
  const atual = [...s.mudancas].reverse()[0]?.tatica ?? (s.lado === "casa" ? s.entrada.casa.tatica : s.entrada.fora.tatica);
  if (atual && atual.formacao !== tatica.formacao) throw new Error("A formação não muda a meio do jogo");
  const novo = { ...s, mudancas: [...s.mudancas, { minuto: s.minuto, tatica }] };
  guardar(repo, novo);
  return vista(repo, novo, params, nomesDe(dadosDaEpoca(repo, base)));
}

/** Apito final: regista o jogo, as lesões e as histórias (é aqui que nascem as notícias e as mensagens) e guarda a repetição. */
function finalizar(repo: Repositorio, dados: DadosBase, params: Parametros, s: SessaoGuardada): JogoVivo {
  const nomes = nomesDe(dados);
  const nomePessoa = (id: string) => repo.pessoaPublica(id)?.nomeDesportivo ?? id;
  const { sim, eventos } = reproduzir(s, params, 10_000);
  const resumo = sim.resumo();
  const r = resolverJogo(s.entrada, eventos, resumo, 0, { id: s.jogo, competicao: s.competicao, epoca: s.epoca, jornada: s.jornada, data: s.data }, params);
  if (r.nivel !== 0) throw new Error("nível inesperado");
  return repo.transacao(() => {
    const gamer = repo.meta("clube.gamer");
    const rival = gamer ? motivoDeRival(repo, dados, params, s.competicao, s.epoca, gamer, s.entrada.casa.clube === gamer ? s.entrada.fora.clube : s.entrada.casa.clube) : undefined;
    const { evento } = repo.registarJogo(r.registo.jogo, r.registo.factos, r.registo.participacoes);
    if (rival) repo.acrescentarEvento(eventoRival(s.jogo, s.entrada.casa.clube, s.entrada.fora.clube, s.data, s.epoca, s.jornada, evento, rival));
    for (const l of r.registo.lesoes) repo.acrescentarEvento({ ...l, causa: evento });
    for (const h of r.historias) repo.acrescentarEvento({ ...h, causa: evento });
    const jogo: JogoVivo = {
      id: s.jogo, competicao: s.competicao, jornada: s.jornada, data: s.data,
      casa: { id: s.entrada.casa.clube, nome: nomes.get(s.entrada.casa.clube) ?? s.entrada.casa.clube },
      fora: { id: s.entrada.fora.clube, nome: nomes.get(s.entrada.fora.clube) ?? s.entrada.fora.clube },
      duracao: r.relatorio.duracao, golosCasa: r.relatorio.golosCasa, golosFora: r.relatorio.golosFora,
      linhas: linhasDoJogo(r.eventos, r.relatorio.duracao, nomePessoa), tabela: s.tabela, pontosVitoria: s.pontosVitoria, pontosEmpate: s.pontosEmpate, outros: s.outros,
      cores: s.cores, ...(s.zonas ? { zonas: s.zonas } : {}), resumo, ladoGamer: s.lado,
    };
    guardarJogoVivo(repo, jogo);
    repo.definirMeta(CHAVE_SESSAO, "");
    return jogo;
  });
}
