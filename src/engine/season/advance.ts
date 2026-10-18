/**
 * Avançar no tempo (RZ-119; docs/DESIGN_RULES.md §6b): cada dia joga os jogos marcados nesse dia, com o mesmo motor para
 * todos. O jogo do clube do gamer guarda tudo (nível 0); os outros guardam o resumo público (golos, cartões, lesões, nota
 * do homem do jogo; nível 1, RZ-109). Lesões e suspensões contam: quem está lesionado ou suspenso não entra no onze e as
 * histórias saem dos jogos como em qualquer outro. Puro em relação ao tempo real: a data vive no save (`data.hoje`).
 */
import { completeOrders } from "../scouting/scouting";
import { zoneSizes } from "../competition/profile";
import { weekDay, addDays } from "../calendar/dates";
import type { Params } from "../config/parameters";
import type { BaseClub, BaseData } from "../data/types";
import { matchReferee, matchChannels } from "../match/matchContext";
import { playMatch, matchLevel } from "../match/detail";
import { automaticLineup, type LineupCandidate } from "../match/team";
import { DEFAULT_TACTIC } from "../match/formations";
import { unavailable, confirmedMatch, readPlan, planLineup, type Plan } from "./gamePlan";
import type { MatchTeam, MatchSummary } from "../match/types";
import type { Repository } from "../persistence/repository";
import type { IsoDate } from "../persistence/types";
import { matchAttendance } from "../club/attendance";
import { ensureBudgets } from "../club/budget";
import { closeUntilMonths, post } from "../club/finances";
import { postBroadcast } from "../broadcast/featured";
import { isMarketDay, marketRound } from "../market/market";
import { isInSecondDistrict } from "./districts";
import { CP_FINAL_COMPETITION, generateCpFinal, generateCpFinalSemi } from "./cpFinalPhase";
import { advanceCompetitions } from "./competitions";
import { NATIONAL_STADIUM, venueStadium, type Stadium } from "./venues";
import { closeSeason, generatePromotionPhase, type SeasonSummary } from "./closeSeason";
import { playersForm } from "./fitness";
import { rivalEvent, rivalReason } from "./rivals";
import { SESSION_KEY, xgCurve, matchTeams, saveLiveMatch, matchLines, type LiveMeeting, type XgCurve, type LiveTeams, type MatchInfo, type LiveTableLine } from "./liveMatch";
import { updateOffers, isUnemployed } from "./coachMarket";
import { seasonData, currentSeason } from "./seasonPyramid";
import { promotionGroups, matchesPerPlay, prepareSeason } from "./prepare";

export type DayMatch = {
  id: string;
  competition: string;
  round: number;
  home: string;
  away: string;
  homeName: string;
  awayName: string;
  homeGoals: number;
  awayGoals: number;
  level: 0 | 1;
  goals: { minute: number; player: string; name: string; club: string }[];
  cards: { minute: number; player: string; name: string; club: string; colour: "yellow" | "red" }[];
  injuries: { minute: number; player: string; name: string; club: string; severity: number; days: number }[];
  matchMan?: { player: string; name: string; rating: number };
};

export type SummaryDay = { date: IsoDate; matches: DayMatch[] };

export type TimeState = { today: IsoDate; season: number; /** Jogos por disputar nesta época. */ byPlay: number; /** Próximo dia com jogos. */ matchesNextDay?: IsoDate };

export type Mode = "day" | "week" | "nextMatch";

/** O avanço parou antes do jogo do clube do gamer: falta confirmar onze e tática. */
export type Pause = { /** Já começou (há um jogo a decorrer): continuar em vez de preparar. */ ongoing: boolean; match: string; date: IsoDate; competition: string; round: number; home: string; away: string; homeName: string; awayName: string };

export type AdvanceResult = { from: IsoDate; until: IsoDate; days: SummaryDay[]; seasonEnd: boolean; /** Preenchido quando a época fechou durante este avanço. */ seasonSummary?: SeasonSummary; state: TimeState; pause?: Pause };

const DAYS_MAX = 400;

export function timeState(repo: Repository, base: BaseData, params: Params): TimeState {
  const data = seasonData(repo, base);
  const { today, season } = prepareSeason(repo, data, params);
  const pending = matchesPerPlay(repo, data, season);
  const next = pending.filter((j) => j.date >= today).map((j) => j.date).sort()[0];
  return { today, season, byPlay: pending.length, ...(next ? { matchesNextDay: next } : {}) };
}

