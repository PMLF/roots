/**
 * Castigos disciplinares (RZ-106; docs/GAME_ENGINE.md §8). Funções puras: dado o historial de cartões de um jogador numa
 * competição e época e os jogos que o clube já fez, dizem se está suspenso para o próximo.
 *
 * - Amarelos acumulam por competição e época; ao 5.º, 9.º, 12.º e 14.º (`yellowThresholds`, como no regulamento das ligas
 *   portuguesas) cumpre-se um jogo de suspensão. O segundo amarelo do mesmo jogo dá vermelho; o primeiro continua a contar para a acumulação.
 * - Vermelho por segundo amarelo: `segundoAmarelo.jogos`. Vermelho direto: 1 jogo e, com alguma probabilidade, mais
 *   (a duração sai de uma seed por jogo e jogador, por isso é sempre a mesma).
 * - Cumpre-se nos jogos seguintes **do clube na mesma competição**; quem está suspenso não joga nem acumula cartões.
 * - Castigos pendentes no fim da época passam para a seguinte (`pendenteInicial`): nada se apaga. Os amarelos, esses, fazem
 *   reset: a contagem é por competição **e época**.
 * - Competições europeias (`discipline.europe`, como na UEFA): um jogo de suspensão a cada 3 amarelos (a contagem recomeça) e os
 *   amarelos são apagados depois dos quartos de final, por isso ninguém chega à final ou às meias suspenso por acumulação de
 *   cartões antigos. Um castigo europeu cumpre-se só em jogos europeus e passa para a época seguinte.
 */
import { Rng } from "../random/rng";
import type { Params } from "../config/parameters";
import type { Repository } from "../persistence/repository";
import type { CardRecord } from "../persistence/types";
import { EUROPE_NAME, EUROPEAN, europeDates, europeKind, isEuropean } from "../europe/europe";

type SuspensionReason = "accumulation" | "second-yellow" | "red";

/** Regras de contagem de uma competição: a nacional usa os limiares de `yellowThresholds`; a europeia, de 3 em 3 e com apagão após os quartos. */
export type DisciplineRules = {
  /** Um jogo de suspensão sempre que os amarelos chegam a um destes valores (se `every` não existir). */
  thresholds: readonly number[];
  /** Um jogo de suspensão a cada `every` amarelos (a contagem recomeça). */
  every?: number;
  /** Os amarelos zeram antes da primeira jornada acima desta (última mão dos quartos nas europeias). */
  wipeAfterRound?: number;
};

export const nationalRules = (p: Params["discipline"]): DisciplineRules => ({ thresholds: p.yellowThresholds });
export const europeRules = (p: Params["discipline"], wipeAfterRound?: number): DisciplineRules => ({ thresholds: [], every: p.europe.yellowEvery, ...(wipeAfterRound !== undefined ? { wipeAfterRound } : {}) });

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
  rules: DisciplineRules = nationalRules(params.discipline),
): DisciplinaryState {
  const p = params.discipline;
  const ownSquad = cards.filter((c) => c.player === player);
  let yellows = 0;
  let pending = initialPending;
  let reason: SuspensionReason | undefined = initialPending > 0 ? "red" : undefined;
  const played = [...new Set(clubRounds)].filter((j) => j < nextRound).sort((a, b) => a - b);
  let wiped = false;
  for (const round of played) {
    if (!wiped && rules.wipeAfterRound !== undefined && round > rules.wipeAfterRound) { yellows = 0; wiped = true; }
    if (pending > 0) {
      pending--; // cumpriu um jogo: não jogou, não há cartões dele neste jogo
      continue;
    }
    for (const c of ownSquad.filter((x) => x.round === round)) {
      if (c.type === "CA") {
        yellows++;
        if (rules.every ? yellows % rules.every === 0 : rules.thresholds.includes(yellows)) {
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
  const next = rules.every ? (Math.floor(yellows / rules.every) + 1) * rules.every : rules.thresholds.find((n) => n > yellows);
  return {
    player,
    yellows,
    ...(next !== undefined ? { forSuspension: next - yellows } : {}),
    suspended: pending > 0,
    matchesPerMeet: pending,
    ...(pending > 0 && reason ? { reason } : {}),
  };
}

/** Competições em que um castigo desta competição se continua a cumprir na época seguinte (as europeias contam como uma só). */
const carryFamily = (competition: string): readonly string[] => (isEuropean(competition) ? EUROPEAN.map((k) => EUROPE_NAME[k]) : [competition]);

/** Castigo por cumprir no fim da época anterior, por jogador (só na mesma competição, ou numa europeia qualquer). */
export function carriedSuspensions(repo: Repository, club: string, players: readonly string[], competition: string, season: number, seed: string, params: Params): Map<string, number> {
  const out = new Map<string, number>();
  if (season <= 1) return out;
  const before = season - 1;
  for (const c of carryFamily(competition)) {
    const rounds = repo.playedRounds(club, c, before);
    if (rounds.length === 0) continue;
    const rules = isEuropean(c) ? europeRules(params.discipline, wipeRound(repo, params, c, before)) : nationalRules(params.discipline);
    const cards = repo.cards(c, before, players);
    for (const player of players) {
      const left = disciplinaryState(player, cards, rounds, Number.MAX_SAFE_INTEGER, seed, params, 0, rules).matchesPerMeet;
      if (left > 0) out.set(player, Math.max(out.get(player) ?? 0, left));
    }
  }
  return out;
}

/** Última jornada (a 2.ª mão dos quartos) depois da qual os amarelos europeus se apagam; `undefined` se ainda não está no calendário. */
function wipeRound(repo: Repository, params: Params, competition: string, season: number): number | undefined {
  const kind = europeKind(competition);
  if (!kind) return undefined;
  const date = europeDates(params, season, kind).knockout[5];
  return repo.calendar(competition, season).matches.filter((m) => m.date === date).map((m) => m.round).sort((a, b) => b - a)[0];
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
  pending: ReadonlyMap<string, number> = carriedSuspensions(repo, club, players, competition, season, seed, params),
): DisciplinaryState[] {
  const cards = repo.cards(competition, season, players);
  const rounds = repo.playedRounds(club, competition, season);
  const rules = isEuropean(competition) ? europeRules(params.discipline, wipeRound(repo, params, competition, season)) : nationalRules(params.discipline);
  return players.map((j) => disciplinaryState(j, cards, rounds, nextRound, seed, params, pending.get(j) ?? 0, rules)).filter((e) => e.suspended);
}

/** Tira os suspensos dos candidatos a titular. */
export function withoutSuspended<T extends { person: string }>(candidates: readonly T[], suspended: readonly DisciplinaryState[]): T[] {
  const away = new Set(suspended.map((s) => s.player));
  return candidates.filter((c) => !away.has(c.person));
}
