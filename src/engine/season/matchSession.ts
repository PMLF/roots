/**
 * Jogo do gamer ao vivo (RZ-170): o jogo não se simula de uma vez. A sessão guarda o ponto de partida (equipas e tática
 * escolhidas), o minuto atual e as mudanças de tática feitas a meio; como o motor é determinístico e retomável por minuto,
 * o estado reconstrói-se sempre a partir disto (`reproduzir`). Cada passo simula só os minutos pedidos, com a tática em vigor
 * em cada momento. Nada vai para o histórico (nem notícias, nem caixa de entrada) até ao apito final (`finalizar`).
 */
import type { Params } from "../config/parameters";
import type { BaseData } from "../data/types";
import { matchReport } from "../match/statistics";
import { MatchSimulator } from "../match/simulator";
import { playMatch, resolveMatch } from "../match/detail";
import type { MatchInput, MatchEvent, Side, Tactic } from "../match/types";
import type { Repository } from "../persistence/repository";
import type { Position } from "../world/types";
import type { IsoDate } from "../persistence/types";
import { matchReferee } from "../match/matchContext";
import { europeSlots, type EuropeSlots } from "../europe/access";
import { matchTicket, postTicketing, matchContext, coloursOf, teamForMatch, beforeTable, zonesOf, flagsOf, inputFlags, carryFor } from "./advance";
import { SESSION_KEY, xgCurve, matchTeams, type LiveMeeting, type MatchInfo, saveLiveMatch, matchLines, type LiveMatch, type LiveTableLine, type OtherLiveMatch } from "./liveMatch";
import { seasonData } from "./seasonPyramid";
import { rivalEvent, rivalReason } from "./rivals";
import { readPlan, validateTactic } from "./gamePlan";
import { prepareSeason } from "./prepare";

type Change = { minute: number; tactic: Tactic };
/** Uma substituição do gamer. `pausa`: número da paragem que a trouxe (0 = intervalo, que não gasta pausas). */
export type MadeSubstitution = { minute: number; playerOut: string; playerIn: string; pause: number };
/** Uma reorganização do gamer: quem em campo passa a jogar em que posição (RZ-255). */
export type Repositioning = { minute: number; moves: { player: string; position: Position }[] };
export type SavedSession = {
  match: string;
  competition: string;
  round: number;
  season: number;
  date: IsoDate;
  side: Side;
  input: MatchInput;
  changes: Change[];
  substitutions?: MadeSubstitution[];
  repositions?: Repositioning[];
  minute: number;
  table: LiveTableLine[];
  others: OtherLiveMatch[];
  winPoints: number;
  drawPoints: number;
  colours: Record<string, string>;
  tiers?: Record<string, string>;
  zones?: { promoted: number; relegated: number; europe?: EuropeSlots };
  meetings?: LiveMeeting[];
  info?: MatchInfo;
  /** Jogo a eliminar / em campo neutro (e o clube cujo estádio recebe). */
  flags?: { knockout?: boolean; neutral?: boolean; venue?: string };
};

export function readSession(repo: Repository): SavedSession | undefined {
  const raw = repo.meta(SESSION_KEY);
  return raw ? (JSON.parse(raw) as SavedSession) : undefined;
}
const save = (repo: Repository, s: SavedSession) => repo.setMeta(SESSION_KEY, JSON.stringify(s));

