/**
 * Página de uma liga ou série (RZ-145): classificação com zonas, jornadas, destaques (marcadores, assistentes, melhores
 * jogadores, cartões, melhor ataque e defesa) e clubes. Lê o repositório; se a época ainda não tem calendário gravado
 * (antes do ciclo de dias, RZ-119) mostra uma **prévia** gerada com a semente do mundo, sem gravar nada.
 * Código novo em inglês (CLAUDE.md); os tipos de escalão herdam os nomes antigos até ao RZ-143.
 */
import { stadiumCapacity } from "../club/stadiumState";
import { Rng } from "../random/rng";
import { generateLeagueCalendar, forRepository } from "../calendar/calendar";
import { reputationLevel } from "../club/reputation";
import { derived, type Tier, type LevelReputation, type Params } from "../config/parameters";
import type { BaseData } from "../data/types";
import type { Repository } from "../persistence/repository";
import type { ScheduledMatch } from "../persistence/types";
import { seasonName } from "../season/saveYear";
import { currentSeason } from "../season/seasonPyramid";
import { europeSlots } from "../europe/access";
import { europeZone, type EuropeSlots } from "../europe/zones";
import { competitionTable } from "./table";

type Zone = "champion" | "promotion" | "relegation" | "cl" | "clq" | "el" | "ecl";

