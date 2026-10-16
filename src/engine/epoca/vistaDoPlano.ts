/** O plano do clube do gamer como a página Tática o mostra (RZ-158): onze (escolhido ou proposto), plantel e disponibilidade. */
import { readSession } from "./sessaoJogo";
import type { ViewPlan } from "../api/contratos";
import type { Params } from "../config/parametros";
import type { BaseData } from "../dados/tipos";
import { FORMATION_IDS, FORMATIONS } from "../jogo/formacoes";
import type { FormationId } from "../jogo/tipos";
import type { Position } from "../mundo/tipos";
import type { Repository } from "../persistencia/repositorio";
import { addDays } from "../calendario/datas";
import { aptitudeIn, aptitudeFactor } from "../jogo/equipa";
import { clubCandidates, timeState } from "./avancar";
import { unavailable, confirmedMatch, readPlan, planLineup } from "./planoDeJogo";

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
  const lineup = plan.lineup ?? planLineup(plan, candidates, new Set(away.keys()), params).map((j) => ({ player: j.id, position: j.position }));
  const opponent = next ? (next.home === club ? next.away : next.home) : undefined;
  return {
    clubName: data.clubs.find((c) => c.id === club)?.name ?? club,
    tactic: plan.tactic,
    automatic: !plan.lineup,
    formations: FORMATION_IDS,
    formationPositions: Object.fromEntries(FORMATION_IDS.map((f) => [f, [...FORMATIONS[f]]])) as Record<FormationId, Position[]>,
    lineup: lineup.map((o) => {
      const aptitude = aptitudeIn(candidates.find((c) => c.person === o.player)?.positions ?? [], o.position, params);
      const performance = Math.round(aptitudeFactor(aptitude, o.position, params) * 100) / 100;
      return { player: o.player, name: name(o.player), position: o.position, aptitude, performance, outOfPosition: performance < 0.95 };
    }),
    squad: players
      .map((j) => {
        const f = away.get(j.person);
        return { player: j.person, name: name(j.person), form: Math.round((form.get(j.person) ?? 1) * 100) / 100, positions: j.positions as { pos: Position; aptitude: number }[], ...(f ? { unavailable: f.motivo, ...(f.detalhe !== undefined ? { matchesPerMeet: f.detalhe } : {}) } : {}) };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "pt")),
    ...(next && opponent ? { nextMatch: { id: next.id, date: next.date, competition: next.competition, opponent: data.clubs.find((c) => c.id === opponent)?.name ?? opponent, atHome: next.home === club, confirmed: confirmedMatch(repo, next.id), ongoing: readSession(repo)?.match === next.id, opponentId: opponent, opponentColours: data.clubs.find((c) => c.id === opponent)?.colours ?? "" } } : {}),
  };
}