/** Refaz o simulador até ao minuto atual, aplicando as mudanças de tática no minuto em que foram feitas. */
function replay(s: SavedSession, params: Params, until: number = s.minute): { sim: MatchSimulator; events: MatchEvent[] } {
  const sim = new MatchSimulator(s.input, params, { manualSubs: s.side });
  const events: MatchEvent[] = [];
  const tactics = s.changes.filter((m) => m.minute <= until);
  const substitutions = (s.substitutions ?? []).filter((t) => t.minute <= until);
  // no mesmo minuto aplica-se primeiro a tática e depois as substituições (sempre pela mesma ordem, para a repetição ser igual)
  const repositions = (s.repositions ?? []).filter((t) => t.minute <= until);
  const minutes = [...new Set([...tactics.map((m) => m.minute), ...substitutions.map((t) => t.minute), ...repositions.map((t) => t.minute)])].sort((x, y) => x - y);
  for (const m of minutes) {
    events.push(...sim.simulateUntil(m));
    for (const x of tactics.filter((y) => y.minute === m)) sim.changeTactic(s.side, x.tactic);
    const ofMinute = substitutions.filter((t) => t.minute === m);
    if (ofMinute.length > 0) events.push(...sim.substitute(s.side, ofMinute));
    for (const x of repositions.filter((y) => y.minute === m)) sim.reposition(s.side, x.moves);
  }
  events.push(...sim.simulateUntil(until));
  return { sim, events };
}

/** O minuto do intervalo: as substituições feitas aqui não gastam pausas. */
export const halfTimeMinute = (params: Params): number => Math.round(params.match.duration / 2);

/** A vista do jogo no minuto atual: o mesmo formato do jogo guardado, só com o que já aconteceu. */
function view(repo: Repository, s: SavedSession, params: Params, names: ReadonlyMap<string, string>): LiveMatch {
  const { sim, events } = replay(s, params);
  const summary = sim.summary();
  const personName = (id: string) => repo.publicPerson(id)?.sportingName ?? id;
  const lines = matchLines(events, sim.duration, personName).filter((l) => l.minute <= s.minute && (l.type !== "end" || sim.finished));
  const current = new Map([...sim.team("home").lineup, ...sim.team("away").lineup].map((j) => [j.id, j.position] as const));
  const teams = matchTeams(s.input, events, matchReport(s.input, s.input, events, summary, params), personName, current);
  const last = [...s.changes].reverse()[0]?.tactic ?? (s.side === "home" ? s.input.home.tactic : s.input.away.tactic);
  const others = s.others.map((o) => {
    const goals = o.goals.filter((g) => g.minute <= s.minute);
    return { ...o, goals, homeGoals: goals.filter((g) => g.side === "home").length, awayGoals: goals.filter((g) => g.side === "away").length };
  });
  return {
    id: s.match, competition: s.competition, round: s.round, date: s.date,
    home: { id: s.input.home.club, name: names.get(s.input.home.club) ?? s.input.home.club },
    away: { id: s.input.away.club, name: names.get(s.input.away.club) ?? s.input.away.club },
    duration: sim.duration, homeGoals: summary.home.goals, awayGoals: summary.away.goals, lines,
    table: s.table, winPoints: s.winPoints, drawPoints: s.drawPoints, others, colours: s.colours, ...(s.tiers ? { tiers: s.tiers } : {}), ...(s.zones ? { zones: s.zones } : {}),
    summary, teams, subs: { used: events.filter((e) => e.type === "substitution" && e.side === s.side).length, max: params.match.substitutions.max, usedPauses: new Set((s.substitutions ?? []).map((t) => t.pause).filter((p) => p > 0)).size, pausesMax: params.match.substitutions.pauses }, xg: xgCurve(events, s.minute), ...(s.meetings ? { meetings: s.meetings } : {}), ...(s.info ? { info: s.info } : {}), gamerSide: s.side, ongoing: true, minute: s.minute, ...(sim.pendingInjuries(s.side).length > 0 ? { pendingInjury: sim.pendingInjuries(s.side) } : {}), ...(last ? { tactic: last } : {}),
  };
}

const tiersOf = (data: BaseData, ids: Iterable<string>): Record<string, string> => {
  const by = new Map(data.clubs.map((c) => [c.id, c.tier as string] as const));
  const out: Record<string, string> = {};
  for (const id of ids) { const t = by.get(id); if (t) out[id] = t; }
  return out;
};

const namesOf = (data: BaseData) => new Map(data.clubs.map((c) => [c.id, c.name] as const));

