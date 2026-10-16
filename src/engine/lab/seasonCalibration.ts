/**
 * Headless calibration harness (RZ-123): creates a world, plays N consecutive seasons through the same path as the game
 * (`avancar`) and returns a report with the numbers that must stay plausible: goals per game, home advantage, stadium
 * occupancy, injuries and cards per game, CP turnover, district league sizes and club money by tier and by district.
 * Read-only: it never changes rules. Acceptable ranges live in `CALIBRATION_LIMITS`.
 */
import type { Servicos } from "../api/handler";
import { handle } from "../api/handler";
import { importData } from "../data/importData";
import type { Repository } from "../persistence/repository";
import { pyramidData, readPyramid, pyramidLeagues } from "../season/seasonPyramid";
import { worldCompetitions } from "./lab";

export type Tier = "firstLeague" | "secondLeague" | "thirdLeague" | "cp" | "district";
const TIERS: Tier[] = ["firstLeague", "secondLeague", "thirdLeague", "cp", "district"];

export type SeasonReport = {
  season: number;
  games: number;
  goalsPerGame: Record<Tier, number>;
  homeWinRate: number;
  drawRate: number;
  /** Attendance / capacity, averaged per tier. */
  occupancy: Record<Tier, number>;
  /** Share of games with a full stadium (≥ 98 %) and with an almost empty one (< 10 %). */
  soldOutRate: number;
  emptyRate: number;
  injuriesPerGame: number;
  yellowsPerGame: number;
  redsPerGame: number;
  /** Share of the 40 CP clubs that leave it at the end of the season (promoted or relegated). */
  cpTurnover: number;
  districtLeagues: { min: number; max: number; mean: number };
  /** Median balance (€) per tier at the end of the season. */
  medianBalance: Record<Tier, number>;
  /** Median balance (€) per district, summarised by its lowest and highest district. */
  districtBalance: { lowest: { district: string; balance: number }; highest: { district: string; balance: number } };
  negativeClubs: number;
  warnings: string[];
};

export type CalibrationReport = { seed: string; seasons: SeasonReport[]; ms: number };

/** Plausible ranges (mean over all seasons). Adjust here, not in tests. */
export const CALIBRATION_LIMITS = {
  goalsPerGame: [2.0, 3.4],
  homeWinRate: [0.38, 0.55],
  drawRate: [0.18, 0.32],
  occupancy: [0.15, 0.95],
  emptyRate: 0.15,
  cpTurnover: [0.15, 0.45],
  districtLeagues: [6, 16],
  negativeClubs: 0.1,
} as const;

const median = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)] ?? 0;
const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);
const perTier = (): Record<Tier, number> => ({ firstLeague: 0, secondLeague: 0, thirdLeague: 0, cp: 0, district: 0 });
const ratio = (a: Record<Tier, number>, b: Record<Tier, number>) => Object.fromEntries(TIERS.map((t) => [t, b[t] ? a[t] / b[t] : 0])) as Record<Tier, number>;

type Measured = Pick<SeasonReport, "season" | "games" | "goalsPerGame" | "homeWinRate" | "drawRate" | "occupancy" | "soldOutRate" | "emptyRate" | "injuriesPerGame" | "yellowsPerGame" | "redsPerGame">;

function measureSeason(repo: Repository, season: number, leagues: Map<string, Tier>, capacity: Map<string, number>, injuriesBefore: number): Measured {
  const goals = perTier(), gamesByTier = perTier(), occ = perTier(), occN = perTier();
  let games = 0, home = 0, draws = 0, yellows = 0, reds = 0, soldOut = 0, empty = 0, withCrowd = 0;
  for (const [competition, tier] of leagues) {
    for (const g of repo.competitionMatches(competition, season)) {
      games++; gamesByTier[tier]++; goals[tier] += g.homeGoals + g.awayGoals;
      if (g.homeGoals > g.awayGoals) home++; else if (g.homeGoals === g.awayGoals) draws++;
      const cap = capacity.get(g.home);
      if (g.attendance && cap) {
        const r = g.attendance / cap;
        occ[tier] += r; occN[tier]++; withCrowd++;
        if (r >= 0.98) soldOut++;
        if (r < 0.1) empty++;
      }
    }
    for (const s of repo.playerStatsForCompetition(competition, season)) { yellows += s.yellows; reds += s.reds; }
  }
  return {
    season, games,
    goalsPerGame: ratio(goals, gamesByTier),
    homeWinRate: games ? home / games : 0,
    drawRate: games ? draws / games : 0,
    occupancy: ratio(occ, occN),
    soldOutRate: withCrowd ? soldOut / withCrowd : 0,
    emptyRate: withCrowd ? empty / withCrowd : 0,
    injuriesPerGame: games ? (repo.count("INJURY") - injuriesBefore) / games : 0,
    yellowsPerGame: games ? yellows / games : 0,
    redsPerGame: games ? reds / games : 0,
  };
}

