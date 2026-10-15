/**
 * Avançar no tempo (RZ-119; docs/DESIGN_REGRAS.md §6b): cada dia joga os jogos marcados nesse dia, com o mesmo motor para
 * todos. O jogo do clube do gamer guarda tudo (nível 0); os outros guardam o resumo público (golos, cartões, lesões, nota
 * do homem do jogo; nível 1, RZ-109). Lesões e suspensões contam: quem está lesionado ou suspenso não entra no onze e as
 * histórias saem dos jogos como em qualquer outro. Puro em relação ao tempo real: a data vive no save (`data.hoje`).
 */
import { diaDaSemana, somarDias } from "../calendario/datas";
import type { Parametros } from "../config/parametros";
import type { DadosBase } from "../dados/tipos";
import { jogarJogo, nivelDoJogo } from "../jogo/detalhe";
import { onzeAutomatico, type CandidatoOnze } from "../jogo/equipa";
import { TATICA_PADRAO } from "../jogo/formacoes";
import { indisponiveis, jogoConfirmado, lerPlano, onzeDoPlano, type Plano } from "./planoDeJogo";
import type { EquipaJogo } from "../jogo/tipos";
import type { Repositorio } from "../persistencia/repositorio";
import type { Data } from "../persistencia/tipos";
import { fecharEpoca, gerarFasePromocao, type ResumoEpoca } from "./fecharEpoca";
import { guardarJogoVivo, linhasDoJogo, type LinhaTabelaVivo } from "./jogoAoVivo";
import { atualizarOfertas, estaDesempregado } from "./mercadoTreinadores";
import { dadosDaEpoca, epocaAtual } from "./piramideEpoca";
import { gruposDaPromocao, jogosPorJogar, prepararEpoca } from "./preparar";

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

/** O avanço parou antes do jogo do clube do gamer: falta confirmar onze e tática. */
export type Pausa = { jogo: string; data: Data; competicao: string; jornada: number; casa: string; fora: string; casaNome: string; foraNome: string };

export type ResultadoAvanco = { de: Data; ate: Data; dias: ResumoDia[]; fimDeEpoca: boolean; /** Preenchido quando a época fechou durante este avanço. */ resumoEpoca?: ResumoEpoca; estado: EstadoTempo; pausa?: Pausa };

const MAX_DIAS = 400;

export function estadoDoTempo(repo: Repositorio, base: DadosBase, params: Parametros): EstadoTempo {
  const dados = dadosDaEpoca(repo, base);
  const { hoje, epoca } = prepararEpoca(repo, dados, params);
  const pendentes = jogosPorJogar(repo, dados, epoca);
  const proximo = pendentes.filter((j) => j.data >= hoje).map((j) => j.data).sort()[0];
  return { hoje, epoca, porJogar: pendentes.length, ...(proximo ? { proximoDiaDeJogos: proximo } : {}) };
}

function candidatosDoClube(repo: Repositorio, clube: string): CandidatoOnze[] {
  return repo.jogadoresDoClube(clube).filter((j) => j.estado === "ativo").map((j) => ({ pessoa: j.pessoa, posicoes: j.posicoes, atributos: j.atributos, alturaCm: j.alturaCm }));
}

function equipaParaJogo(repo: Repositorio, clube: string, competicao: string, epoca: number, jornada: number, hoje: Data, seed: string, params: Parametros, plano?: Plano): EquipaJogo {
  const todos = candidatosDoClube(repo, clube);
  const fora = indisponiveis(repo, clube, todos.map((c) => c.pessoa), competicao, epoca, jornada, hoje, seed, params);
  const tatica = plano?.tatica ?? { ...TATICA_PADRAO };
  const onze = onzeDoPlano(plano ?? { tatica }, todos, new Set(fora.keys()));
  const emCampo = new Set(onze.map((j) => j.id));
  const disponiveis = todos.filter((c) => !emCampo.has(c.pessoa) && !fora.has(c.pessoa));
  const banco = onzeAutomatico(disponiveis.length >= 7 ? disponiveis : todos.filter((c) => !emCampo.has(c.pessoa))).slice(0, 7);
  return { clube, onze, tatica, banco };
}