/** Começa o jogo do gamer (já com a tática e o onze do plano). Não regista nada no histórico. */
export function startSession(repo: Repository, base: BaseData, params: Params, gamerClub: string, match: string): LiveMatch {
  const existing = readSession(repo);
  const data = seasonData(repo, base);
  const names = namesOf(data);
  if (existing) {
    if (existing.match !== match) throw new Error("Já há um jogo a decorrer");
    return view(repo, existing, params, names);
  }
  const { today, season } = prepareSeason(repo, data, params);
  const g = repo.dayMatches(today).find((x) => x.id === match);
  if (!g || repo.match(g.id) || (g.home !== gamerClub && g.away !== gamerClub)) throw new Error("Este jogo não é para jogar hoje");
  const seed = repo.meta("seed") ?? "?";
  const plan = readPlan(repo, gamerClub);
  const home = teamForMatch(repo, g.home, g.competition, season, g.round, today, seed, params, g.home === gamerClub ? plan : undefined);
  const away = teamForMatch(repo, g.away, g.competition, season, g.round, today, seed, params, g.away === gamerClub ? plan : undefined);
  const side: Side = g.home === gamerClub ? "home" : "away";
  // os outros jogos da competição, no mesmo dia: já se sabe o que vão dar (não dependem do teu jogo) mas só se mostram ao minuto
  const others: OtherLiveMatch[] = [];
  for (const o of repo.dayMatches(today)) {
    if (o.id === g.id || o.competition !== g.competition || repo.match(o.id)) continue;
    const ec = teamForMatch(repo, o.home, o.competition, season, o.round, today, seed, params);
    const ef = teamForMatch(repo, o.away, o.competition, season, o.round, today, seed, params);
    const r = playMatch({ seed, id: o.id, home: ec, away: ef, ...inputFlags(o), ...carryFor(repo, o) }, 1, { id: o.id, competition: o.competition, season, round: o.round, date: today }, params);
    others.push({ id: o.id, home: { id: o.home, name: names.get(o.home) ?? o.home }, away: { id: o.away, name: names.get(o.away) ?? o.away }, duration: r.report.duration, goals: r.report.goals.map((x) => ({ minute: x.minute, side: x.side })), homeGoals: r.report.homeGoals, awayGoals: r.report.awayGoals, ...(r.report.extraTime ? { extraTime: true } : {}), ...(r.report.shootout ? { shootout: { home: r.report.shootout.home, away: r.report.shootout.away } } : {}) });
  }
  const table = g.knockout ? [] : beforeTable(repo, g.competition, season, names);
  const shown = [g.home, g.away, ...table.map((l) => l.club), ...others.flatMap((o) => [o.home.id, o.away.id])];
  const flags = flagsOf(g);
  const s: SavedSession = {
    match: g.id, competition: g.competition, round: g.round, season, date: today, side, input: { seed, id: g.id, home, away, ...inputFlags(g), ...carryFor(repo, g) }, changes: [], minute: 0, ...(Object.keys(flags).length > 0 ? { flags } : {}),
    table, others, winPoints: params.standings.winPoints, drawPoints: params.standings.drawPoints, colours: coloursOf(data, shown), tiers: tiersOf(data, shown), zones: zonesOf(data, params, gamerClub, europeSlots(repo, data, params, season)),
    ...matchContext(repo, data, params, g.home, g.away, g.competition, g.id, flags),
  };
  save(repo, s);
  return view(repo, s, params, names);
}

/** O jogo a decorrer, se houver, no minuto em que está. */
export function currentSession(repo: Repository, base: BaseData, params: Params): LiveMatch | null {
  const s = readSession(repo);
  return s ? view(repo, s, params, namesOf(seasonData(repo, base))) : null;
}

