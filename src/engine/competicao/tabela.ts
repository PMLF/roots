/** Ligação ao repositório: a tabela classificativa final de uma competição e o seu estado de jornadas (RZ-110). */
import type { Parametros } from "../config/parametros";
import type { Repositorio } from "../persistencia/repositorio";
import type { Data } from "../persistencia/tipos";
import { ordenarClassificacao, type LinhaOrdenada } from "./classificacao";
import { estadoCompeticao, type EstadoCompeticao } from "./jornadas";

export type TipoCompeticao = "liga" | "promocao";

/** Classificação ordenada com os desempates da competição. Inclui clubes do calendário que ainda não jogaram. */
export function tabelaDaCompeticao(
  repo: Repositorio,
  competicao: string,
  epoca: number,
  tipo: TipoCompeticao,
  params: Parametros,
  ctx: { seed: string; reputacao?: ReadonlyMap<string, number> },
): LinhaOrdenada[] {
  const cal = repo.calendario(competicao, epoca);
  const clubes = [...new Set([...cal.jogos.flatMap((j) => [j.casa, j.fora]), ...cal.folgas.map((f) => f.clube)])];
  return ordenarClassificacao(repo.classificacao(competicao, epoca), repo.jogosDaCompeticao(competicao, epoca), params.desempate[tipo === "liga" ? "liga" : "promocao"], {
    pontosVitoria: params.classificacao.pontosVitoria,
    pontosEmpate: params.classificacao.pontosEmpate,
    seed: ctx.seed,
    competicao,
    epoca,
    clubes,
    ...(ctx.reputacao ? { reputacao: ctx.reputacao } : {}),
  });
}

/** Estado das jornadas de uma competição na data `hoje`. */
export function estadoDaCompeticao(repo: Repositorio, competicao: string, epoca: number, hoje: Data): EstadoCompeticao {
  const jogados = new Set(repo.jogosDaCompeticao(competicao, epoca).map((j) => j.id));
  return estadoCompeticao(competicao, epoca, repo.calendario(competicao, epoca).jogos, jogados, hoje);
}
