/**
 * Avançar no tempo (RZ-119; docs/DESIGN_REGRAS.md §6b): cada dia joga os jogos marcados nesse dia, com o mesmo motor para
 * todos. O jogo do clube do gamer guarda tudo (nível 0); os outros guardam o resumo público (golos, cartões, lesões, nota
 * do homem do jogo; nível 1, RZ-109). Lesões e suspensões contam: quem está lesionado ou suspenso não entra no onze e as
 * histórias saem dos jogos como em qualquer outro. Puro em relação ao tempo real: a data vive no save (`data.hoje`).
 */
import { Rng } from "../aleatorio/rng";
import { criarData, somarDias } from "../calendario/datas";
import { gerarCalendariosDaEpoca, paraRepositorio, type DefinicaoLiga } from "../calendario/calendario";
import type { Escalao, Parametros } from "../config/parametros";
import type { DadosBase } from "../dados/tipos";
import { suspensosDoClube } from "../disciplina/castigos";
import { jogarJogo, nivelDoJogo } from "../jogo/detalhe";
import { onzeAutomatico, type CandidatoOnze } from "../jogo/equipa";
import { FORMACOES, TATICA_PADRAO } from "../jogo/formacoes";
import type { EquipaJogo } from "../jogo/tipos";
import { EVENTO_LESAO } from "../lesoes/estado";
import type { Repositorio } from "../persistencia/repositorio";
import type { Data, JogoAgendado } from "../persistencia/tipos";

export type JogoDoDia = {
  id: string;
  competicao: string;
  jornada: number;
  casa: string;
  fora: string;
  casaNome: string;
  foraNome: string;
  golosCasa: number;
  golosFora: number;
  nivel: 0 | 1;
  golos: { minuto: number; jogador: string; nome: string; clube: string }[];
  cartoes: { minuto: number; jogador: string; nome: string; clube: string; cor: "amarelo" | "vermelho" }[];
  lesoes: { minuto: number; jogador: string; nome: string; clube: string; gravidade: number; dias: number }[];
  homemDoJogo?: { jogador: string; nome: string; nota: number };
};

export type ResumoDia = { data: Data; jogos: JogoDoDia[] };

export type EstadoTempo = { hoje: Data; epoca: number; /** Jogos por disputar nesta época. */ porJogar: number; /** Próximo dia com jogos. */ proximoDiaDeJogos?: Data };

export type Modo = "dia" | "semana" | "proximoJogo";

export type ResultadoAvanco = { de: Data; ate: Data; dias: ResumoDia[]; fimDeEpoca: boolean; estado: EstadoTempo };

const MAX_DIAS = 400;

const ligasDoMundo = (dados: DadosBase): DefinicaoLiga[] => {
  const m = new Map<string, DefinicaoLiga>();
  for (const c of dados.clubes) (m.get(c.liga) ?? m.set(c.liga, { competicao: c.liga, escalao: c.escalao as Escalao, clubes: [] }).get(c.liga)!).clubes.push(c.id);
  return [...m.values()];
};

/** Garante que a época tem calendário gravado e o save tem data. Idempotente. */
export function prepararEpoca(repo: Repositorio, dados: DadosBase, params: Parametros): { hoje: Data; epoca: number } {
  const epoca = Number(repo.meta("epoca") ?? 1);
  const primeira = ligasDoMundo(dados)[0];
  if (primeira && repo.calendario(primeira.competicao, epoca).jogos.length === 0) {
    const seed = repo.meta("seed") ?? "?";
    repo.transacao(() => {
      for (const cal of gerarCalendariosDaEpoca(ligasDoMundo(dados), epoca, params.calendario, new Rng(`${seed}|cal`))) {
        const { jogos, folgas } = paraRepositorio(cal);
        repo.guardarCalendario(jogos, folgas);
      }
    });
  }
  if (repo.meta("data.hoje") === undefined) repo.definirMeta("data.hoje", criarData(params.calendario.anoInicial + epoca - 1, params.calendario.mesInicioEpoca, 1));
  repo.definirMeta("epoca", String(epoca));
  return { hoje: repo.meta("data.hoje") as Data, epoca };
}

