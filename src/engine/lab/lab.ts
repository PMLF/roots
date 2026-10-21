/**
 * Laboratório (pedido do Pedro, 15-10-2026; RZ-139): simula **sem gravar nada no save** um jogo entre dois clubes ou uma
 * liga inteira com o mundo gerado, para ver o motor a funcionar e dar feedback enquanto o ciclo de dias (RZ-119) não existe.
 * Usa o mesmo motor, o mesmo calendário e os mesmos desempates do jogo a sério; um repositório em memória guarda a liga.
 */
import { isInSecondDistrict } from "../season/districts";
import { Rng } from "../random/rng";
import { generateLeagueCalendar, forRepository } from "../calendar/calendar";
import { sortStandings } from "../competition/standings";
import type { Params, Tier } from "../config/parameters";
import type { BaseData } from "../data/types";
import { FORMATIONS, DEFAULT_TACTIC } from "../match/formations";
import { automaticLineup, type LineupCandidate } from "../match/team";
import { playMatch } from "../match/detail";
import type { MatchReport } from "../match/statistics";
import type { MatchTeam, FormationId, Tactic } from "../match/types";
import type { Repository } from "../persistence/repository";
import { MemoryRepository } from "../persistence/repositoryMemory";

export type SummaryCompetition = { league: string; tier: Tier; clubs: number; /** Só nas distritais. */ district?: string };

/** As ligas/séries do mundo, da mais alta para a mais baixa. */
export function worldCompetitions(data: BaseData): SummaryCompetition[] {
  const order: Tier[] = ["firstLeague", "secondLeague", "thirdLeague", "cp", "district"];
  const m = new Map<string, SummaryCompetition>();
  for (const c of data.clubs) {
    if (isInSecondDistrict(c.league)) continue; // a SegundaDistrital distrital não é uma competição simulada
    const l = m.get(c.league) ?? m.set(c.league, { league: c.league, tier: c.tier, clubs: 0, ...(c.tier === "district" ? { district: c.district } : {}) }).get(c.league)!;
    l.clubs++;
  }
  return [...m.values()].sort((a, b) => order.indexOf(a.tier) - order.indexOf(b.tier) || a.league.localeCompare(b.league, "pt"));
}

function candidates(repo: Repository, club: string): LineupCandidate[] {
  return repo
    .clubPlayers(club)
    .filter((j) => j.state === "active")
    .map((j) => ({ person: j.person, positions: j.positions, attributes: j.attributes, heightCm: j.heightCm }));
}

function team(club: string, candidates: readonly LineupCandidate[], tactic?: Partial<Tactic>): MatchTeam {
  const t: Tactic = { ...DEFAULT_TACTIC, ...tactic };
  return { club, lineup: automaticLineup(candidates, FORMATIONS[t.formation]), tactic: t };
}

export type LabMatch = {
  home: { id: string; name: string; tactic: Tactic };
  away: { id: string; name: string; tactic: Tactic };
  report: MatchReport;
  /** Nome de cada jogador que apareceu no relatório. */
  names: Record<string, string>;
  /** Quem começou: posição ocupada e nome. */
  lineups: { home: { id: string; position: string }[]; away: { id: string; position: string }[] };
  stories: string[];
};

export function labMatch(
  repo: Repository,
  data: BaseData,
  params: Params,
  e: { home: string; away: string; seed: string; homeTactic?: Partial<Tactic>; awayTactic?: Partial<Tactic> },
): LabMatch {
  const cc = data.clubs.find((c) => c.id === e.home);
  const cf = data.clubs.find((c) => c.id === e.away);
  if (!cc || !cf) throw new Error("Clube desconhecido");
  if (cc.id === cf.id) throw new Error("Escolhe dois clubes diferentes");
  const home = team(cc.id, candidates(repo, cc.id), e.homeTactic);
  const away = team(cf.id, candidates(repo, cf.id), e.awayTactic);
  const r = playMatch({ seed: e.seed, id: `lab-${e.seed}`, home, away }, 0, { id: `lab-${e.seed}`, competition: "LAB", season: 0, round: 1, date: "2026-08-15" }, params);
  if (r.level !== 0) throw new Error("nível inesperado");
  const names: Record<string, string> = {};
  for (const c of [cc.id, cf.id]) for (const p of repo.publicSquad(c)) names[p.id] = p.sportingName;
  return {
    home: { id: cc.id, name: cc.name, tactic: home.tactic as Tactic },
    away: { id: cf.id, name: cf.name, tactic: away.tactic as Tactic },
    report: r.report,
    names,
    lineups: { home: home.lineup.map((j) => ({ id: j.id, position: j.position })), away: away.lineup.map((j) => ({ id: j.id, position: j.position })) },
    stories: r.stories.map((h) => h.type),
  };
}