export async function runSeasons(services: Servicos, seed: string, seasons: number, onSeason: (s: SeasonReport) => void = () => undefined): Promise<CalibrationReport> {
  const t0 = Date.now();
  await handle({ id: 1, type: "createWorld", input: { seed } }, services);
  const { repository: repo } = await services.openRepository();
  const imported = importData(await services.loadData());
  if (!imported.ok) throw new Error(imported.errors.join("\n"));
  const base = imported.data;
  const capacity = new Map(base.clubs.map((c) => [c.id, c.stadium.capacity] as const));
  const districtOf = new Map(base.clubs.map((c) => [c.id, c.district] as const));
  const out: SeasonReport[] = [];
  let id = 10;
  for (let n = 1; n <= seasons; n++) {
    const injuriesBefore = repo.count("INJURY");
    let summary;
    for (let guard = 0; !summary && guard < 120; guard++) summary = (await handle({ id: id++, type: "advance", input: { mode: "week" } }, services)).seasonSummary;
    if (!summary) throw new Error(`season ${n} did not close within 120 weeks`);
    // the pyramid of season n is still stored after the close (the next one is saved under n + 1)
    const leagues = new Map<string, Tier>();
    for (const c of worldCompetitions(pyramidData(repo, base, n))) leagues.set(c.league, c.tier as Tier);
    const measured = measureSeason(repo, n, leagues, capacity, injuriesBefore);
    const cpLeft = summary.movements.filter((m) => m.from.startsWith("cp-")).length;
    const sizes = Object.values(readPyramid(repo, base, n + 1).districtLeagues).map((l) => l.length);
    const byTier = new Map<Tier, number[]>();
    const byDistrict = new Map<string, number[]>();
    let negative = 0, total = 0;
    for (const [club, l] of pyramidLeagues(readPyramid(repo, base, n), base)) {
      const balance = Number(repo.meta(`balance.${club}`) ?? 0);
      (byTier.get(l.tier as Tier) ?? byTier.set(l.tier as Tier, []).get(l.tier as Tier)!).push(balance);
      const d = districtOf.get(club) ?? "?";
      (byDistrict.get(d) ?? byDistrict.set(d, []).get(d)!).push(balance);
      if (balance < 0) negative++;
      total++;
    }
    const medianBalance = perTier();
    for (const t of TIERS) medianBalance[t] = median(byTier.get(t) ?? []);
    const districts = [...byDistrict].map(([district, v]) => ({ district, balance: median(v) })).sort((a, b) => a.balance - b.balance);
    const report: SeasonReport = {
      ...measured,
      cpTurnover: cpLeft / 40,
      districtLeagues: { min: Math.min(...sizes), max: Math.max(...sizes), mean: mean(sizes) },
      medianBalance,
      districtBalance: { lowest: districts[0] ?? { district: "?", balance: 0 }, highest: districts.at(-1) ?? { district: "?", balance: 0 } },
      negativeClubs: total ? negative / total : 0,
      warnings: summary.warnings,
    };
    out.push(report);
    onSeason(report);
  }
  return { seed, seasons: out, ms: Date.now() - t0 };
}

export type Failure = { rule: string; value: number; expected: string };