/** Os jogadores ativos do clube como candidatos ao onze, já com a forma (cansaço) que têm em `hoje`. */
export function clubCandidates(repo: Repository, club: string, today: IsoDate, params: Params): LineupCandidate[] {
  const active = repo.clubPlayers(club).filter((j) => j.state === "active");
  const form = playersForm(repo, active.map((j) => j.person), today, params);
  return active.map((j) => ({ person: j.person, positions: j.positions, attributes: j.attributes, heightCm: j.heightCm, form: form.get(j.person) ?? 1 }));
}

export function teamForMatch(repo: Repository, club: string, competition: string, season: number, round: number, today: IsoDate, seed: string, params: Params, plan?: Plan): MatchTeam {
  const all = clubCandidates(repo, club, today, params);
  const away = unavailable(repo, club, all.map((c) => c.person), competition, season, round, today, seed, params);
  const tactic = plan?.tactic ?? { ...DEFAULT_TACTIC };
  const lineup = planLineup(plan ?? { tactic }, all, new Set(away.keys()), params);
  const onPitch = new Set(lineup.map((j) => j.id));
  const available = all.filter((c) => !onPitch.has(c.person) && !away.has(c.person));
  const bench = automaticLineup(available.length >= 7 ? available : all.filter((c) => !onPitch.has(c.person)), undefined, params).slice(0, 7);
  return { club, lineup, tactic, bench };
}

/** A tabela de uma competição tal como está agora (antes dos jogos de hoje), com todos os clubes. */
export function beforeTable(repo: Repository, competition: string, season: number, clubName: ReadonlyMap<string, string>): LiveTableLine[] {
  const cal = repo.calendar(competition, season);
  const clubs = [...new Set(cal.matches.flatMap((j) => [j.home, j.away]))];
  const lines = new Map(repo.standings(competition, season).map((l) => [l.club, l] as const));
  return clubs.map((c) => { const l = lines.get(c); return { club: c, name: clubName.get(c) ?? c, matches: l?.matches ?? 0, points: l?.points ?? 0, scoredGoals: l?.scoredGoals ?? 0, concededGoals: l?.concededGoals ?? 0 }; });
}

/** Quantos sobem e descem na competição de um clube (as zonas da tabela). */
export function zonesOf(data: BaseData, params: Params, club: string): { promoted: number; relegated: number } | undefined {
  const tier = data.clubs.find((c) => c.id === club)?.tier;
  if (!tier) return undefined;
  const z = zoneSizes(tier, params);
  return { promoted: z.promoted, relegated: z.relegated };
}

/** Cores (texto dos dados) dos clubes pedidos. */
export function coloursOf(data: { clubs: readonly { id: string; colours: string }[] }, ids: Iterable<string>): Record<string, string> {
  const por = new Map(data.clubs.map((c) => [c.id, c.colours] as const));
  const out: Record<string, string> = {};
  for (const id of ids) { const c = por.get(id); if (c) out[id] = c; }
  return out;
}

/** Marcas de um jogo marcado que mudam como se joga e como se cobra: a eliminar (prolongamento e penáltis) e em campo neutro. */
export type MatchFlags = { knockout?: boolean; neutral?: boolean; venue?: string };
export const flagsOf = (g: MatchFlags): MatchFlags => ({ ...(g.knockout ? { knockout: true } : {}), ...(g.neutral ? { neutral: true } : {}), ...(g.venue ? { venue: g.venue } : {}) });
/** O que entra na simulação do jogo (`MatchInput`) a partir das marcas. */
export const inputFlags = (g: MatchFlags): { knockout?: true; neutral?: true } => ({ ...(g.knockout ? { knockout: true as const } : {}), ...(g.neutral ? { neutral: true as const } : {}) });

/**
 * Assistência e bilheteira do jogo (RZ-114/115). A receita fica com o clube da casa; em campo neutro joga-se no estádio do
 * clube `venue` e a receita reparte-se pelos dois clubes (`shared`).
 */
