/**
 * Castigos disciplinares (RZ-106; docs/MOTOR_JOGO.md §8). Funções puras: dado o historial de cartões de um jogador numa
 * competição e época e os jogos que o clube já fez, dizem se está suspenso para o próximo.
 *
 * - Amarelos acumulam por competição e época; de `amarelosPorSuspensao` em `amarelosPorSuspensao`, um jogo de suspensão.
 * - Vermelho por segundo amarelo: `segundoAmarelo.jogos`. Vermelho direto: 1 jogo e, com alguma probabilidade, mais
 *   (a duração sai de uma seed por jogo e jogador, por isso é sempre a mesma).
 * - Cumpre-se nos jogos seguintes **do clube na mesma competição**; quem está suspenso não joga nem acumula cartões.
 * - Castigos pendentes no fim da época passam para a seguinte (`pendenteInicial`): nada se apaga.
 */
import { Rng } from "../aleatorio/rng";
import type { Parametros } from "../config/parametros";
import type { Repositorio } from "../persistencia/repositorio";
import type { RegistoCartao } from "../persistencia/tipos";

export type MotivoCastigo = "acumulacao" | "segundo-amarelo" | "vermelho";

export type EstadoDisciplinar = {
  jogador: string;
  /** Amarelos acumulados nesta competição e época (os que ainda contam para a próxima suspensão incluídos). */
  amarelos: number;
  /** Amarelos que faltam para o próximo jogo de suspensão. */
  paraSuspensao: number;
  suspenso: boolean;
  /** Jogos de castigo por cumprir, contando o próximo (0 se não está suspenso). */
  jogosPorCumprir: number;
  /** Motivo do castigo mais recente ainda por cumprir. */
  motivo?: MotivoCastigo;
};

/** Duração (em jogos) de um vermelho direto, sorteada de forma estável por seed, jogo e jogador. */
export function jogosVermelhoDireto(seed: string, jogo: string, jogador: string, p: Parametros["disciplina"]): number {
  const r = new Rng(seed, `castigo/${jogo}/${jogador}`);
  let n = p.vermelhoDireto.jogos;
  while (n < p.vermelhoDireto.max && r.prob(p.vermelhoDireto.pMaisUm)) n++;
  return n;
}

/**
 * Estado disciplinar de um jogador antes do jogo da jornada `proximaJornada`.
 * `cartoes`: os do jogador nesta competição e época; `jornadasClube`: jornadas em que o clube jogou (as anteriores à próxima
 * são as que contam para cumprir castigo); `pendenteInicial`: castigo vindo da época anterior.
 */
export function estadoDisciplinar(
  jogador: string,
  cartoes: readonly RegistoCartao[],
  jornadasClube: readonly number[],
  proximaJornada: number,
  seed: string,
  params: Parametros,
  pendenteInicial = 0,
): EstadoDisciplinar {
  const p = params.disciplina;
  const meus = cartoes.filter((c) => c.jogador === jogador);
  let amarelos = 0;
  let pendente = pendenteInicial;
  let motivo: MotivoCastigo | undefined = pendenteInicial > 0 ? "vermelho" : undefined;
  const jogadas = [...new Set(jornadasClube)].filter((j) => j < proximaJornada).sort((a, b) => a - b);
  for (const jornada of jogadas) {
    if (pendente > 0) {
      pendente--; // cumpriu um jogo: não jogou, não há cartões dele neste jogo
      continue;
    }
    for (const c of meus.filter((x) => x.jornada === jornada)) {
      if (c.tipo === "CA") {
        amarelos++;
        if (amarelos % p.amarelosPorSuspensao === 0) {
          pendente++;
          motivo = "acumulacao";
        }
      } else if (c.extra.includes("2A")) {
        pendente += p.segundoAmarelo.jogos;
        motivo = "segundo-amarelo";
      } else {
        pendente += jogosVermelhoDireto(seed, c.jogo, jogador, p);
        motivo = "vermelho";
      }
    }
  }
  return {
    jogador,
    amarelos,
    paraSuspensao: p.amarelosPorSuspensao - (amarelos % p.amarelosPorSuspensao),
    suspenso: pendente > 0,
    jogosPorCumprir: pendente,
    ...(pendente > 0 && motivo ? { motivo } : {}),
  };
}

/** Os suspensos de um clube para o jogo da jornada `proximaJornada`, lendo o historial do repositório. */
export function suspensosDoClube(
  repo: Repositorio,
  clube: string,
  jogadores: readonly string[],
  competicao: string,
  epoca: number,
  proximaJornada: number,
  seed: string,
  params: Parametros,
  pendentes: ReadonlyMap<string, number> = new Map(),
): EstadoDisciplinar[] {
  const cartoes = repo.cartoes(competicao, epoca, jogadores);
  const jornadas = repo.jornadasJogadas(clube, competicao, epoca);
  return jogadores.map((j) => estadoDisciplinar(j, cartoes, jornadas, proximaJornada, seed, params, pendentes.get(j) ?? 0)).filter((e) => e.suspenso);
}

/** Tira os suspensos dos candidatos a titular. */
export function semSuspensos<T extends { pessoa: string }>(candidatos: readonly T[], suspensos: readonly EstadoDisciplinar[]): T[] {
  const fora = new Set(suspensos.map((s) => s.jogador));
  return candidatos.filter((c) => !fora.has(c.pessoa));
}
