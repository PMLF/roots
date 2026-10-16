/** O plano do clube do gamer como a página Tática o mostra (RZ-158): onze (escolhido ou proposto), plantel e disponibilidade. */
import { lerSessao } from "./sessaoJogo";
import type { PlanoVista } from "../api/contratos";
import type { Parametros } from "../config/parametros";
import type { DadosBase } from "../dados/tipos";
import { FORMACAO_IDS, FORMACOES } from "../jogo/formacoes";
import type { FormacaoId } from "../jogo/tipos";
import type { Posicao } from "../mundo/tipos";
import type { Repositorio } from "../persistencia/repositorio";
import { somarDias } from "../calendario/datas";
import { aptidaoNa, fatorAptidao } from "../jogo/equipa";
import { candidatosDoClube, estadoDoTempo } from "./avancar";
import { indisponiveis, jogoConfirmado, lerPlano, onzeDoPlano } from "./planoDeJogo";

export function vistaDoPlano(repo: Repositorio, dados: DadosBase, params: Parametros, clube: string): PlanoVista {
  const { hoje, epoca } = estadoDoTempo(repo, dados, params);
  const seed = repo.meta("seed") ?? "?";
  const plano = lerPlano(repo, clube);
  const jogadores = repo.jogadoresDoClube(clube).filter((j) => j.estado === "ativo");
  const nome = (id: string) => repo.pessoaPublica(id)?.nomeDesportivo ?? id;
  // um jogo de hoje que já foi jogado (ao vivo) deixa de ser «o próximo»
  let proximo = repo.proximoJogo(clube, hoje);
  if (proximo && repo.jogo(proximo.id)) proximo = repo.proximoJogo(clube, somarDias(hoje, 1));
  const fora = proximo ? indisponiveis(repo, clube, jogadores.map((j) => j.pessoa), proximo.competicao, epoca, proximo.jornada, proximo.data, seed, params) : new Map();
  const candidatos = candidatosDoClube(repo, clube, proximo?.data ?? hoje, params);
  const forma = new Map(candidatos.map((c) => [c.pessoa, c.forma ?? 1] as const));
  const onze = plano.onze ?? onzeDoPlano(plano, candidatos, new Set(fora.keys()), params).map((j) => ({ jogador: j.id, posicao: j.posicao }));
  const adversario = proximo ? (proximo.casa === clube ? proximo.fora : proximo.casa) : undefined;
  return {
    clubeNome: dados.clubes.find((c) => c.id === clube)?.nome ?? clube,
    tatica: plano.tatica,
    automatico: !plano.onze,
    formacoes: FORMACAO_IDS,
    posicoesDaFormacao: Object.fromEntries(FORMACAO_IDS.map((f) => [f, [...FORMACOES[f]]])) as Record<FormacaoId, Posicao[]>,
    onze: onze.map((o) => {
      const aptidao = aptidaoNa(candidatos.find((c) => c.pessoa === o.jogador)?.posicoes ?? [], o.posicao, params);
      const rendimento = Math.round(fatorAptidao(aptidao, o.posicao, params) * 100) / 100;
      return { jogador: o.jogador, nome: nome(o.jogador), posicao: o.posicao, aptidao, rendimento, foraDePosicao: rendimento < 0.95 };
    }),
    plantel: jogadores
      .map((j) => {
        const f = fora.get(j.pessoa);
        return { jogador: j.pessoa, nome: nome(j.pessoa), forma: Math.round((forma.get(j.pessoa) ?? 1) * 100) / 100, posicoes: j.posicoes as { pos: Posicao; aptidao: number }[], ...(f ? { indisponivel: f.motivo, ...(f.detalhe !== undefined ? { jogosPorCumprir: f.detalhe } : {}) } : {}) };
      })
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt")),
    ...(proximo && adversario ? { proximoJogo: { id: proximo.id, data: proximo.data, competicao: proximo.competicao, adversario: dados.clubes.find((c) => c.id === adversario)?.nome ?? adversario, emCasa: proximo.casa === clube, confirmado: jogoConfirmado(repo, proximo.id), emCurso: lerSessao(repo)?.jogo === proximo.id, adversarioId: adversario, adversarioCores: dados.clubes.find((c) => c.id === adversario)?.cores ?? "" } } : {}),
  };
}
