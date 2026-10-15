/** Calendários e pendências de uma época (RZ-119, RZ-159): partilhado entre avançar no tempo e o fim de época. */
import { Rng } from "../aleatorio/rng";
import { criarData } from "../calendario/datas";
import { gerarCalendariosDaEpoca, paraRepositorio, type DefinicaoLiga } from "../calendario/calendario";
import type { Escalao, Parametros } from "../config/parametros";
import type { DadosBase } from "../dados/tipos";
import type { Repositorio } from "../persistencia/repositorio";
import type { Data, JogoAgendado } from "../persistencia/tipos";
import { epocaAtual, guardarPiramide, piramideInicial } from "./piramideEpoca";

export const nomeGrupoPromocao = (serie: string) => `Fase de Promoção ${serie}`;

export const ligasDoMundo = (dados: DadosBase): DefinicaoLiga[] => {
  const m = new Map<string, DefinicaoLiga>();
  for (const c of dados.clubes) (m.get(c.liga) ?? m.set(c.liga, { competicao: c.liga, escalao: c.escalao as Escalao, clubes: [] }).get(c.liga)!).clubes.push(c.id);
  return [...m.values()];
};

/** Garante que a época tem a pirâmide e os calendários gravados e que o save tem data. Idempotente. `dados` já traz as ligas da época. */
export function prepararEpoca(repo: Repositorio, dados: DadosBase, params: Parametros): { hoje: Data; epoca: number } {
  const epoca = epocaAtual(repo);
  if (repo.meta(`piramide.${epoca}`) === undefined) guardarPiramide(repo, epoca, piramideInicial(dados));
  const ligas = ligasDoMundo(dados).filter((l) => l.clubes.length >= 2);
  const primeira = ligas[0];
  if (primeira && repo.calendario(primeira.competicao, epoca).jogos.length === 0) {
    const seed = repo.meta("seed") ?? "?";
    repo.transacao(() => {
      for (const cal of gerarCalendariosDaEpoca(ligas, epoca, params.calendario, new Rng(`${seed}|cal`))) {
        const { jogos, folgas } = paraRepositorio(cal);
        repo.guardarCalendario(jogos, folgas);
      }
    });
  }
  if (repo.meta("data.hoje") === undefined) repo.definirMeta("data.hoje", criarData(params.calendario.anoInicial + epoca - 1, params.calendario.mesInicioEpoca, 1));
  repo.definirMeta("epoca", String(epoca));
  return { hoje: repo.meta("data.hoje") as Data, epoca };
}

/** Os grupos da Fase de Promoção desta época, se já foram gerados. */
export function gruposDaPromocao(repo: Repositorio, epoca: number): { serie: "A" | "B" | "C" | "D"; clubes: string[] }[] | undefined {
  const bruto = repo.meta(`promocao.${epoca}`);
  return bruto ? (JSON.parse(bruto) as { serie: "A" | "B" | "C" | "D"; clubes: string[] }[]) : undefined;
}

/** Todos os jogos marcados e por jogar na época (ligas e Fase de Promoção). */
export function jogosPorJogar(repo: Repositorio, dados: DadosBase, epoca: number): JogoAgendado[] {
  const competicoes = [...ligasDoMundo(dados).filter((l) => l.clubes.length >= 2).map((l) => l.competicao), ...(gruposDaPromocao(repo, epoca) ?? []).map((g) => nomeGrupoPromocao(g.serie))];
  const out: JogoAgendado[] = [];
  for (const c of competicoes) {
    const jogados = new Set(repo.jogosDaCompeticao(c, epoca).map((j) => j.id));
    for (const j of repo.calendario(c, epoca).jogos) if (!jogados.has(j.id)) out.push(j);
  }
  return out;
}
