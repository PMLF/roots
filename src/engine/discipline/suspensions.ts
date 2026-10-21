/**
 * Castigos disciplinares (RZ-106; docs/GAME_ENGINE.md §8). Funções puras: dado o historial de cartões de um jogador numa
 * competição e época e os jogos que o clube já fez, dizem se está suspenso para o próximo.
 *
 * - Amarelos acumulam por competição e época; ao 5.º, 9.º, 12.º e 14.º (`yellowThresholds`, como no regulamento das ligas
 *   portuguesas) cumpre-se um jogo de suspensão. O segundo amarelo do mesmo jogo dá vermelho; o primeiro continua a contar para a acumulação.
 * - Vermelho por segundo amarelo: `segundoAmarelo.jogos`. Vermelho direto: 1 jogo e, com alguma probabilidade, mais
 *   (a duração sai de uma seed por jogo e jogador, por isso é sempre a mesma).
 * - Cumpre-se nos jogos seguintes **do clube na mesma competição**; quem está suspenso não joga nem acumula cartões.
 * - Castigos pendentes no fim da época passam para a seguinte (`pendenteInicial`): nada se apaga.
 */
import { Rng } from "../random/rng";
import type { Params } from "../config/parameters";
import type { Repository } from "../persistence/repository";
import type { CardRecord } from "../persistence/types";

type SuspensionReason = "accumulation" | "second-yellow" | "red";

export type DisciplinaryState = {
  player: string;
  /** Amarelos acumulados nesta competição e época (os que ainda contam para a próxima suspensão incluídos). */
  yellows: number;
  /** Amarelos que faltam para o próximo jogo de suspensão (sem valor depois do último limiar). */
  forSuspension?: number;
  suspended: boolean;
  /** Jogos de castigo por cumprir, contando o próximo (0 se não está suspenso). */
  matchesPerMeet: number;
  /** Motivo do castigo mais recente ainda por cumprir. */
  reason?: SuspensionReason;
};

/** Duração (em jogos) de um vermelho direto, sorteada de forma estável por seed, jogo e jogador. */
export function directRedMatches(seed: string, match: string, player: string, p: Params["discipline"]): number {
  const r = new Rng(seed, `castigo/${match}/${player}`);
  let n = p.directRed.matches;
  while (n < p.directRed.max && r.prob(p.directRed.morePA)) n++;
  return n;
}

/**
 * Estado disciplinar de um jogador antes do jogo da jornada `proximaJornada`.
 * `cartoes`: os do jogador nesta competição e época; `jornadasClube`: jornadas em que o clube jogou (as anteriores à próxima
 * são as que contam para cumprir castigo); `pendenteInicial`: castigo vindo da época anterior.
 */
export function disciplinaryState(
  player: string,
  cards: readonly CardRecord[],
  clubRounds: readonly number[],
  nextRound: number,
  seed: string,
  params: Params,
  initialPending = 0,
): DisciplinaryState {
  const p = params.discipline;
  const ownSquad = cards.filter((c) => c.player === player);
  let yellows = 0;
  let pending = initialPending;
  let reason: SuspensionReason | undefined = initialPending > 0 ? "red" : undefined;
  const played = [...new Set(clubRounds)].filter((j) => j < nextRound).sort((a, b) => a - b);
  for (const round of played) {
    if (pending > 0) {
      pending--; // cumpriu um jogo: não jogou, não há cartões dele neste jogo
      continue;
    }
    for (const c of ownSquad.filter((x) => x.round === round)) {
      if (c.type === "CA") {
        yellows++;
        if (p.yellowThresholds.includes(yellows)) {
          pending++;
          reason = "accumulation";
        }
      } else if (c.extra.includes("2A")) {
        pending += p.secondYellow.matches;
        reason = "second-yellow";
      } else {
        pending += directRedMatches(seed, c.match, player, p);
        reason = "red";
      }
    }
  }
  const next = p.yellowThresholds.find((n) => n > yellows);
  return {
    player,
    yellows,
    ...(next !== undefined ? { forSuspension: next - yellows } : {}),
    suspended: pending > 0,
    matchesPerMeet: pending,
    ...(pending > 0 && reason ? { reason } : {}),
  };
}

/** Os suspensos de um clube para o jogo da jornada `proximaJornada`, lendo o historial do repositório. */
export function clubSuspended(
  repo: Repository,
  club: string,
  players: readonly string[],
  competition: string,
  season: number,
  nextRound: number,
  seed: string,
  params: Params,
  pending: ReadonlyMap<string, number> = new Map(),
): DisciplinaryState[] {
  const cards = repo.cards(competition, season, players);
  const rounds = repo.playedRounds(club, competition, season);
  return players.map((j) => disciplinaryState(j, cards, rounds, nextRound, seed, params, pending.get(j) ?? 0)).filter((e) => e.suspended);
}

/** Tira os suspensos dos candidatos a titular. */
export function withoutSuspended<T extends { person: string }>(candidates: readonly T[], suspended: readonly DisciplinaryState[]): T[] {
  const away = new Set(suspended.map((s) => s.player));
  return candidates.filter((c) => !away.has(c.person));
}