export function matchTicket(data: BaseData, params: Params, home: string, away: string, competition: string, flags: MatchFlags = {}): { attendance: number; revenue: number; club: BaseClub; /** O estádio onde se joga. */ stadium: Stadium; shared?: [BaseClub, BaseClub] } | undefined {
  const cc = data.clubs.find((x) => x.id === home);
  const cf = data.clubs.find((x) => x.id === away);
  if (!cc || !cf) return undefined;
  const neutral = flags.neutral && flags.venue ? venueStadium(data, params, flags.venue) : undefined;
  const stadium: Stadium = neutral ?? { name: cc.stadium.name, locality: cc.locality, capacity: cc.stadium.capacity };
  const hostCity = flags.neutral && flags.venue && flags.venue !== NATIONAL_STADIUM ? data.clubs.find((x) => x.id === flags.venue)?.city : cc.city;
  const b = matchAttendance({ home: neutral ? { ...cc, stadium: { ...cc.stadium, name: neutral.name, capacity: neutral.capacity } } : cc, away: cf, footballCulture: data.cities.find((x) => x.id === hostCity)?.footballCulture ?? 50, final: competition === CP_FINAL_COMPETITION || !!flags.neutral }, params);
  return { ...b, club: cc, stadium, ...(flags.neutral ? { shared: [cc, cf] as [BaseClub, BaseClub] } : {}) };
}

/** Lança a receita de bilheteira nas tesourarias: tudo ao clube da casa ou, em campo neutro, metade a cada um. */
export function postTicketing(repo: Repository, ticket: NonNullable<ReturnType<typeof matchTicket>>): void {
  if (!ticket.shared) return post(repo, ticket.club, "ticketing", ticket.revenue);
  const half = Math.floor(ticket.revenue / 2);
  post(repo, ticket.shared[0], "ticketing", ticket.revenue - half);
  post(repo, ticket.shared[1], "ticketing", half);
}

/** Os últimos jogos entre os dois clubes e os dados do estádio, para a página do jogo. `excepto` é o próprio jogo. */
export function matchContext(repo: Repository, data: BaseData, params: Params, home: string, away: string, competition: string, except: string, flags: MatchFlags = {}): { info?: MatchInfo; meetings: LiveMeeting[] } {
  const meetings = repo.meetings(home, away, 6).filter((j) => j.id !== except).slice(0, 5)
    .map((j) => ({ id: j.id, date: j.date, competition: j.competition, season: j.season, home: j.home, away: j.away, homeGoals: j.homeGoals, awayGoals: j.awayGoals }));
  const b = matchTicket(data, params, home, away, competition, flags);
  if (!b) return { meetings };
  const e = b.stadium;
  const seed = repo.meta("seed") ?? "?";
  return { meetings, info: { stadium: { name: e.name, locality: e.locality, capacity: e.capacity }, attendance: b.attendance, referee: matchReferee(seed, except), channels: matchChannels(b.club.tier, competition, seed, except) } };
}