/** Joga os jogos de `hoje` e passa ao dia seguinte. Tudo numa transação. */
export function avancarDia(repo: Repositorio, base: DadosBase, params: Parametros, clubeGamer?: string): ResumoDia {
  const dados = dadosDaEpoca(repo, base);
  const { hoje, epoca } = prepararEpoca(repo, dados, params);
  const seed = repo.meta("seed") ?? "?";
  const nomeClube = new Map(dados.clubes.map((c) => [c.id, c.nome] as const));
  const nomePessoa = (id: string) => repo.pessoaPublica(id)?.nomeDesportivo ?? id;
  return repo.transacao(() => {
    const jogos: JogoDoDia[] = [];
    // a tabela de cada competição onde o gamer joga hoje, antes dos jogos (para o ver ao vivo)
    const tabelas = new Map<string, LinhaTabelaVivo[]>();
    for (const g of repo.jogosDoDia(hoje)) {
      if (repo.jogo(g.id) || nivelDoJogo(g.casa, g.fora, clubeGamer) !== 0 || tabelas.has(g.competicao)) continue;
      const cal = repo.calendario(g.competicao, epoca);
      const clubes = [...new Set(cal.jogos.flatMap((j) => [j.casa, j.fora]))];
      const linhas = new Map(repo.classificacao(g.competicao, epoca).map((l) => [l.clube, l] as const));
      tabelas.set(g.competicao, clubes.map((c) => { const l = linhas.get(c); return { clube: c, nome: nomeClube.get(c) ?? c, jogos: l?.jogos ?? 0, pontos: l?.pontos ?? 0, golosMarcados: l?.golosMarcados ?? 0, golosSofridos: l?.golosSofridos ?? 0 }; }));
    }
    const vivos: { id: string; competicao: string; jornada: number; casa: string; fora: string; duracao: number; golosCasa: number; golosFora: number; linhas: ReturnType<typeof linhasDoJogo> }[] = [];
    const duracoes = new Map<string, number>();
    for (const g of repo.jogosDoDia(hoje)) {
      if (repo.jogo(g.id)) continue;
      const nivel = nivelDoJogo(g.casa, g.fora, clubeGamer);
      const casa = equipaParaJogo(repo, g.casa, g.competicao, epoca, g.jornada, hoje, seed, params, g.casa === clubeGamer ? lerPlano(repo, g.casa) : undefined);
      const fora = equipaParaJogo(repo, g.fora, g.competicao, epoca, g.jornada, hoje, seed, params, g.fora === clubeGamer ? lerPlano(repo, g.fora) : undefined);
      const r = jogarJogo({ seed, id: g.id, casa, fora }, nivel, { id: g.id, competicao: g.competicao, epoca, jornada: g.jornada, data: hoje }, params);
      const { evento } = repo.registarJogo(r.registo.jogo, r.registo.factos, r.registo.participacoes);
      for (const l of r.registo.lesoes) repo.acrescentarEvento({ ...l, causa: evento });
      for (const h of r.historias) repo.acrescentarEvento({ ...h, causa: evento });
      const rel = r.relatorio;
      duracoes.set(g.id, rel.duracao);
      if (r.nivel === 0) vivos.push({ id: g.id, competicao: g.competicao, jornada: g.jornada, casa: g.casa, fora: g.fora, duracao: rel.duracao, golosCasa: rel.golosCasa, golosFora: rel.golosFora, linhas: linhasDoJogo(r.eventos, rel.duracao, nomePessoa) });
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
    // o jogo do gamer fica guardado com os outros jogos da competição e a tabela de antes (RZ-130)
    for (const v of vivos) {
      const outros = jogos.filter((j) => j.competicao === v.competicao && j.id !== v.id).map((j) => ({
        id: j.id, casa: { id: j.casa, nome: j.casaNome }, fora: { id: j.fora, nome: j.foraNome }, duracao: duracoes.get(j.id) ?? 90,
        golos: j.golos.map((x) => ({ minuto: x.minuto, lado: (x.clube === j.casa ? "casa" : "fora") as "casa" | "fora" })), golosCasa: j.golosCasa, golosFora: j.golosFora,
      }));
      guardarJogoVivo(repo, { ...v, data: hoje, casa: { id: v.casa, nome: nomeClube.get(v.casa) ?? v.casa }, fora: { id: v.fora, nome: nomeClube.get(v.fora) ?? v.fora }, tabela: tabelas.get(v.competicao) ?? [], pontosVitoria: params.classificacao.pontosVitoria, pontosEmpate: params.classificacao.pontosEmpate, outros });
    }
    const amanha = somarDias(hoje, 1);
    repo.definirMeta("data.hoje", amanha);
    // Sem clube, chegam ofertas novas todas as segundas-feiras.
    if (estaDesempregado(repo) && diaDaSemana(amanha) === 1) atualizarOfertas(repo, dados, params, amanha);
    return { data: hoje, jogos };
  });
}

/**
 * Avança até um limite e pára: «dia» (1 dia), «semana» (7 dias) ou «proximoJogo» (até ao dia em que o clube do gamer joga,
 * inclusive; sem clube, 7 dias). Pára sempre no fim da época (sem mais jogos marcados).
 */
export function avancar(repo: Repositorio, base: DadosBase, params: Parametros, modo: Modo, clubeGamer?: string): ResultadoAvanco {
  const inicio = estadoDoTempo(repo, base, params);
  const dias: ResumoDia[] = [];
  const limite = modo === "dia" ? 1 : modo === "semana" || !clubeGamer ? 7 : MAX_DIAS;
  let pausa: Pausa | undefined;
  let resumoEpoca: ResumoEpoca | undefined;
  /** Se já não há jogos por jogar: gera a Fase de Promoção ou fecha a época (automático, RZ-159). */
  const etapaDeEpoca = (): "livre" | "gerou" | "fechou" => {
    const dados = dadosDaEpoca(repo, base);
    const epoca = epocaAtual(repo);
    const pendentes = jogosPorJogar(repo, dados, epoca);
    // A Fase de Promoção marca-se assim que acabam as distritais (cedo, para se jogar até maio), com as outras ligas ainda a decorrer.
    const distritais = new Set(dados.clubes.filter((c) => c.escalao === "distrital").map((c) => c.liga));
    if (!gruposDaPromocao(repo, epoca) && !pendentes.some((j) => distritais.has(j.competicao))) { gerarFasePromocao(repo, dados, params, epoca); return "gerou"; }
    if (pendentes.length > 0) return "livre";
    resumoEpoca = fecharEpoca(repo, dados, params, epoca);
    return "fechou";
  };
  while (dias.length < limite) {
    const etapa = etapaDeEpoca();
    if (etapa === "fechou") break;
    if (etapa === "gerou") continue;
    const dados = dadosDaEpoca(repo, base);
    const hoje = repo.meta("data.hoje") as Data;
    const dele = clubeGamer ? repo.jogosDoDia(hoje).find((g) => (g.casa === clubeGamer || g.fora === clubeGamer) && !repo.jogo(g.id)) : undefined;
    if (dele && !jogoConfirmado(repo, dele.id)) {
      const nome = (id: string) => dados.clubes.find((c) => c.id === id)?.nome ?? id;
      pausa = { jogo: dele.id, data: hoje, competicao: dele.competicao, jornada: dele.jornada, casa: dele.casa, fora: dele.fora, casaNome: nome(dele.casa), foraNome: nome(dele.fora) };
      break;
    }
    const d = avancarDia(repo, base, params, clubeGamer);
    dias.push(d);
    if (modo === "proximoJogo" && clubeGamer && d.jogos.some((j) => j.nivel === 0)) break;
  }
  // A época fecha logo depois da última jornada, sem esperar por outro pedido.
  if (!resumoEpoca && !pausa) for (let i = 0; i < 2 && !resumoEpoca; i++) if (etapaDeEpoca() !== "gerou") break;
  const estado = estadoDoTempo(repo, base, params);
  return { de: inicio.hoje, ate: estado.hoje, dias, fimDeEpoca: !!resumoEpoca, ...(resumoEpoca ? { resumoEpoca } : {}), estado, ...(pausa ? { pausa } : {}) };
}
