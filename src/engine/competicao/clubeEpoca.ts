/**
 * Estatísticas da época atual de um clube (RZ-175): números de cada jogador do plantel e os tops do clube.
 * Tudo sai dos factos já guardados (jogos, minutos, golos, assistências, cartões, notas); o xG por jogador não se guarda.
 */
import type { Parametros } from "../config/parametros";
import type { DadosBase } from "../dados/tipos";
import { nomeDaEpoca } from "../epoca/anoDoSave";
import { epocaAtual } from "../epoca/piramideEpoca";
import type { Repositorio } from "../persistencia/repositorio";

export type EstatJogadorEpoca = { games: number; minutes: number; goals: number; assists: number; yellow: number; red: number; rating?: number };
export type TopClube = { player: string; name: string; value: number };

export type EpocaDoClube = {
  season: number;
  seasonLabel: string;
  league: string;
  /** Posição na tabela, jogos, vitórias, empates, derrotas, golos marcados e sofridos, pontos. */
  team: { position: number; played: number; won: number; drawn: number; lost: number; goalsFor: number; goalsAgainst: number; points: number } | undefined;
  players: Record<string, EstatJogadorEpoca>;
  tops: { scorer?: TopClube; assister?: TopClube; rating?: TopClube; minutes?: TopClube; games?: TopClube; yellow?: TopClube; red?: TopClube; goalsAndAssists?: TopClube };
};

export function epocaDoClube(repo: Repositorio, dados: DadosBase, params: Parametros, clube: string): EpocaDoClube | undefined {
  const c = dados.clubes.find((x) => x.id === clube);
  if (!c) return undefined;
  const season = epocaAtual(repo);
  const stats = repo.playerStatsForCompetition(c.liga, season).filter((s) => s.clube === clube);
  const minRated = params.competitionView.minRatedGames;
  const players: Record<string, EstatJogadorEpoca> = {};
  for (const s of stats) {
    players[s.jogador] = { games: s.jogos, minutes: s.minutos, goals: s.golos, assists: s.assistencias, yellow: s.amarelos, red: s.vermelhos, ...(s.avgRating !== undefined && s.ratedGames >= minRated ? { rating: Math.round(s.avgRating * 100) / 100 } : {}) };
  }
  const nome = (id: string) => repo.pessoaPublica(id)?.nomeDesportivo ?? id;
  const top = (valor: (id: string, e: EstatJogadorEpoca) => number): TopClube | undefined => {
    let melhor: TopClube | undefined;
    for (const [id, e] of Object.entries(players)) {
      const v = valor(id, e);
      if (v > 0 && (!melhor || v > melhor.value || (v === melhor.value && nome(id) < melhor.name))) melhor = { player: id, name: nome(id), value: v };
    }
    return melhor;
  };
  const tabela = [...repo.classificacao(c.liga, season)].sort((x, y) => y.pontos - x.pontos || (y.golosMarcados - y.golosSofridos) - (x.golosMarcados - x.golosSofridos) || y.golosMarcados - x.golosMarcados);
  const i = tabela.findIndex((l) => l.clube === clube);
  const l = tabela[i];
  const rating = top((_, e) => (e.rating !== undefined ? e.rating : 0));
  const sc = top((_, e) => e.goals);
  const as = top((_, e) => e.assists);
  const mm = top((_, e) => e.minutes);
  const jg = top((_, e) => e.games);
  const am = top((_, e) => e.yellow);
  const vm = top((_, e) => e.red);
  const ga = top((_, e) => e.goals + e.assists);
  return {
    season, seasonLabel: nomeDaEpoca(season, params.calendario.anoInicial), league: c.liga,
    team: l ? { position: i + 1, played: l.jogos, won: l.vitorias, drawn: l.empates, lost: l.derrotas, goalsFor: l.golosMarcados, goalsAgainst: l.golosSofridos, points: l.pontos } : undefined,
    players,
    tops: { ...(sc ? { scorer: sc } : {}), ...(as ? { assister: as } : {}), ...(ga ? { goalsAndAssists: ga } : {}), ...(rating ? { rating } : {}), ...(mm ? { minutes: mm } : {}), ...(jg ? { games: jg } : {}), ...(am ? { yellow: am } : {}), ...(vm ? { red: vm } : {}) },
  };
}