/** Compares the report's means with `CALIBRATION_LIMITS`. */
export function evaluateCalibration(r: CalibrationReport): Failure[] {
  const L = CALIBRATION_LIMITS;
  const m = (f: (e: SeasonReport) => number) => mean(r.seasons.map(f));
  const failures: Failure[] = [];
  const within = (rule: string, v: number, [a, b]: readonly number[]) => { if (v < (a as number) || v > (b as number)) failures.push({ rule, value: v, expected: `${a}–${b}` }); };
  const atMost = (rule: string, v: number, max: number) => { if (v > max) failures.push({ rule, value: v, expected: `≤ ${max}` }); };
  within("goals per game (Primeira Liga)", m((e) => e.goalsPerGame.firstLeague), L.goalsPerGame);
  within("goals per game (all tiers)", m((e) => mean(TIERS.map((x) => e.goalsPerGame[x]))), L.goalsPerGame);
  within("home win rate", m((e) => e.homeWinRate), L.homeWinRate);
  within("draw rate", m((e) => e.drawRate), L.drawRate);
  within("occupancy (Primeira Liga)", m((e) => e.occupancy.firstLeague), L.occupancy);
  atMost("games with an almost empty stadium", m((e) => e.emptyRate), L.emptyRate);
  within("CP turnover", m((e) => e.cpTurnover), L.cpTurnover);
  within("mean district league size", m((e) => e.districtLeagues.mean), L.districtLeagues);
  atMost("clubs with a negative balance", m((e) => e.negativeClubs), L.negativeClubs);
  return failures;
}

export function formatReport(r: CalibrationReport): string {
  const f = (n: number, d = 2) => n.toFixed(d);
  const eur = (n: number) => Math.round(n).toLocaleString("en-GB");
  const pct = (n: number, d = 0) => `${f(n * 100, d)}%`;
  const lines = [`Calibration: seed "${r.seed}", ${r.seasons.length} seasons, ${(r.ms / 1000).toFixed(0)} s`, "", "season | games | goals/game PL | home% | draw% | occupancy PL | sold out | near empty | injuries/game | yellows/game | reds/game | CP turnover | district leagues min-mean-max | negative"];
  for (const e of r.seasons) lines.push([e.season, e.games, f(e.goalsPerGame.firstLeague), pct(e.homeWinRate), pct(e.drawRate), pct(e.occupancy.firstLeague), pct(e.soldOutRate, 1), pct(e.emptyRate, 1), f(e.injuriesPerGame, 3), f(e.yellowsPerGame), f(e.redsPerGame, 3), pct(e.cpTurnover), `${e.districtLeagues.min}-${f(e.districtLeagues.mean, 1)}-${e.districtLeagues.max}`, pct(e.negativeClubs, 1)].join(" | "));
  lines.push("", "Median balance per tier (€), by season:", "season | " + TIERS.join(" | "));
  for (const e of r.seasons) lines.push([e.season, ...TIERS.map((t) => eur(e.medianBalance[t]))].join(" | "));
  lines.push("", "Median balance per district (€), lowest and highest district, by season:");
  for (const e of r.seasons) lines.push(`${e.season} | ${e.districtBalance.lowest.district}: ${eur(e.districtBalance.lowest.balance)} | ${e.districtBalance.highest.district}: ${eur(e.districtBalance.highest.balance)}`);
  lines.push("", "Goals per game by tier (mean): " + TIERS.map((t) => `${t} ${f(mean(r.seasons.map((e) => e.goalsPerGame[t])))}`).join(", "));
  lines.push("Occupancy by tier (mean): " + TIERS.map((t) => `${t} ${pct(mean(r.seasons.map((e) => e.occupancy[t])))}`).join(", "));
  const failures = evaluateCalibration(r);
  lines.push("", failures.length ? "OUT OF LIMITS:" : "Everything within limits.", ...failures.map((x) => `- ${x.rule}: ${f(x.value, 3)} (expected ${x.expected})`));
  const warnings = [...new Set(r.seasons.flatMap((e) => e.warnings))];
  if (warnings.length) lines.push("", "Engine warnings:", ...warnings.map((a) => `- ${a}`));
  return lines.join("\n");
}