/** Avança `minutos` minutos (a partir de agora, com a tática em vigor). No apito final regista o jogo. */
export function sessionStep(repo: Repository, base: BaseData, params: Params, minutes: number): LiveMatch {
  const s = readSession(repo);
  if (!s) throw new Error("Não há jogo a decorrer");
  const data = seasonData(repo, base);
  // o prolongamento só existe depois de simular os 90': a duração vê-se no minuto de destino, não no atual
  const target = s.minute + Math.max(0, Math.floor(minutes));
  const { sim, events } = replay(s, params, target);
  let fresh = { ...s, minute: Math.min(sim.duration, target) };
  // uma lesão na equipa do gamer pára o jogo, para ele decidir a substituição (se ainda puder fazê-la)
  const injury = events.find((e) => e.type === "injury" && e.side === s.side && e.minute > s.minute);
  if (injury && sim.pendingInjuries(s.side).length > 0 && (sim.team(s.side).bench ?? []).length > 0) {
    const stop = replay(s, params, injury.minute);
    const used = stop.events.filter((e) => e.type === "substitution" && e.side === s.side).length;
    if (used < params.match.substitutions.max && !stop.sim.finished) {
      fresh = { ...s, minute: injury.minute };
      save(repo, fresh);
      return view(repo, fresh, params, namesOf(data));
    }
  }
  if (sim.finished) return finish(repo, data, params, fresh);
  save(repo, fresh);
  return view(repo, fresh, params, namesOf(data));
}

/** Muda a tática do gamer a partir do minuto seguinte. */
export function changeSessionTactic(repo: Repository, base: BaseData, params: Params, tactic: Tactic): LiveMatch {
  const s = readSession(repo);
  if (!s) throw new Error("Não há jogo a decorrer");
  validateTactic(tactic);
  const current = [...s.changes].reverse()[0]?.tactic ?? (s.side === "home" ? s.input.home.tactic : s.input.away.tactic);
  if (current && current.formation !== tactic.formation) throw new Error("A formação não muda a meio do jogo");
  const fresh = { ...s, changes: [...s.changes, { minute: s.minute, tactic }] };
  save(repo, fresh);
  return view(repo, fresh, params, namesOf(seasonData(repo, base)));
}

/**
 * Substituições do gamer (RZ-215), todas as que confirma de uma vez. Fora do intervalo gastam uma pausa (3 por jogo), seja
 * qual for o número de trocas; ao intervalo não gastam pausas. No total, no máximo 5 (as lesões também contam).
 */
export function substituteSession(repo: Repository, base: BaseData, params: Params, substitutions: readonly { playerOut: string; playerIn: string }[], positions: readonly { player: string; position: Position }[] = []): LiveMatch {
  const s = readSession(repo);
  if (!s) throw new Error("Não há jogo a decorrer");
  if (substitutions.length === 0 && positions.length === 0) throw new Error("Escolhe pelo menos uma substituição ou uma mudança de posição");
  const { sim, events } = replay(s, params);
  if (sim.finished || s.minute < 1) throw new Error("Só se fazem substituições com o jogo a decorrer");
  const cfg = params.match.substitutions;
  const used = events.filter((e) => e.type === "substitution" && e.side === s.side).length;
  if (substitutions.length > 0 && used >= cfg.max) throw new Error("Já não tens substituições");
  if (used + substitutions.length > cfg.max) throw new Error(`Só tens mais ${cfg.max - used} substituições`);
  // substituir só lesionados é uma paragem forçada: não gasta pausas
  const pendingInjury = new Set(sim.pendingInjuries(s.side));
  const forced = substitutions.every((t) => pendingInjury.has(t.playerOut));
  const halfTime = s.minute === halfTimeMinute(params) || forced;
  const usedPauses = new Set((s.substitutions ?? []).map((t) => t.pause).filter((p) => p > 0)).size;
  if (!halfTime && usedPauses >= cfg.pauses) throw new Error("Já não tens pausas para substituições");
  const eq = sim.team(s.side);
  const playerOut = new Set<string>();
  const playerIn = new Set<string>();
  for (const t of substitutions) {
    if (!eq.lineup.some((j) => j.id === t.playerOut) && !pendingInjury.has(t.playerOut)) throw new Error("O jogador que sai não está em campo");
    if (!(eq.bench ?? []).some((j) => j.id === t.playerIn)) throw new Error("O jogador que entra não está no banco");
    if (playerOut.has(t.playerOut) || playerIn.has(t.playerIn)) throw new Error("Jogador repetido nas substituições");
    playerOut.add(t.playerOut);
    playerIn.add(t.playerIn);
  }
  const pause = halfTime ? 0 : Math.max(0, ...(s.substitutions ?? []).map((t) => t.pause)) + 1;
  const fresh: SavedSession = {
    ...s,
    ...(substitutions.length > 0 ? { substitutions: [...(s.substitutions ?? []), ...substitutions.map((t) => ({ minute: s.minute, playerOut: t.playerOut, playerIn: t.playerIn, pause }))] } : {}),
    ...(positions.length > 0 ? { repositions: [...(s.repositions ?? []), { minute: s.minute, moves: positions.map((x) => ({ player: x.player, position: x.position })) }] } : {}),
  };
  // valida já (a repetição lança se algum jogador não estiver em campo)
  replay(fresh, params);
  save(repo, fresh);
  return view(repo, fresh, params, namesOf(seasonData(repo, base)));
}

