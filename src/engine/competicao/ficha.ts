/**
 * Página de uma liga ou série (RZ-145): classificação com zonas, jornadas, destaques (marcadores, assistentes, melhores
 * jogadores, cartões, melhor ataque e defesa) e clubes. Lê o repositório; se a época ainda não tem calendário gravado
 * (antes do ciclo de dias, RZ-119) mostra uma **prévia** gerada com a semente do mundo, sem gravar nada.
 * Código novo em inglês (CLAUDE.md); os tipos de escalão herdam os nomes antigos até ao RZ-143.
 */
import { Rng } from "../aleatorio/rng";
import { gerarCalendarioLiga, paraRepositorio } from "../calendario/calendario";
import { nivelDeReputacao } from "../clube/reputacao";
import { derivados, type Escalao, type NivelReputacao, type Parametros } from "../config/parametros";
import type { DadosBase } from "../dados/tipos";
import type { Repositorio } from "../persistencia/repositorio";
import type { JogoAgendado } from "../persistencia/tipos";
import { nomeDaEpoca } from "../epoca/anoDoSave";
import { epocaAtual } from "../epoca/piramideEpoca";
import { tabelaDaCompeticao } from "./tabela";

export type Zone = "champion" | "promotion" | "relegation";

export type TableRow = {
  position: number;
  club: string;
  name: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  tiebreak?: string;
  zone?: Zone;
};

export type Round = {
  number: number;
  date: string;
  matches: { id: string; home: string; away: string; homeName: string; awayName: string; homeGoals?: number; awayGoals?: number }[];
  bye?: string;
};

export type PlayerStat = { player: string; name: string; club: string; clubName: string; value: number; games: number };
/** Linha completa de um jogador na competição (separador Estatísticas). */
export type PlayerRow = { player: string; name: string; club: string; clubName: string; position: string; age: number; games: number; minutes: number; goals: number; assists: number; yellow: number; red: number; rating?: number };
export type ClubStat = { club: string; name: string; value: number };

export type Highlights = {
  topScorers: PlayerStat[];
  topAssists: PlayerStat[];
  bestRated: PlayerStat[];
  mostYellow: PlayerStat[];
  mostRed: PlayerStat[];
  bestAttack?: ClubStat;
  bestDefence?: ClubStat;
  /** Todas as equipas, da que marcou mais à que marcou menos (vazio antes do primeiro jogo). */
  attackRanking: ClubStat[];
  /** Todas as equipas, da que sofreu menos à que sofreu mais. */
  defenceRanking: ClubStat[];
};

export type CompetitionPage = {
  league: string;
  tier: Escalao;
  district?: string;
  season: number;
  /** «2026/27» */
  seasonLabel: string;
  /** Épocas do save, da primeira à atual. */
  seasons: { season: number; label: string }[];
  /** Calendário gerado só para mostrar (ainda não está gravado no save). */
  preview: boolean;
  clubs: { id: string; name: string; locality: string; reputation: number; reputationLevel: NivelReputacao; capacity: number }[];
  table: TableRow[];
  rounds: Round[];
  /** Última jornada com pelo menos um jogo disputado (0 se a época não começou). */
  currentRound: number;
  gamesPlayed: number;
  gamesTotal: number;
  highlights: Highlights;
  /** Todos os jogadores com jogos ou golos nesta competição. */
  players: PlayerRow[];
};

/** Quantos sobem e quantos descem em cada escalão (DESIGN_REGRAS §1). O campeão é sempre marcado. */
export function zoneSizes(tier: Escalao, params: Parametros): { promoted: number; relegated: number } {
  const p = params.piramide;
  switch (tier) {
    case "primeiraLiga": return { promoted: 0, relegated: p.primeiraLiga.descem };
    case "segundaLiga": return { promoted: p.segundaLiga.sobem, relegated: p.segundaLiga.descem };
    case "terceiraLiga": return { promoted: p.terceiraLiga.sobem, relegated: p.terceiraLiga.descem };
    case "cp": return { promoted: p.cp.sobemPorSerie, relegated: Math.round(derivados(params).descemPorSerieMedia) };
    case "distrital": return { promoted: 0, relegated: 0 };
  }
}