/** Joga os jogos de `hoje` e passa ao dia seguinte. Tudo numa transação. */
export function advanceDay(repo: Repository, base: BaseData, params: Params, gamerClub?: string): SummaryDay {
  const data = seasonData(repo, base);
  const { today, season } = prepareSeason(repo, data, params);
  const seed = repo.meta("seed") ?? "?";
  const clubName = new Map(data.clubs.map((c) => [c.id, c.name] as const));
  const personName = (id: string) => repo.publicPerson(id)?.sportingName ?? id;
  return repo.transaction(() => {
    ensureBudgets(repo, data, params, season);
    const matches: DayMatch[] = [];
    // a tabela de cada competição onde o gamer joga hoje, antes dos jogos (para o ver ao vivo)
    const tables = new Map<string, LiveTableLine[]>();
    for (const g of repo.dayMatches(today)) {
      if (repo.match(g.id) || g.knockout || matchLevel(g.home, g.away, gamerClub) !== 0 || tables.has(g.competition)) continue;
      tables.set(g.competition, beforeTable(repo, g.competition, season, clubName));
    }
    const live: { id: string; competition: string; round: number; home: string; away: string; duration: number; homeGoals: number; awayGoals: number; lines: ReturnType<typeof matchLines>; summary: MatchSummary; teams: LiveTeams; xg: XgCurve }[] = [];
    const durations = new Map<string, number>();
    for (const g of repo.dayMatches(today)) {
      if (repo.match(g.id)) continue;
      const level = matchLevel(g.home, g.away, gamerClub);
      const home = teamForMatch(repo, g.home, g.competition, season, g.round, today, seed, params, g.home === gamerClub ? readPlan(repo, g.home) : undefined);
      const away = teamForMatch(repo, g.away, g.competition, season, g.round, today, seed, params, g.away === gamerClub ? readPlan(repo, g.away) : undefined);
      const r = playMatch({ seed, id: g.id, home, away, ...inputFlags(g) }, level, { id: g.id, competition: g.competition, season, round: g.round, date: today }, params);
      const rival = gamerClub && level === 0 ? rivalReason(repo, data, params, g.competition, season, gamerClub, g.home === gamerClub ? g.away : g.home) : undefined;
      const ticket = matchTicket(data, params, g.home, g.away, g.competition, g);
      const { event } = repo.recordMatch({ ...r.record.match, referee: matchReferee(seed, g.id), ...(ticket ? { attendance: ticket.attendance, revenue: ticket.revenue } : {}) }, r.record.facts, r.record.appearances);
      if (ticket) postTicketing(repo, ticket);
      postBroadcast(repo, data, params, season, g);
      if (rival) repo.appendEvent(rivalEvent(g.id, g.home, g.away, today, season, g.round, event, rival));
      for (const l of r.record.injuries) repo.appendEvent({ ...l, cause: event });
      for (const h of r.stories) repo.appendEvent({ ...h, cause: event });
      const report = r.report;
      durations.set(g.id, report.duration);
      if (r.level === 0) live.push({ id: g.id, competition: g.competition, round: g.round, home: g.home, away: g.away, duration: report.duration, homeGoals: report.homeGoals, awayGoals: report.awayGoals, lines: matchLines(r.events, report.duration, personName), summary: r.summary, teams: matchTeams({ home, away }, r.events, r.report, personName), xg: xgCurve(r.events, report.duration) });
      const clubOf = (side: "home" | "away") => (side === "home" ? g.home : g.away);
      const man = r.level === 1 ? { player: r.report.matchMan.id, rating: r.report.matchMan.rating } : (() => { const j = r.report.players.find((x) => x.id === r.report.matchMan); return j ? { player: j.id, rating: j.rating } : undefined; })();
      matches.push({
        id: g.id, competition: g.competition, round: g.round, home: g.home, away: g.away, homeName: clubName.get(g.home) ?? g.home, awayName: clubName.get(g.away) ?? g.away, homeGoals: report.homeGoals, awayGoals: report.awayGoals, level,
        goals: report.goals.map((x) => ({ minute: x.minute, player: x.player, name: personName(x.player), club: clubOf(x.side) })),
        cards: report.cards.map((x) => ({ minute: x.minute, player: x.player, name: personName(x.player), club: clubOf(x.side), colour: x.colour })),
        injuries: report.injuries.map((x) => ({ minute: x.minute, player: x.player, name: personName(x.player), club: clubOf(x.side), severity: x.injury.severity, days: x.injury.days })),
        ...(man ? { matchMan: { ...man, name: personName(man.player) } } : {}),
      });
    }
    // o jogo do gamer fica guardado com os outros jogos da competição e a tabela de antes (RZ-130)
    for (const v of live) {
      const others = matches.filter((j) => j.competition === v.competition && j.id !== v.id).map((j) => ({
        id: j.id, home: { id: j.home, name: j.homeName }, away: { id: j.away, name: j.awayName }, duration: durations.get(j.id) ?? 90,
        goals: j.goals.map((x) => ({ minute: x.minute, side: (x.club === j.home ? "home" : "away") as "home" | "away" })), homeGoals: j.homeGoals, awayGoals: j.awayGoals,
      }));
      saveLiveMatch(repo, { ...v, ...matchContext(repo, data, params, v.home, v.away, v.competition, v.id, flagsOf(repo.dayMatches(today).find((x) => x.id === v.id) ?? {})), date: today, home: { id: v.home, name: clubName.get(v.home) ?? v.home }, away: { id: v.away, name: clubName.get(v.away) ?? v.away }, table: tables.get(v.competition) ?? [], winPoints: params.standings.winPoints, drawPoints: params.standings.drawPoints, others, colours: coloursOf(data, [v.home, v.away, ...(tables.get(v.competition) ?? []).map((l) => l.club)]), gamerSide: v.home === gamerClub ? "home" : "away", zones: zonesOf(data, params, v.home) });
    }
    const tomorrow = addDays(today, 1);
    repo.setMeta("date.today", tomorrow);
    // fecho mensal das finanças (RZ-114): ao passar para o dia 1 de um mês
    if (tomorrow.endsWith("-01")) closeUntilMonths(repo, data, params, tomorrow, season, (c) => !isInSecondDistrict(c.league));
    // mercado de transferências entre clubes da IA nas janelas (RZ-205/213)
    if (isMarketDay(tomorrow, params)) marketRound(repo, data, params, tomorrow, season, gamerClub ? { gamerClub } : {});
    // olheiros do gamer: fecham as observações e pesquisas que chegaram ao fim (RZ-230)
    if (gamerClub) {
      for (const o of completeOrders(repo, data, params, gamerClub, tomorrow, season)) {
        repo.appendEvent({
          type: o.kind === "search" ? "SCOUT_SEARCH" : "SCOUT_REPORT", date: tomorrow, season, visibility: "private", origin: "generated",
          entities: [{ k: "club", id: gamerClub }, ...(o.person ? [{ k: "person" as const, id: o.person, roleKind: "scouted" }] : [])],
          data: o.kind === "search" ? { position: o.position ?? "", n: o.results?.length ?? 0 } : { kind: o.kind },
        });
      }
    }
    // Sem clube, chegam ofertas novas todas as segundas-feiras.
    if (isUnemployed(repo) && weekDay(tomorrow) === 1) updateOffers(repo, data, params, tomorrow);
    return { date: today, matches };
  });
}