/** Apito final: regista o jogo, as lesões e as histórias (é aqui que nascem as notícias e as mensagens) e guarda a repetição. */
function finish(repo: Repository, data: BaseData, params: Params, s: SavedSession): LiveMatch {
  const names = namesOf(data);
  const personName = (id: string) => repo.publicPerson(id)?.sportingName ?? id;
  const { sim, events } = replay(s, params, 10_000);
  const summary = sim.summary();
  const r = resolveMatch(s.input, events, summary, 0, { id: s.match, competition: s.competition, season: s.season, round: s.round, date: s.date }, params);
  if (r.level !== 0) throw new Error("nível inesperado");
  return repo.transaction(() => {
    const gamer = repo.meta("gamer.club");
    const rival = gamer ? rivalReason(repo, data, params, s.competition, s.season, gamer, s.input.home.club === gamer ? s.input.away.club : s.input.home.club) : undefined;
    const ticket = matchTicket(data, params, s.input.home.club, s.input.away.club, s.competition, s.flags ?? {});
    const { event } = repo.recordMatch({ ...r.record.match, referee: matchReferee(s.input.seed, s.match), ...(ticket ? { attendance: ticket.attendance, revenue: ticket.revenue } : {}) }, r.record.facts, r.record.appearances);
    if (ticket) postTicketing(repo, ticket);
    if (rival) repo.appendEvent(rivalEvent(s.match, s.input.home.club, s.input.away.club, s.date, s.season, s.round, event, rival));
    for (const l of r.record.injuries) repo.appendEvent({ ...l, cause: event });
    for (const h of r.stories) repo.appendEvent({ ...h, cause: event });
    const match: LiveMatch = {
      id: s.match, competition: s.competition, round: s.round, date: s.date,
      home: { id: s.input.home.club, name: names.get(s.input.home.club) ?? s.input.home.club },
      away: { id: s.input.away.club, name: names.get(s.input.away.club) ?? s.input.away.club },
      duration: r.report.duration, homeGoals: r.report.homeGoals, awayGoals: r.report.awayGoals,
      lines: matchLines(r.events, r.report.duration, personName), table: s.table, winPoints: s.winPoints, drawPoints: s.drawPoints, others: s.others,
      colours: s.colours, ...(s.tiers ? { tiers: s.tiers } : {}), ...(s.zones ? { zones: s.zones } : {}), summary, teams: matchTeams(s.input, r.events, r.report, personName), xg: xgCurve(r.events, r.report.duration), ...(s.meetings ? { meetings: s.meetings } : {}), ...(s.info ? { info: s.info } : {}), gamerSide: s.side,
    };
    saveLiveMatch(repo, match);
    repo.setMeta(SESSION_KEY, "");
    return match;
  });
}