type TableRow = {
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

type Round = {
  number: number;
  date: string;
  matches: { id: string; home: string; away: string; homeName: string; awayName: string; homeGoals?: number; awayGoals?: number }[];
  bye?: string;
};

type PlayerStat = { player: string; name: string; club: string; clubName: string; value: number; games: number };
/** Linha completa de um jogador na competição (separador Estatísticas). */
type PlayerRow = { player: string; name: string; club: string; clubName: string; position: string; age: number; games: number; minutes: number; goals: number; assists: number; yellow: number; red: number; rating?: number };
type ClubStat = { club: string; name: string; value: number };

type Highlights = {
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
  tier: Tier;
  district?: string;
  season: number;
  /** «2026/27» */
  seasonLabel: string;
  /** Épocas do save, da primeira à atual. */
  seasons: { season: number; label: string }[];
  /** Calendário gerado só para mostrar (ainda não está gravado no save). */
  preview: boolean;
  clubs: { id: string; name: string; locality: string; reputation: number; reputationLevel: LevelReputation; capacity: number }[];
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
export function zoneSizes(tier: Tier, params: Params): { promoted: number; relegated: number } {
  const p = params.pyramid;
  switch (tier) {
    case "firstLeague": return { promoted: 0, relegated: p.firstLeague.drop };
    case "secondLeague": return { promoted: p.secondLeague.rise, relegated: p.secondLeague.drop };
    case "thirdLeague": return { promoted: p.thirdLeague.rise, relegated: p.thirdLeague.drop };
    case "cp": return { promoted: p.cp.risePerSeries, relegated: Math.round(derived(params).dropPerMeanSeries) };
    case "district": return { promoted: 0, relegated: 0 };
  }
}

function zoneOf(position: number, total: number, tier: Tier, params: Params, europe?: EuropeSlots): Zone | undefined {
  const { promoted, relegated } = zoneSizes(tier, params);
  if (position === 1) return "champion";
  if (tier === "firstLeague" && europe) { const z = europeZone(position, europe); if (z) return z; }
  if (position <= promoted) return "promotion";
  if (relegated > 0 && position > total - relegated) return "relegation";
  return undefined;
}

/** Idade a 1 de julho do ano inicial (a data de arranque do mundo). */
function ageOn(birth: string, year: number): number {
  const [y = 0, m = 1, d = 1] = birth.split("-").map(Number);
  return year - y - (m > 7 || (m === 7 && d > 1) ? 1 : 0);
}

export function competitionPage(repo: Repository, data: BaseData, params: Params, league: string, season = currentSeason(repo)): CompetitionPage | undefined {
  const clubs = data.clubs.filter((c) => c.league === league);
  if (clubs.length < 2) return undefined;
  const tier = (clubs[0] as { tier: Tier }).tier;
  const clubName = new Map(clubs.map((c) => [c.id, c.name] as const));
  const reputation = new Map(clubs.map((c) => [c.id, c.reputation] as const));
  const seed = repo.meta("seed") ?? "?";

  let { matches, byes } = repo.calendar(league, season);
  let preview = false;
  if (matches.length === 0) {
    preview = true;
    const cal = generateLeagueCalendar({ competition: league, tier: tier, clubs: clubs.map((c) => c.id) }, season, params.calendar, new Rng(`${seed}|cal|${league}`));
    ({ matches, byes } = forRepository(cal));
  }
  const results = new Map(repo.competitionMatches(league, season).map((j) => [j.id, j] as const));
  const byRound = new Map<number, ScheduledMatch[]>();
  for (const j of matches) (byRound.get(j.round) ?? byRound.set(j.round, []).get(j.round)!).push(j);
  const rounds = [...byRound.keys()].sort((a, b) => a - b).map((n): Round => {
    const games = byRound.get(n) ?? [];
    const bye = byes.find((f) => f.round === n)?.club;
    return {
      number: n,
      date: games[0]?.date ?? "",
      matches: games.map((j) => {
        const r = results.get(j.id);
        return { id: j.id, home: j.home, away: j.away, homeName: clubName.get(j.home) ?? j.home, awayName: clubName.get(j.away) ?? j.away, ...(r ? { homeGoals: r.homeGoals, awayGoals: r.awayGoals } : {}) };
      }),
      ...(bye ? { bye: clubName.get(bye) ?? bye } : {}),
    };
  });
  const currentRound = rounds.reduce((last, r) => (r.matches.some((m) => m.homeGoals !== undefined) ? r.number : last), 0);

  const ordered = competitionTable(repo, league, season, tier === "cp" || tier === "district" ? "promotion" : "league", params, { seed, reputation: reputation });
  const rows: Omit<TableRow, "zone">[] = ordered.length > 0
    ? ordered.map((l) => ({ position: l.position, club: l.club, name: clubName.get(l.club) ?? l.club, played: l.matches, won: l.wins, drawn: l.draws, lost: l.losses, goalsFor: l.scoredGoals, goalsAgainst: l.concededGoals, goalDifference: l.difference, points: l.points, ...(l.tiebreakPer ? { tiebreak: l.tiebreakPer } : {}) }))
    : [...clubs].sort((a, b) => b.reputation - a.reputation || a.name.localeCompare(b.name, "pt")).map((c, i) => ({ position: i + 1, club: c.id, name: c.name, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0 }));
  // Clubes sem jogos na tabela (calendário ainda não gravado) entram no fim, a zeros, por reputação.
  const present = new Set(rows.map((r) => r.club));
  for (const c of [...clubs].filter((x) => !present.has(x.id)).sort((x, y) => y.reputation - x.reputation || x.name.localeCompare(y.name, "pt"))) {
    rows.push({ position: rows.length + 1, club: c.id, name: c.name, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0 });
  }
  const euroSlots = tier === "firstLeague" ? europeSlots(repo, data, params, season) : undefined;
  const table: TableRow[] = rows.map((r) => {
    const zone = zoneOf(r.position, rows.length, tier, params, euroSlots);
    return zone ? { ...r, zone } : r;
  });

  // destaques
  const { topN, minRatedGames } = params.competitionView;
  const stats = repo.playerStatsForCompetition(league, season);
  const named = (s: (typeof stats)[number], value: number): PlayerStat => ({ player: s.player, name: repo.publicPerson(s.player)?.sportingName ?? s.player, club: s.club, clubName: clubName.get(s.club) ?? s.club, value, games: s.matches });
  const top = (key: "goals" | "assists" | "yellows" | "reds") =>
    stats.filter((s) => s[key] > 0).sort((a, b) => b[key] - a[key] || b.matches - a.matches || (a.player < b.player ? -1 : 1)).slice(0, topN).map((s) => named(s, s[key]));
  const played = table.filter((r) => r.played > 0);
  const attackRanking = played.length ? [...table].sort((a, b) => b.goalsFor - a.goalsFor || a.position - b.position).map((r): ClubStat => ({ club: r.club, name: r.name, value: r.goalsFor })) : [];
  const defenceRanking = played.length ? [...table].sort((a, b) => a.goalsAgainst - b.goalsAgainst || a.position - b.position).map((r): ClubStat => ({ club: r.club, name: r.name, value: r.goalsAgainst })) : [];
  const bestAttack = attackRanking[0];
  const bestDefence = defenceRanking[0];
  const highlights: Highlights = {
    topScorers: top("goals"),
    topAssists: top("assists"),
    bestRated: stats.filter((s) => s.avgRating !== undefined && s.ratedGames >= minRatedGames).sort((a, b) => (b.avgRating as number) - (a.avgRating as number) || (a.player < b.player ? -1 : 1)).slice(0, topN).map((s) => named(s, Math.round((s.avgRating as number) * 100) / 100)),
    mostYellow: top("yellows"),
    mostRed: top("reds"),
    ...(bestAttack ? { bestAttack } : {}),
    ...(bestDefence ? { bestDefence } : {}),
    attackRanking,
    defenceRanking,
  };

  const players = stats.filter((s) => s.matches > 0 || s.goals > 0 || s.assists > 0).map((s): PlayerRow => {
    const pub = repo.publicPerson(s.player);
    return {
      player: s.player, name: pub?.sportingName ?? s.player, club: s.club, clubName: clubName.get(s.club) ?? s.club,
      position: pub?.player?.position ?? "", age: pub ? ageOn(pub.birth, params.calendar.initialYear + season - 1) : 0, games: s.matches, minutes: s.minutes, goals: s.goals,
      assists: s.assists, yellow: s.yellows, red: s.reds,
      ...(s.avgRating !== undefined && s.ratedGames >= minRatedGames ? { rating: Math.round(s.avgRating * 100) / 100 } : {}),
    };
  });
  return {
    league,
    tier,
    ...(tier === "district" ? { district: (clubs[0] as { district: string }).district } : {}),
    season,
    seasonLabel: seasonName(season, params.calendar.initialYear),
    seasons: Array.from({ length: currentSeason(repo) }, (_, i) => ({ season: i + 1, label: seasonName(i + 1, params.calendar.initialYear) })),
    preview,
    clubs: [...clubs]
      .sort((a, b) => b.reputation - a.reputation || a.name.localeCompare(b.name, "pt"))
      .map((c) => ({ id: c.id, name: c.name, locality: c.locality, reputation: c.reputation, reputationLevel: reputationLevel(c.reputation, params), capacity: stadiumCapacity(repo, c, params) })),
    table,
    rounds,
    currentRound,
    gamesPlayed: results.size,
    gamesTotal: matches.length,
    highlights,
    players,
  };
}