/**
 * Avança até um limite e pára: «dia» (1 dia), «semana» (7 dias) ou «proximoJogo» (até ao dia em que o clube do gamer joga,
 * inclusive; sem clube, 7 dias). Pára sempre no fim da época (sem mais jogos marcados).
 */
export function advance(repo: Repository, base: BaseData, params: Params, mode: Mode, gamerClub?: string): AdvanceResult {
  const start = timeState(repo, base, params);
  const days: SummaryDay[] = [];
  const limit = mode === "day" ? 1 : mode === "week" || !gamerClub ? 7 : DAYS_MAX;
  let pause: Pause | undefined;
  let seasonSummary: SeasonSummary | undefined;
  /** Se já não há jogos por jogar: gera a Fase de Promoção ou fecha a época (automático, RZ-159). */
  const seasonStage = (): "free" | "generated" | "closed" => {
    const data = seasonData(repo, base);
    const season = currentSeason(repo);
    const pending = matchesPerPlay(repo, data, season);
    // A Fase de Promoção marca-se assim que acabam as distritais (cedo, para se jogar até maio), com as outras ligas ainda a decorrer.
    const districtLeagues = new Set(data.clubs.filter((c) => c.tier === "district").map((c) => c.league));
    if (!promotionGroups(repo, season) && !pending.some((j) => districtLeagues.has(j.competition))) { generatePromotionPhase(repo, data, params, season); return "generated"; }
    // Fase final do CP (meias-finais e final entre os campeões das séries): marca-se quando as séries acabam e a final quando as meias-finais se jogaram
    if (generateCpFinalSemi(repo, data, params, season) || generateCpFinal(repo, season)) return "generated";
    // Taças: resolvem-se as rondas decididas e marcam-se as seguintes
    if (advanceCompetitions(repo, data, params, season)) return "generated";
    if (pending.length > 0) return "free";
    seasonSummary = closeSeason(repo, data, params, season);
    return "closed";
  };
  while (days.length < limit) {
    const stage = seasonStage();
    if (stage === "closed") break;
    if (stage === "generated") continue;
    const data = seasonData(repo, base);
    const today = repo.meta("date.today") as IsoDate;
    const its = gamerClub ? repo.dayMatches(today).find((g) => (g.home === gamerClub || g.away === gamerClub) && !repo.match(g.id)) : undefined;
    if (its && !confirmedMatch(repo, its.id)) {
      const name = (id: string) => data.clubs.find((c) => c.id === id)?.name ?? id;
      pause = { ongoing: !!repo.meta(SESSION_KEY), match: its.id, date: today, competition: its.competition, round: its.round, home: its.home, away: its.away, homeName: name(its.home), awayName: name(its.away) };
      break;
    }
    // o jogo do gamer pode já ter sido jogado ao vivo (RZ-170): conta na mesma como «dia de jogo»
    const ofTodayGamer = gamerClub ? repo.dayMatches(today).filter((g) => g.home === gamerClub || g.away === gamerClub) : [];
    // se o jogo de hoje já foi jogado antes deste pedido (ao vivo), hoje não conta: o «próximo jogo» é o seguinte
    const alreadyBeforePlayed = days.length === 0 && ofTodayGamer.length > 0 && ofTodayGamer.every((g) => !!repo.match(g.id));
    const d = advanceDay(repo, base, params, gamerClub);
    days.push(d);
    if (mode === "nextMatch" && ofTodayGamer.length > 0 && !alreadyBeforePlayed) break;
  }
  // A época fecha logo depois da última jornada, sem esperar por outro pedido.
  if (!seasonSummary && !pause) for (let i = 0; i < 2 && !seasonSummary; i++) if (seasonStage() !== "generated") break;
  const state = timeState(repo, base, params);
  return { from: start.today, until: state.today, days, seasonEnd: !!seasonSummary, ...(seasonSummary ? { seasonSummary } : {}), state, ...(pause ? { pause } : {}) };
}