function jogosPorJogar(repo: Repositorio, dados: DadosBase, epoca: number): JogoAgendado[] {
  const out: JogoAgendado[] = [];
  for (const l of ligasDoMundo(dados)) {
    const jogados = new Set(repo.jogosDaCompeticao(l.competicao, epoca).map((j) => j.id));
    for (const j of repo.calendario(l.competicao, epoca).jogos) if (!jogados.has(j.id)) out.push(j);
  }
  return out;
}

export function estadoDoTempo(repo: Repositorio, dados: DadosBase, params: Parametros): EstadoTempo {
  const { hoje, epoca } = prepararEpoca(repo, dados, params);
  const pendentes = jogosPorJogar(repo, dados, epoca);
  const proximo = pendentes.filter((j) => j.data >= hoje).map((j) => j.data).sort()[0];
  return { hoje, epoca, porJogar: pendentes.length, ...(proximo ? { proximoDiaDeJogos: proximo } : {}) };
}

function candidatosDoClube(repo: Repositorio, clube: string): CandidatoOnze[] {
  return repo.jogadoresDoClube(clube).filter((j) => j.estado === "ativo").map((j) => ({ pessoa: j.pessoa, posicoes: j.posicoes, atributos: j.atributos, alturaCm: j.alturaCm }));
}

/** Quem está lesionado no dia `hoje` num clube (um só pedido ao histórico). */
function lesionadosDoClube(repo: Repositorio, clube: string, hoje: Data): Set<string> {
  const fora = new Set<string>();
  for (const e of repo.eventosDe({ k: "clube", id: clube }, { tipo: EVENTO_LESAO })) {
    const ate = (e.dados as { ate?: Data }).ate;
    const j = e.entidades.find((x) => x.k === "pessoa" && x.papel === "lesionado");
    if (j && ate && e.data <= hoje && ate > hoje) fora.add(j.id);
  }
  return fora;
}

const MIN_DISPONIVEIS = 12;

function equipaParaJogo(repo: Repositorio, clube: string, competicao: string, epoca: number, jornada: number, hoje: Data, seed: string, params: Parametros): EquipaJogo {
  const todos = candidatosDoClube(repo, clube);
  const lesionados = lesionadosDoClube(repo, clube, hoje);
  const suspensos = new Set(suspensosDoClube(repo, clube, todos.map((c) => c.pessoa), competicao, epoca, jornada, seed, params).map((s) => s.jogador));
  const disponiveis = todos.filter((c) => !lesionados.has(c.pessoa) && !suspensos.has(c.pessoa));
  const usar = disponiveis.length >= MIN_DISPONIVEIS ? disponiveis : todos; // plantel desfalcado: joga quem houver
  const tatica = { ...TATICA_PADRAO };
  const onze = onzeAutomatico(usar, FORMACOES[tatica.formacao]);
  const emCampo = new Set(onze.map((j) => j.id));
  const banco = onzeAutomatico(usar.filter((c) => !emCampo.has(c.pessoa))).slice(0, 7);
  return { clube, onze, tatica, banco };
}