type LeagueLine = {
  position: number;
  club: string;
  name: string;
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  scoredGoals: number;
  concededGoals: number;
  difference: number;
  points: number;
  tiebreakPer?: string;
  reputation: number;
};

export type LabLeague = {
  league: string;
  tier: Tier;
  rounds: number;
  matches: number;
  table: LeagueLine[];
  topScorers: { player: string; name: string; club: string; goals: number }[];
  totals: { goalsPerMatch: number; yellowsPerMatch: number; redsPerMatch: number; injuriesPerMatch: number; routs: number; hatTricks: number; ms: number };
};

export function labLeague(repo: Repository, data: BaseData, params: Params, e: { league: string; seed: string; formation?: FormationId }): LabLeague {
  const t0 = Date.now();
  const clubs = data.clubs.filter((c) => c.league === e.league);
  if (clubs.length < 2) throw new Error("Liga desconhecida");
  const tier = (clubs[0] as { tier: Tier }).tier;
  const teams = new Map(clubs.map((c) => [c.id, team(c.id, candidates(repo, c.id), e.formation ? { formation: e.formation } : undefined)]));
  const cal = generateLeagueCalendar({ competition: e.league, tier, clubs: clubs.map((c) => c.id) }, 1, params.calendar, new Rng(`${e.seed}|cal|${e.league}`));
  const { matches } = forRepository(cal);
  const mem = new MemoryRepository();
  const goals = new Map<string, { club: string; goals: number }>();
  let yellows = 0, reds = 0, injuries = 0, routs = 0, hatTricks = 0;
  for (const g of [...matches].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1))) {
    const r = playMatch({ seed: e.seed, id: g.id, home: teams.get(g.home) as MatchTeam, away: teams.get(g.away) as MatchTeam }, 1, { id: g.id, competition: g.competition, season: g.season, round: g.round, date: g.date }, params);
    mem.recordMatch(r.record.match, r.record.facts, r.record.appearances);
    for (const f of r.record.facts) {
      if (f.type === "G" && f.extra !== "auto") goals.set(f.player, { club: f.club, goals: (goals.get(f.player)?.goals ?? 0) + 1 });
      if (f.type === "CA") yellows++;
      if (f.type === "CV") reds++;
    }
    injuries += r.record.injuries.length;
    for (const h of r.stories) {
      if (h.type === "ROUT") routs++;
      if (h.type === "HATTRICK") hatTricks++;
    }
  }
  const rep = new Map(clubs.map((c) => [c.id, c.reputation] as const));
  const name = new Map(clubs.map((c) => [c.id, c.name] as const));
  const table = sortStandings(mem.standings(e.league, 1), mem.competitionMatches(e.league, 1), params.tiebreak[tier === "cp" || tier === "district" ? "promotion" : "league"], {
    winPoints: params.standings.winPoints,
    drawPoints: params.standings.drawPoints,
    seed: e.seed,
    competition: e.league,
    season: 1,
    reputation: rep,
    clubs: clubs.map((c) => c.id),
  }).map((l): LeagueLine => ({
    position: l.position, club: l.club, name: name.get(l.club) ?? l.club, matches: l.matches, wins: l.wins, draws: l.draws, losses: l.losses,
    scoredGoals: l.scoredGoals, concededGoals: l.concededGoals, difference: l.difference, points: l.points, reputation: rep.get(l.club) ?? 0,
    ...(l.tiebreakPer ? { tiebreakPer: l.tiebreakPer } : {}),
  }));
  const names = new Map<string, string>();
  for (const c of clubs) for (const p of repo.publicSquad(c.id)) names.set(p.id, p.sportingName);
  const n = matches.length || 1;
  return {
    league: e.league,
    tier,
    rounds: cal.rounds.length,
    matches: matches.length,
    table,
    topScorers: [...goals.entries()]
      .sort((a, b) => b[1].goals - a[1].goals || (a[0] < b[0] ? -1 : 1))
      .slice(0, 10)
      .map(([player, v]) => ({ player, name: names.get(player) ?? player, club: name.get(v.club) ?? v.club, goals: v.goals })),
    totals: {
      goalsPerMatch: table.reduce((s, l) => s + l.scoredGoals, 0) / n,
      yellowsPerMatch: yellows / n,
      redsPerMatch: reds / n,
      injuriesPerMatch: injuries / n,
      routs: routs,
      hatTricks,
      ms: Date.now() - t0,
    },
  };
}