export function zoneOf(position: number, total: number, tier: Escalao, params: Parametros): Zone | undefined {
  const { promoted, relegated } = zoneSizes(tier, params);
  if (position === 1) return "champion";
  if (position <= promoted) return "promotion";
  if (relegated > 0 && position > total - relegated) return "relegation";
  return undefined;
}

/** Idade a 1 de julho do ano inicial (a data de arranque do mundo). */
function ageOn(birth: string, year: number): number {
  const [y = 0, m = 1, d = 1] = birth.split("-").map(Number);
  return year - y - (m > 7 || (m === 7 && d > 1) ? 1 : 0);
}

export function competitionPage(repo: Repositorio, dados: DadosBase, params: Parametros, league: string, season = epocaAtual(repo)): CompetitionPage | undefined {
  const clubs = dados.clubes.filter((c) => c.liga === league);
  if (clubs.length < 2) return undefined;
  const tier = (clubs[0] as { escalao: Escalao }).escalao;
  const clubName = new Map(clubs.map((c) => [c.id, c.nome] as const));
  const reputation = new Map(clubs.map((c) => [c.id, c.reputacao] as const));
  const seed = repo.meta("seed") ?? "?";

  let { jogos, folgas } = repo.calendario(league, season);
  let preview = false;
  if (jogos.length === 0) {
    preview = true;
    const cal = gerarCalendarioLiga({ competicao: league, escalao: tier, clubes: clubs.map((c) => c.id) }, season, params.calendario, new Rng(`${seed}|cal|${league}`));
    ({ jogos, folgas } = paraRepositorio(cal));
  }
  const results = new Map(repo.jogosDaCompeticao(league, season).map((j) => [j.id, j] as const));
  const byRound = new Map<number, JogoAgendado[]>();
  for (const j of jogos) (byRound.get(j.jornada) ?? byRound.set(j.jornada, []).get(j.jornada)!).push(j);
  const rounds = [...byRound.keys()].sort((a, b) => a - b).map((n): Round => {
    const games = byRound.get(n) ?? [];
    const bye = folgas.find((f) => f.jornada === n)?.clube;
    return {
      number: n,
      date: games[0]?.data ?? "",
      matches: games.map((j) => {
        const r = results.get(j.id);
        return { id: j.id, home: j.casa, away: j.fora, homeName: clubName.get(j.casa) ?? j.casa, awayName: clubName.get(j.fora) ?? j.fora, ...(r ? { homeGoals: r.golosCasa, awayGoals: r.golosFora } : {}) };
      }),
      ...(bye ? { bye: clubName.get(bye) ?? bye } : {}),
    };
  });
  const currentRound = rounds.reduce((last, r) => (r.matches.some((m) => m.homeGoals !== undefined) ? r.number : last), 0);

  const ordered = tabelaDaCompeticao(repo, league, season, tier === "cp" || tier === "distrital" ? "promocao" : "liga", params, { seed, reputacao: reputation });
  const rows: Omit<TableRow, "zone">[] = ordered.length > 0
    ? ordered.map((l) => ({ position: l.posicao, club: l.clube, name: clubName.get(l.clube) ?? l.clube, played: l.jogos, won: l.vitorias, drawn: l.empates, lost: l.derrotas, goalsFor: l.golosMarcados, goalsAgainst: l.golosSofridos, goalDifference: l.diferenca, points: l.pontos, ...(l.desempatePor ? { tiebreak: l.desempatePor } : {}) }))
    : [...clubs].sort((a, b) => b.reputacao - a.reputacao || a.nome.localeCompare(b.nome, "pt")).map((c, i) => ({ position: i + 1, club: c.id, name: c.nome, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0 }));
  // Clubes sem jogos na tabela (calendário ainda não gravado) entram no fim, a zeros, por reputação.
  const presentes = new Set(rows.map((r) => r.club));
  for (const c of [...clubs].filter((x) => !presentes.has(x.id)).sort((x, y) => y.reputacao - x.reputacao || x.nome.localeCompare(y.nome, "pt"))) {
    rows.push({ position: rows.length + 1, club: c.id, name: c.nome, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0 });
  }
  const table: TableRow[] = rows.map((r) => {
    const zone = zoneOf(r.position, rows.length, tier, params);
    return zone ? { ...r, zone } : r;
  });

  // destaques
  const { topN, minRatedGames } = params.competitionView;
  const stats = repo.playerStatsForCompetition(league, season);
  const named = (s: (typeof stats)[number], value: number): PlayerStat => ({ player: s.jogador, name: repo.pessoaPublica(s.jogador)?.nomeDesportivo ?? s.jogador, club: s.clube, clubName: clubName.get(s.clube) ?? s.clube, value, games: s.jogos });
  const top = (key: "golos" | "assistencias" | "amarelos" | "vermelhos") =>
    stats.filter((s) => s[key] > 0).sort((a, b) => b[key] - a[key] || b.jogos - a.jogos || (a.jogador < b.jogador ? -1 : 1)).slice(0, topN).map((s) => named(s, s[key]));
  const played = table.filter((r) => r.played > 0);
  const attackRanking = played.length ? [...table].sort((a, b) => b.goalsFor - a.goalsFor || a.position - b.position).map((r): ClubStat => ({ club: r.club, name: r.name, value: r.goalsFor })) : [];
  const defenceRanking = played.length ? [...table].sort((a, b) => a.goalsAgainst - b.goalsAgainst || a.position - b.position).map((r): ClubStat => ({ club: r.club, name: r.name, value: r.goalsAgainst })) : [];
  const bestAttack = attackRanking[0];
  const bestDefence = defenceRanking[0];
  const highlights: Highlights = {
    topScorers: top("golos"),
    topAssists: top("assistencias"),
    bestRated: stats.filter((s) => s.avgRating !== undefined && s.ratedGames >= minRatedGames).sort((a, b) => (b.avgRating as number) - (a.avgRating as number) || (a.jogador < b.jogador ? -1 : 1)).slice(0, topN).map((s) => named(s, Math.round((s.avgRating as number) * 100) / 100)),
    mostYellow: top("amarelos"),
    mostRed: top("vermelhos"),
    ...(bestAttack ? { bestAttack } : {}),
    ...(bestDefence ? { bestDefence } : {}),
    attackRanking,
    defenceRanking,
  };

  const players = stats.filter((s) => s.jogos > 0 || s.golos > 0 || s.assistencias > 0).map((s): PlayerRow => {
    const pub = repo.pessoaPublica(s.jogador);
    return {
      player: s.jogador, name: pub?.nomeDesportivo ?? s.jogador, club: s.clube, clubName: clubName.get(s.clube) ?? s.clube,
      position: pub?.jogador?.posicao ?? "", age: pub ? ageOn(pub.nascimento, params.calendario.anoInicial + season - 1) : 0, games: s.jogos, minutes: s.minutos, goals: s.golos,
      assists: s.assistencias, yellow: s.amarelos, red: s.vermelhos,
      ...(s.avgRating !== undefined && s.ratedGames >= minRatedGames ? { rating: Math.round(s.avgRating * 100) / 100 } : {}),
    };
  });
  return {
    league,
    tier,
    ...(tier === "distrital" ? { district: (clubs[0] as { distrito: string }).distrito } : {}),
    season,
    seasonLabel: nomeDaEpoca(season, params.calendario.anoInicial),
    seasons: Array.from({ length: epocaAtual(repo) }, (_, i) => ({ season: i + 1, label: nomeDaEpoca(i + 1, params.calendario.anoInicial) })),
    preview,
    clubs: [...clubs]
      .sort((a, b) => b.reputacao - a.reputacao || a.nome.localeCompare(b.nome, "pt"))
      .map((c) => ({ id: c.id, name: c.nome, locality: c.localidade, reputation: c.reputacao, reputationLevel: nivelDeReputacao(c.reputacao, params), capacity: c.estadio.capacidade })),
    table,
    rounds,
    currentRound,
    gamesPlayed: results.size,
    gamesTotal: jogos.length,
    highlights,
    players,
  };
}