/** Joga os jogos de `hoje` e passa ao dia seguinte. Tudo numa transação. */
export function avancarDia(repo: Repositorio, dados: DadosBase, params: Parametros, clubeGamer?: string): ResumoDia {
  const { hoje, epoca } = prepararEpoca(repo, dados, params);
  const seed = repo.meta("seed") ?? "?";
  const nomeClube = new Map(dados.clubes.map((c) => [c.id, c.nome] as const));
  const nomePessoa = (id: string) => repo.pessoaPublica(id)?.nomeDesportivo ?? id;
  return repo.transacao(() => {
    const jogos: JogoDoDia[] = [];
    for (const g of repo.jogosDoDia(hoje)) {
      if (repo.jogo(g.id)) continue;
      const nivel = nivelDoJogo(g.casa, g.fora, clubeGamer);
      const casa = equipaParaJogo(repo, g.casa, g.competicao, epoca, g.jornada, hoje, seed, params);
      const fora = equipaParaJogo(repo, g.fora, g.competicao, epoca, g.jornada, hoje, seed, params);
      const r = jogarJogo({ seed, id: g.id, casa, fora }, nivel, { id: g.id, competicao: g.competicao, epoca, jornada: g.jornada, data: hoje }, params);
      const { evento } = repo.registarJogo(r.registo.jogo, r.registo.factos, r.registo.participacoes);
      for (const l of r.registo.lesoes) repo.acrescentarEvento({ ...l, causa: evento });
      for (const h of r.historias) repo.acrescentarEvento({ ...h, causa: evento });
      const rel = r.relatorio;
      const clubeDe = (lado: "casa" | "fora") => (lado === "casa" ? g.casa : g.fora);
      const homem = r.nivel === 1 ? { jogador: r.relatorio.homemDoJogo.id, nota: r.relatorio.homemDoJogo.nota } : (() => { const j = r.relatorio.jogadores.find((x) => x.id === r.relatorio.homemDoJogo); return j ? { jogador: j.id, nota: j.nota } : undefined; })();
      jogos.push({
        id: g.id, competicao: g.competicao, jornada: g.jornada, casa: g.casa, fora: g.fora, casaNome: nomeClube.get(g.casa) ?? g.casa, foraNome: nomeClube.get(g.fora) ?? g.fora, golosCasa: rel.golosCasa, golosFora: rel.golosFora, nivel,
        golos: rel.golos.map((x) => ({ minuto: x.minuto, jogador: x.jogador, nome: nomePessoa(x.jogador), clube: clubeDe(x.lado) })),
        cartoes: rel.cartoes.map((x) => ({ minuto: x.minuto, jogador: x.jogador, nome: nomePessoa(x.jogador), clube: clubeDe(x.lado), cor: x.cor })),
        lesoes: rel.lesoes.map((x) => ({ minuto: x.minuto, jogador: x.jogador, nome: nomePessoa(x.jogador), clube: clubeDe(x.lado), gravidade: x.lesao.gravidade, dias: x.lesao.dias })),
        ...(homem ? { homemDoJogo: { ...homem, nome: nomePessoa(homem.jogador) } } : {}),
      });
    }
    repo.definirMeta("data.hoje", somarDias(hoje, 1));
    return { data: hoje, jogos };
  });
}

/**
 * Avança até um limite e pára: «dia» (1 dia), «semana» (7 dias) ou «proximoJogo» (até ao dia em que o clube do gamer joga,
 * inclusive; sem clube, 7 dias). Pára sempre no fim da época (sem mais jogos marcados).
 */
export function avancar(repo: Repositorio, dados: DadosBase, params: Parametros, modo: Modo, clubeGamer?: string): ResultadoAvanco {
  const inicio = estadoDoTempo(repo, dados, params);
  const dias: ResumoDia[] = [];
  const limite = modo === "dia" ? 1 : modo === "semana" || !clubeGamer ? 7 : MAX_DIAS;
  while (dias.length < limite) {
    if (jogosPorJogar(repo, dados, inicio.epoca).length === 0) break;
    const d = avancarDia(repo, dados, params, clubeGamer);
    dias.push(d);
    if (modo === "proximoJogo" && clubeGamer && d.jogos.some((j) => j.nivel === 0)) break;
  }
  const estado = estadoDoTempo(repo, dados, params);
  return { de: inicio.hoje, ate: estado.hoje, dias, fimDeEpoca: estado.porJogar === 0, estado };
}
