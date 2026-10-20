/** O plano do clube do gamer como a página Tática o mostra (RZ-158): onze (escolhido ou proposto), plantel e disponibilidade. */
import { readSession } from "./matchSession";
import type { ViewPlan } from "../api/contracts";
import type { Params } from "../config/parameters";
import type { BaseData } from "../data/types";
import { FORMATION_IDS, FORMATIONS } from "../match/formations";
import type { FormationId } from "../match/types";
import type { Position } from "../world/types";
import type { Repository } from "../persistence/repository";
import { addDays } from "../calendar/dates";
import { aptitudeIn, aptitudeFactor } from "../match/team";
import { clubCandidates, timeState } from "./advance";
import { ageAt } from "../calendar/dates";
import { unavailable, confirmedMatch, readPlan } from "./gamePlan";

/** Pode confirmar-se? O onze tem de estar completo e sem lesionados nem suspensos: o motor não escolhe por ti. */
function readiness(players: readonly (string | undefined)[], away: ReadonlyMap<string, unknown>, name: (id: string) => string): ViewPlan["ready"] {
  if (players.some((p) => p === undefined)) return { ok: false, reason: "incomplete" };
  const out = (players as string[]).filter((p) => away.has(p));
  return out.length > 0 ? { ok: false, reason: "unavailable", names: out.map(name) } : { ok: true };
}

export function planView(repo: Repository, data: BaseData, params: Params, club: string): ViewPlan {
  const { today, season } = timeState(repo, data, params);
  const seed = repo.meta("seed") ?? "?";
  const plan = readPlan(repo, club);
  const players = repo.clubPlayers(club).filter((j) => j.state === "active");
  const name = (id: string) => repo.publicPerson(id)?.sportingName ?? id;
  // um jogo de hoje que já foi jogado (ao vivo) deixa de ser «o próximo»
  let next = repo.nextMatch(club, today);
  if (next && repo.match(next.id)) next = repo.nextMatch(club, addDays(today, 1));
  const away = next ? unavailable(repo, club, players.map((j) => j.person), next.competition, season, next.round, next.date, seed, params) : new Map();
  const candidates = clubCandidates(repo, club, next?.date ?? today, params);
  const form = new Map(candidates.map((c) => [c.person, c.form ?? 1] as const));
  const roster = new Set(players.map((j) => j.person));
  const chosen = (plan.lineup ?? []).filter((o) => roster.has(o.player));
  const left = [...chosen];
  const slots = FORMATIONS[plan.tactic.formation].map((position) => {
    const i = left.findIndex((o) => o.position === position);
    return { position, player: i >= 0 ? left.splice(i, 1)[0]!.player : undefined };
  });
  const opponent = next ? (next.home === club ? next.away : next.home) : undefined;
  return {
    clubName: data.clubs.find((c) => c.id === club)?.name ?? club,
    clubColours: data.clubs.find((c) => c.id === club)?.colours ?? "",
    tactic: plan.tactic,
    formations: FORMATION_IDS,
    formationPositions: Object.fromEntries(FORMATION_IDS.map((f) => [f, [...FORMATIONS[f]]])) as Record<FormationId, Position[]>,
    lineup: slots.map(({ position, player }) => {
      if (!player) return { position, outOfPosition: false };
      const aptitude = aptitudeIn(candidates.find((c) => c.person === player)?.positions ?? [], position, params);
      const performance = Math.round(aptitudeFactor(aptitude, position, params) * 100) / 100;
      return { position, player, name: name(player), aptitude, performance, outOfPosition: performance < 0.95 };
    }),
    bench: (plan.bench ?? []).filter((id) => roster.has(id)),
    ready: readiness(slots.map((s) => s.player), away, name),
    squad: players
      .map((j) => {
        const f = away.get(j.person);
        const stats = repo.playerStats(j.person).filter((l) => l.season === season);
        const recent = repo.playerRecentRatings(j.person, 5);
        return {
          player: j.person, name: name(j.person), age: ageAt(repo.person(j.person)?.birth ?? today, today), form: Math.round((form.get(j.person) ?? 1) * 100) / 100, positions: j.positions as { pos: Position; aptitude: number }[],
          matches: stats.reduce((n, l) => n + l.matches, 0), goals: stats.reduce((n, l) => n + l.goals, 0),
          ...(recent.length > 0 ? { avgLast5: Math.round((recent.reduce((a, b) => a + b, 0) / recent.length) * 10) / 10 } : {}),
          ...(f ? { unavailable: f.reason, ...(f.detail !== undefined ? { matchesPerMeet: f.detail } : {}) } : {}),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "pt")),
    ...(next && opponent ? { nextMatch: { id: next.id, date: next.date, competition: next.competition, opponent: data.clubs.find((c) => c.id === opponent)?.name ?? data.foreignClubs?.find((c) => c.id === opponent)?.name ?? opponent, atHome: next.home === club, confirmed: confirmedMatch(repo, next.id), ongoing: readSession(repo)?.match === next.id, opponentId: opponent, opponentColours: data.clubs.find((c) => c.id === opponent)?.colours ?? data.foreignClubs?.find((c) => c.id === opponent)?.colours ?? "" } } : {}),
  };
}
