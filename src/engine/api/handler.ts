import { setBudget, clubBudget } from "../club/budget";
import { financialState, monthlyWageBill, clubBalance } from "../club/finances";
import { ageAt, createDate } from "../calendar/dates";
import { decisionOf, expiringPlayers, negotiateRenewal, negotiationOf, renewalAsk, renewalSuggestions, setDecision } from "../squad/renewals";
import { DEFAULT_PARAMETERS, type Params, type Tier } from "../config/parameters";
import { SCHEMA_VERSION as DB_SCHEMA } from "../persistence/schema";
import type { Repository } from "../persistence/repository";
import { importData } from "../data/importData";
import type { BaseClub, BaseData, SourcesCsv } from "../data/types";
import { generateWorld } from "../world/generateWorld";
import { importCountries, type Country } from "../world/countries";
import { validateWorld } from "../world/validate";
import { worldCompetitions, labMatch, labLeague } from "../lab/lab";
import { inbox, markInboxRead, markMessage, news } from "../news/news";
import { clubSeason } from "../competition/clubSeason";
import { readLiveMatch } from "../season/liveMatch";
import { startSession, changeSessionTactic, sessionStep, currentSession, substituteSession } from "../season/matchSession";
import { isInSecondDistrict } from "../season/districts";
import { acceptOffer, resign, isUnemployed, gamerOffers } from "../season/coachMarket";
import { advance, timeState } from "../season/advance";
import { saveParameters, seasonYearContaining, saveInitialYear, seasonName } from "../season/saveYear";
import { seasonData, pyramidData, currentSeason, divisionsHistory } from "../season/seasonPyramid";
import { planView } from "../season/planView";
import { confirmMatch, savePlan } from "../season/gamePlan";
import { INJURY_EVENT } from "../injuries/state";
import { cityProfile } from "../city/profile";
import { competitionPage } from "../competition/profile";
import { reputationLevel } from "../club/reputation";
import { generalLevel } from "../world/level";
import { KEY } from "../world/player";
import type { Attribute, Position } from "../world/types";
import { View } from "../view/view";
import { buildIndex, find, type InputIndex, type Indexed } from "../search/search";
import { Rng } from "../random/rng";
import { startCompanies } from "../company/cycle";
import { assignAgents } from "../agent/assign";
import { potentialRange, referenceTier, starsOf } from "../world/stars";
import type { CareerLine, RenewalLine, RenewalsData, StarRating, EstimatedLevel, PersonTruth, SummaryClub, DbDiagnostics, ClubProfileData, ClubFinances, LocalityProfileData, PersonProfileData, EntityRef, LocalityStatus, Message, EngineRequests, WorldProgress, CreatedWorldSummary, RequestType } from "./contracts";

export const ENGINE_VERSION = "0.1.0";
export const SCHEMA_VERSION = DB_SCHEMA;

/** O que o motor precisa do exterior. O worker fornece o SQLite do browser; os testes, memória. */
export type Servicos = {
  /** Texto dos CSV de `data/` (o worker vai buscá-los a /dados/; os testes lêem do disco). */
  loadData(): Promise<SourcesCsv & { countries: string }>;
  openRepository(): Promise<{
    repository: Repository;
    backend: DbDiagnostics["backend"];
    sqliteVersion: string;
    memoryReason?: string;
  }>;
  /** A data real de agora; define a época 1 do save (RZ-160). Por omissão o relógio do sistema. */
  now?(): Date;
};

/** Trata um pedido. Sem DOM nem worker, para ser testada diretamente. */
export async function handle<K extends RequestType>(m: Message<K>, servicos: Servicos, onProgress?: (p: WorldProgress) => void): Promise<EngineRequests[K]["output"]>;
export async function handle(m: Message, servicos: Servicos, onProgress: (p: WorldProgress) => void = () => undefined): Promise<unknown> {
  switch (m.type) {
    case "ping":
      return { echo: m.input.echo, clockMs: Date.now() };
    case "version":
      return { engine: ENGINE_VERSION, schema: SCHEMA_VERSION };
    case "parameters":
      return DEFAULT_PARAMETERS;
    case "db": {
      const a = await servicos.openRepository();
      const r = a.repository;
      r.appendEvent({ type: "DIAGNOSTIC", date: new Date().toISOString().slice(0, 10), season: 0, visibility: "private", entities: [], data: {} });
      const output: DbDiagnostics = {
        backend: a.backend,
        persistent: a.backend === "opfs",
        ...(a.memoryReason !== undefined ? { memoryReason: a.memoryReason } : {}),
        sqlite: a.sqliteVersion,
        schema: r.schemaVersion,
        openings: r.count("DIAGNOSTIC"),
        events: r.eventsTotal(),
      };
      return output;
    }
    case "clubs": {
      const { data } = await context(servicos);
      return data.clubs.map((c): SummaryClub => ({ id: c.id, name: c.name, league: c.league, colours: c.colours }));
    }
    case "worldState": {
      const { repository, data } = await context(servicos);
      if (repository.peopleTotal() === 0) return null;
      completeLocalities(repository, data);
      return existingSummary(repository, data);
    }
    case "createWorld":
      return createWorld(m.input.seed, servicos, onProgress);
    case "restartWorld": {
      const { repository } = await servicos.openRepository();
      repository.restart();
      indices.delete(repository);
      return createWorld(m.input.seed, servicos, onProgress);
    }
    case "countries":
      return (await matchData(servicos)).countries.map((p) => ({ id: p.id, name: p.name }));
    case "find": {
      const { repository, data: current } = await context(servicos);
      return find(m.input.q, searchIndex(repository, current), m.input.limit ?? 12);
    }
    case "personProfile": {
      const { repository, data, params } = await context(servicos);
      const profile = gamerView(repository).profile(m.input.id);
      if (!profile) return null;
      const view = gamerView(repository);
      const output: PersonProfileData = { profile, stats: view.playerStats(m.input.id), initialYear: params.calendar.initialYear };
      const contract = repository.contract(m.input.id);
      if (contract) output.contract = { start: contract.start, end: contract.end };
      const career = personCareer(repository, data, m.input.id);
      if (career.length > 0) output.career = career;
      const agentId = repository.player(m.input.id)?.agent;
      const agentName = agentId ? repository.person(agentId)?.sportingName : undefined;
      if (agentId && agentName) output.agent = { k: "person", id: agentId, name: agentName };
      if (contract?.clauses && (m.input.seeAll === true || (profile.exposed.club !== undefined && repository.meta("gamer.club") === profile.exposed.club))) {
        const resaleClub = contract.clauses.resale ? data.clubs.find((c) => c.id === contract.clauses?.resale?.club) : undefined;
        output.clauses = {
          ...(contract.clauses.release !== undefined ? { release: contract.clauses.release } : {}),
          ...(contract.clauses.resale && resaleClub ? { resale: { club: { k: "club", id: resaleClub.id, name: resaleClub.name }, pct: contract.clauses.resale.pct } } : {}),
        };
      }
      const level = playerLevel(repository, m.input.id, profile.exposed.player?.position, profile.attributes?.fields, m.input.seeAll === true);
      if (level) output.level = level;
      const ratingClub = profile.exposed.club ? data.clubs.find((c) => c.id === profile.exposed.club) : undefined;
      const rating = playerRating(repository, m.input.id, level, profile.potential?.fields.potential, ratingClub?.tier, params, m.input.seeAll === true);
      if (rating) output.rating = rating;
      if (m.input.seeAll) output.truth = personTruth(repository, m.input.id);
      const club = profile.exposed.club ? data.clubs.find((c) => c.id === profile.exposed.club) : undefined;
      if (club) output.club = { k: "club", id: club.id, name: club.name };
      const city = profile.exposed.birthCity ? data.cities.find((c) => c.id === profile.exposed.birthCity) : undefined;
      if (city) output.birthCity = { k: "city", id: city.id, name: city.name };
      return output;
    }
    case "clubProfile": {
      const { repository, data, base, params } = await context(servicos);
      const c = data.clubs.find((x) => x.id === m.input.id);
      if (!c) return null;
      const seeAll = m.input.seeAll === true;
      const view = gamerView(repository);
      const city = data.cities.find((x) => x.id === c.city);
      const rival = data.clubs.find((x) => x.id === c.rival);
      const locality = repository.locality(c.localityId);
      const output: ClubProfileData = {
        id: c.id, name: c.name, league: c.league,
        locality: { k: "locality", id: c.localityId, name: c.locality, status: locality?.status ?? data.localities.find((x) => x.id === c.localityId)?.status ?? "town" },
        city: { k: "city", id: c.city, name: city?.name ?? c.city },
        district: c.district, colours: c.colours, nickname: c.nickname, mascot: c.mascot, reputation: c.reputation,
        ...(rival ? { rival: { k: "club", id: rival.id, name: rival.name } as EntityRef } : {}),
        stadium: { name: c.stadium.name, capacity: c.stadium.capacity },
        squad: view.squad(c.id),
        roles: view.roles({ club: c.id }),
        tier: c.tier,
        levelReputation: reputationLevel(c.reputation, params),
        finances: clubFinances(repository, data, params, c, repository.meta("gamer.club") === c.id || seeAll),
        detailStadium: { ownership: c.stadium.ownership, zone: c.stadium.location.zone, centreDistanceKm: c.stadium.location.centreDistanceKm, transport: c.stadium.location.transport, roadAccess: c.stadium.location.roadAccess, parking: c.stadium.location.parking, expansionTerrain: c.stadium.location.expansionTerrain },
        divisionsHistory: divisionsHistory(repository, base, c.id).map((h) => ({ ...h, label: seasonName(h.season, params.calendar.initialYear) })),
        sponsors: repository.clubSponsorships(c.id, repository.meta("date.today") ?? undefined).flatMap((x) => {
          const company = repository.company(x.company);
          return company ? [{ company: company.id, name: company.name, sector: company.sector, kind: x.kind, ...(repository.meta("gamer.club") === c.id || seeAll ? { annualValue: x.annualValue } : {}) }] : [];
        }),
        extraSquad: {},
        ...(clubSeason(repository, data, params, c.id) ? { season: clubSeason(repository, data, params, c.id) as NonNullable<ReturnType<typeof clubSeason>> } : {}),
      };
      const today = repository.meta("date.today") ?? undefined;
      const injured = new Set<string>();
      for (const e of repository.eventsOf({ k: "club", id: c.id }, { type: INJURY_EVENT })) {
        const until = (e.data as { until?: string }).until;
        const who = e.entities.find((x) => x.k === "person" && x.roleKind === "injured");
        if (who && until && today && e.date <= today && until > today) injured.add(who.id);
      }
      const ownClub = repository.meta("gamer.club") === c.id || seeAll;
      const expiring = new Set(repository.meta("gamer.club") === c.id ? expiringPlayers(repository, c.id, createDate(params.calendar.initialYear + Number(repository.meta("season") ?? 1), params.calendar.seasonStartMonth, 1)) : []);
      for (const j of output.squad) {
        const ct = repository.contract(j.id);
        const fields = seeAll ? undefined : view.profile(j.id)?.attributes?.fields;
        const level = playerLevel(repository, j.id, j.player?.position, fields, seeAll);
        const rating = playerRating(repository, j.id, level, view.profile(j.id)?.potential?.fields.potential, c.tier, params, seeAll);
        output.extraSquad[j.id] = { ...(ct ? { endContract: ct.end } : {}), ...(level ? { level } : {}), ...(rating ? { rating } : {}), ...(injured.has(j.id) ? { injured: true } : {}), ...(expiring.has(j.id) ? { renewable: true } : {}), ...(ownClub && ct ? { wage: ct.monthlyWage } : {}) };
      }
      if (seeAll) {
        const levels = output.squad.map((j) => output.extraSquad[j.id]?.level?.value).filter((v): v is number => v !== undefined);
        output.truth = {
          reputation: c.reputation,
          finances: clubBalance(repository, c),
          staffQuality: Object.fromEntries(output.roles.flatMap((p) => { const q = repository.role(p.id)?.quality; return q ? [[p.id, q]] : []; })),
          squadLevel: levels.length ? Math.round((levels.reduce((s, v) => s + v, 0) / levels.length) * 10) / 10 : 0,
        };
      }
      return output;
    }
    case "localityProfile": {
      const { repository, data, params } = await context(servicos);
      const base = data.localities.find((x) => x.id === m.input.id);
      if (!base) return null;
      // antes de haver mundo mostra-se o estado de arranque
      const current = repository.locality(m.input.id) ?? { population: base.population, status: base.status, since: createDate(params.calendar.initialYear, 7, 1) };
      const city = data.cities.find((x) => x.id === base.city);
      const history = repository
        .eventsOf({ k: "locality", id: base.id }, { publicOnly: true, type: "LOCALITY_STATUS" })
        .map((e) => ({ date: e.date, from: e.data.from as LocalityStatus, to: e.data.to as LocalityStatus, population: Number(e.data.population) }));
      const output: LocalityProfileData = {
        id: base.id, name: base.name, status: current.status, population: current.population, since: current.since, host: base.host,
        city: { k: "city", id: base.city, name: city?.name ?? base.city }, district: base.district,
        clubs: base.clubs.flatMap((id) => {
          const c = data.clubs.find((x) => x.id === id);
          return c ? [{ k: "club" as const, id: c.id, name: c.name, league: c.league }] : [];
        }),
        history,
      };
      return output;
    }
    case "cityProfile": {
      const { repository, data, base, params } = await context(servicos);
      return cityProfile(repository, data, base, params, gamerView(repository), m.input.id);
    }
    case "competitions":
      return worldCompetitions((await context(servicos)).data);
    case "competitionPage": {
      const { repository, data, base, params } = await context(servicos);
      const current = currentSeason(repository);
      const season = m.input.season ?? current;
      if (season < 1 || season > current) return null;
      return competitionPage(repository, season === current ? data : pyramidData(repository, base, season), params, m.input.league, season) ?? null;
    }
    case "matchLab": {
      const { repository, data, params } = await context(servicos);
      return labMatch(repository, data, params, m.input);
    }
    case "leagueLab": {
      const { repository, data, params } = await context(servicos);
      return labLeague(repository, data, params, m.input);
    }
    case "gamerClub": {
      const { repository } = await servicos.openRepository();
      const id = repository.meta("gamer.club");
      return id ? { id } : null;
    }
    case "liveMatch": {
      const { repository } = await context(servicos);
      const { data, params } = await context(servicos);
      // um jogo a decorrer tem prioridade (sem id, ou com o id desse jogo)
      const ongoing = currentSession(repository, data, params);
      if (ongoing && (!m.input.id || m.input.id === ongoing.id)) return ongoing;
      return readLiveMatch(repository, m.input.id);
    }
    case "news": {
      const { repository, data } = await context(servicos);
      return news(repository, data, m.input);
    }
    case "inbox": {
      const { repository, data } = await context(servicos);
      return inbox(repository, data, m.input);
    }
    case "markInboxRead": {
      const { repository } = await context(servicos);
      markInboxRead(repository);
      return null;
    }
    case "markMessage": {
      const { repository } = await context(servicos);
      markMessage(repository, m.input.id, m.input.isRead);
      return null;
    }
    case "resign": {
      const { repository, data, params } = await context(servicos);
      return resign(repository, data, params);
    }
    case "renewals": {
      const { repository, data, params } = await context(servicos);
      return renewalsOf(repository, data, params);
    }
    case "negotiateRenewal": {
      const { repository, data, params } = await context(servicos);
      const club = gamerClubOf(repository, data);
      const season = Number(repository.meta("season") ?? 1);
      if (!club || !renewalsOf(repository, data, params).lines.some((l) => l.id === m.input.person)) throw new Error("O jogador não tem contrato a expirar no teu clube.");
      const r = negotiateRenewal(repository, data, params, club, season, m.input.person, { wage: m.input.wage, years: m.input.years, release: m.input.release });
      if (!r) throw new Error("Jogador sem contrato.");
      if (r.status === "accepted") setDecision(repository, season, m.input.person, { kind: "renew", ...r.terms });
      return r;
    }
    case "releaseExpiring": {
      const { repository, data, params } = await context(servicos);
      if (!renewalsOf(repository, data, params).lines.some((l) => l.id === m.input.person)) throw new Error("O jogador não tem contrato a expirar no teu clube.");
      setDecision(repository, Number(repository.meta("season") ?? 1), m.input.person, { kind: "release" });
      return null;
    }
    case "offers": {
      const { repository, data, params } = await context(servicos);
      const unemployed = isUnemployed(repository);
      const name = (id: string) => data.clubs.find((c) => c.id === id)?.name;
      const previous = repository.meta("gamer.previous");
      return {
        unemployed,
        ...(previous ? { previous: name(previous) ?? previous } : {}),
        offers: unemployed ? gamerOffers(repository).flatMap((o) => {
          const c = data.clubs.find((x) => x.id === o.club);
          return c ? [{ id: c.id, name: c.name, league: c.league, tier: c.tier, levelReputation: reputationLevel(c.reputation, params), since: o.since }] : [];
        }) : [],
      };
    }
    case "acceptOffer": {
      const { repository } = await context(servicos);
      acceptOffer(repository, m.input.id);
      return { id: m.input.id };
    }
    case "chooseClub": {
      const { repository, data } = await context(servicos);
      if (isUnemployed(repository) && m.input.force !== true) throw new Error("Sem clube: escolhe uma das ofertas recebidas");
      const chosen = data.clubs.find((c) => c.id === m.input.id);
      if (!chosen) throw new Error("Clube desconhecido");
      if (isInSecondDistrict(chosen.league)) throw new Error("Esse clube está na segunda distrital: só é jogável quando voltar à pirâmide");
      const current = repository.meta("gamer.club");
      if (current && current !== m.input.id && m.input.force !== true) throw new Error("O clube do save já foi escolhido: só muda se fores despedido ou te despedires");
      repository.setMeta("gamer.club", m.input.id);
      return { id: m.input.id };
    }
    case "plan": {
      const { repository, data, params } = await context(servicos);
      const club = repository.meta("gamer.club");
      return club ? planView(repository, data, params, club) : null;
    }
    case "savePlan": {
      const { repository, data, params } = await context(servicos);
      const club = repository.meta("gamer.club");
      if (!club) throw new Error("Ainda não escolheste o clube");
      savePlan(repository, club, { tactic: m.input.tactic, ...(m.input.lineup ? { lineup: m.input.lineup } : {}) });
      return planView(repository, data, params, club) as NonNullable<ReturnType<typeof planView>>;
    }
    case "confirmMatch": {
      const { repository } = await servicos.openRepository();
      confirmMatch(repository, m.input.match);
      return { match: m.input.match };
    }
    case "startMatch": {
      const { repository, data, params } = await context(servicos);
      const club = repository.meta("gamer.club");
      if (!club) throw new Error("Escolhe um clube primeiro");
      return startSession(repository, data, params, club, m.input.match);
    }
    case "matchStep": {
      const { repository, data, params } = await context(servicos);
      return sessionStep(repository, data, params, m.input.minutes);
    }
    case "setBudget": {
      const { repository, data, params } = await context(servicos);
      const id = repository.meta("gamer.club");
      const c = data.clubs.find((x) => x.id === id);
      if (!c) throw new Error("Sem clube");
      setBudget(repository, c, params, Number(repository.meta("season") ?? 1), m.input);
      return clubFinances(repository, data, params, c, true);
    }
    case "tacticInMatch": {
      const { repository, data, params } = await context(servicos);
      return changeSessionTactic(repository, data, params, m.input.tactic);
    }
    case "substitutionsInMatch": {
      const { repository, data, params } = await context(servicos);
      return substituteSession(repository, data, params, m.input.substitutions);
    }
    case "timeState": {
      const { repository, data, params } = await context(servicos);
      return timeState(repository, data, params);
    }
    case "advance": {
      const { repository, data, params } = await context(servicos);
      return advance(repository, data, params, m.input.mode, m.input.club ?? repository.meta("gamer.club"));
    }
    case "squad": {
      const { repository } = await servicos.openRepository();
      const club = m.input.club;
      return gamerView(repository, club).squad(club);
    }
  }
}

/** Nível geral do jogador: exato com «ver tudo»; senão estimado a partir dos atributos que se conhecem (e só se se conhecem todos os da posição). */
function playerLevel(r: Repository, id: string, position: string | undefined, fields: Record<string, { value: number; margin: number }> | undefined, seeAll: boolean): EstimatedLevel | undefined {
  if (!position || !(position in KEY)) return undefined;
  const pos = position as Position;
  if (seeAll) {
    const at = r.player(id)?.attributes;
    const v = at ? generalLevel((a) => at[a], pos) : undefined;
    return v === undefined ? undefined : { value: v, margin: 0, exact: true };
  }
  if (!fields) return undefined;
  const v = generalLevel((a: Attribute) => fields[a]?.value, pos);
  if (v === undefined) return undefined;
  const margins = KEY[pos].map((a) => fields[a]?.margin ?? 0);
  return { value: v, margin: Math.round((margins.reduce((s, x) => s + x, 0) / margins.length) * 10) / 10, exact: false };
}

/** Estrelas do jogador (RZ-916): qualidade relativa ao escalão; potencial como intervalo (estimado com margem, ou exato com «ver tudo»). */
function playerRating(r: Repository, id: string, level: EstimatedLevel | undefined, potential: { value: number; margin: number } | undefined, clubTier: Tier | undefined, params: Params, seeAll: boolean): StarRating | undefined {
  if (!level) return undefined;
  const tier = referenceTier(clubTier, params);
  const rating: StarRating = { stars: starsOf(level.value, tier, params) };
  const truth = seeAll ? r.player(id)?.potential : undefined;
  if (truth !== undefined) rating.potential = potentialRange(truth, truth, level.value, tier, params);
  else if (potential) rating.potential = potentialRange(potential.value - potential.margin, potential.value + potential.margin, level.value, tier, params);
  return rating;
}

function gamerClubOf(r: Repository, data: BaseData): BaseClub | undefined {
  const id = r.meta("gamer.club");
  return id ? data.clubs.find((c) => c.id === id) : undefined;
}

/** Contratos a expirar no clube do gamer, com pedido e decisão (RZ-165). */
function renewalsOf(r: Repository, data: BaseData, params: Params): RenewalsData {
  const season = Number(r.meta("season") ?? 1);
  const nextSeasonStart = createDate(params.calendar.initialYear + season, params.calendar.seasonStartMonth, 1);
  const club = gamerClubOf(r, data);
  if (!club) return { season, nextSeasonStart, lines: [] };
  const today = r.meta("date.today") ?? nextSeasonStart;
  const lines: RenewalLine[] = [];
  for (const id of expiringPlayers(r, club.id, nextSeasonStart)) {
    const person = r.person(id);
    const player = r.player(id);
    const ct = r.contract(id);
    const ask = renewalAsk(r, data, params, club, id);
    if (!person || !player || !ct || !ask) continue;
    const decision = decisionOf(r, season, id);
    const stored = negotiationOf(r, season, id);
    // passado o mês de espera, a negociação volta a estar aberta (recomeça na próxima proposta)
    const neg = stored.closed && stored.reopens && today >= stored.reopens ? { round: 0 } : stored;
    const agent = player.agent ? r.person(player.agent)?.sportingName : undefined;
    lines.push({ id, name: person.sportingName, position: player.positions[0]?.pos ?? "", age: ageAt(person.birth, today), endContract: ct.end, currentWage: ct.monthlyWage, ...(ct.clauses?.release !== undefined ? { currentRelease: ct.clauses.release } : {}), ask: { wage: ask.wage, years: ask.years, release: ask.release }, suggestions: renewalSuggestions(ask, ct.monthlyWage), ...(agent ? { agent } : {}), ...(decision ? { decision } : {}), ...(neg.round > 0 || neg.closed ? { negotiation: { round: neg.round, roundsLeft: Math.max(0, params.squadCycle.contracts.negotiation.maxRounds - neg.round), ...(neg.closed ? { closed: neg.closed } : {}), ...(neg.reopens ? { reopens: neg.reopens } : {}) } } : {}) });
  }
  return { season, nextSeasonStart, lines: lines.sort((a, b) => b.currentWage - a.currentWage) };
}

const CAREER_KIND: Record<string, CareerLine["kind"]> = { TRANSFER: "transfer", PLAYER_SIGNED: "signed", CONTRACT_RENEWED: "renewed", CONTRACT_EXPIRED: "released", PLAYER_RETIRED: "retired" };

/** Percurso de um jogador a partir dos eventos expostos de contratos e transferências (mais antigo primeiro). */
function personCareer(r: Repository, data: BaseData, person: string): CareerLine[] {
  const ref = (id: string | undefined): EntityRef | undefined => {
    const c = id ? data.clubs.find((x) => x.id === id) : undefined;
    return c ? { k: "club", id: c.id, name: c.name } : undefined;
  };
  return r.eventsOf({ k: "person", id: person })
    .filter((e) => e.type in CAREER_KIND && e.visibility === "exposed")
    .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)
    .map((e): CareerLine => {
      const kind = CAREER_KIND[e.type] as CareerLine["kind"];
      const clubs = e.entities.filter((x) => x.k === "club");
      const buyer = clubs.find((x) => x.roleKind === "buyer")?.id;
      const seller = clubs.find((x) => x.roleKind === "seller")?.id;
      const main = ref(kind === "transfer" ? buyer : clubs.find((x) => !x.roleKind)?.id ?? clubs[0]?.id);
      const from = kind === "transfer" ? ref(seller) : undefined;
      const fee = kind === "transfer" ? (e.data as { fee?: number }).fee : undefined;
      return { id: e.id, date: e.date, season: e.season, kind, ...(main ? { club: main } : {}), ...(from ? { from } : {}), ...(fee !== undefined ? { fee } : {}) };
    });
}

function personTruth(r: Repository, id: string): PersonTruth | undefined {
  const p = r.person(id);
  if (!p) return undefined;
  const j = r.player(id);
  const ct = r.contract(id);
  const cg = r.role(id);
  return {
    personality: p.personality, archetype: p.archetype, lod: p.lod,
    ...(j ? { attributes: j.attributes, potential: j.potential, positions: j.positions } : {}),
    ...(ct ? { monthlyWage: ct.monthlyWage } : {}),
    ...(cg?.quality ? { quality: cg.quality } : {}),
  };
}

/** Repositório + dados com a liga atual de cada clube (RZ-159); `base` são os dados de arranque. */
async function context(servicos: Servicos): Promise<{ repository: Repository; data: BaseData; base: BaseData; countries: Country[]; params: Params }> {
  const [{ repository }, match] = await Promise.all([servicos.openRepository(), matchData(servicos)]);
  return { repository, data: seasonData(repository, match.data), base: match.data, countries: match.countries, params: saveParameters(repository, DEFAULT_PARAMETERS) };
}

type MatchData = { data: BaseData; countries: Country[] };
const cache = new WeakMap<Servicos, Promise<MatchData>>();

/** Lê e valida os CSV uma vez por conjunto de serviços. */
function matchData(servicos: Servicos): Promise<MatchData> {
  let p = cache.get(servicos);
  if (!p) {
    p = servicos.loadData().then((f) => {
      const d = importData(f);
      if (!d.ok) throw new Error("Dados inválidos:\n" + d.errors.join("\n"));
      const pa = importCountries(f.countries);
      if (!pa.ok) throw new Error("Países inválidos:\n" + pa.errors.join("\n"));
      return { data: d.data, countries: pa.countries };
    });
    cache.set(servicos, p);
    p.catch(() => cache.delete(servicos));
  }
  return p;
}

async function createWorld(seed: string, servicos: Servicos, onProgress: (p: WorldProgress) => void): Promise<CreatedWorldSummary> {
  const [{ repository }, { data, countries }] = await Promise.all([servicos.openRepository(), matchData(servicos)]);
  if (repository.peopleTotal() > 0) {
    // reabrir um save que já tem mundo: não se gera outra vez
    completeLocalities(repository, data);
    return existingSummary(repository, data);
  }
  const t0 = Date.now();
  const now = servicos.now?.() ?? new Date();
  const year = seasonYearContaining(now.getFullYear(), now.getMonth() + 1, DEFAULT_PARAMETERS);
  const params: Params = { ...DEFAULT_PARAMETERS, calendar: { ...DEFAULT_PARAMETERS.calendar, initialYear: year } };
  const batch = generateWorld({ seed, data, countries, params, onProgress: (phase, done, total) => onProgress({ phase, done, total }) });
  onProgress({ phase: "validate", done: 0, total: 1 });
  const v = validateWorld(batch, data, countries, params);
  if (v.errors.length > 0) throw new Error("Mundo gerado inválido:\n" + v.errors.slice(0, 10).join("\n"));
  repository.transaction(() => {
    repository.setMeta("seed", seed);
    repository.setMeta("start.year", String(year));
    repository.setMeta("world.players", String(batch.players.length));
    saveStartLocalities(repository, data, year);
    repository.saveWorld(batch, (done, total) => onProgress({ phase: "save", done, total }));
    onProgress({ phase: "companies", done: 0, total: 1 });
    startCompanies(repository, data, params, { seasonStart: createDate(year, params.calendar.seasonStartMonth, 1), year, tiers: new Map(data.clubs.map((c) => [c.id, c.tier] as const)) });
    assignAgents(repository, new Rng(seed, "agents/start"), params, (club) => data.clubs.find((c) => c.id === club)?.tier);
  });
  return { seed, clubs: data.clubs.length, people: repository.peopleTotal(), players: batch.players.length, ms: Date.now() - t0, warnings: v.warnings, alreadyExisted: false };
}

function saveStartLocalities(r: Repository, data: BaseData, year: number): void {
  r.saveLocalities(
    data.localities.map((l) => ({
      id: l.id, name: l.name, city: l.city, population: l.population, status: l.status,
      since: createDate(year, 7, 1),
    })),
  );
}

/** Saves criados antes da migração 4 não têm localidades: preenche-as com o estado de arranque (idempotente). */
function completeLocalities(r: Repository, data: BaseData): void {
  if (r.localities().length === 0) saveStartLocalities(r, data, Number(r.meta("start.year") ?? DEFAULT_PARAMETERS.calendar.initialYear));
}

function existingSummary(r: Repository, data: BaseData): CreatedWorldSummary {
  return { seed: r.meta("seed") ?? "?", clubs: data.clubs.length, people: r.peopleTotal(), players: Number(r.meta("world.players") ?? 0), ms: 0, warnings: [], alreadyExisted: true };
}

/**
 * A Vista de quem joga. Enquanto não há escolha de clube (RZ-134/RZ-120), o observador é o clube
 * guardado em `clube.gamer` ou ninguém: só factos públicos.
 */
function gamerView(r: Repository, observer?: string): View {
  const club = observer ?? r.meta("gamer.club") ?? "";
  const today = createDate(saveInitialYear(r, DEFAULT_PARAMETERS), 7, 1);
  return new View(r, { observer: club, participants: new Set(club ? [`clube:${club}`] : []), date: today, season: 1 }, DEFAULT_PARAMETERS.knowledge);
}

const indices = new WeakMap<Repository, { people: number; index: Indexed[] }>();

/** Índice de pesquisa (clubes, cidades, pessoas); refaz-se só se o nº de pessoas mudar. */
function searchIndex(r: Repository, data: BaseData): Indexed[] {
  const total = r.peopleTotal();
  const saved = indices.get(r);
  if (saved && saved.people === total) return saved.index;
  const clubName = new Map(data.clubs.map((c) => [c.id, c.name] as const));
  const inputs: InputIndex[] = [
    ...data.clubs.map((c): InputIndex => ({ k: "club", id: c.id, title: c.name, subtitle: c.league, extra: `${c.locality} ${c.nickname}` })),
    ...data.cities.map((c): InputIndex => ({ k: "city", id: c.id, title: c.name, subtitle: c.district })),
    ...data.localities.filter((l) => !l.host).map((l): InputIndex => ({ k: "locality", id: l.id, title: l.name, subtitle: `${l.status} · ${data.cities.find((c) => c.id === l.city)?.name ?? ""}` })),
    ...r.peopleIndex().map((p): InputIndex => ({
      k: "person", id: p.id, title: p.sportingName,
      subtitle: [p.position ?? p.fn, p.club ? clubName.get(p.club) : undefined].filter(Boolean).join(" · "),
      extra: p.name,
    })),
  ];
  const index = buildIndex(inputs);
  indices.set(r, { people: total, index });
  return index;
}

/** Estado das finanças de um clube; o próprio clube (ou o modo developer) vê também o saldo exato e o último fecho mensal. */
function clubFinances(repository: Repository, data: BaseData, params: Params, c: BaseClub, own: boolean): ClubFinances {
  const e = financialState(repository, data, params, c, { own, season: Number(repository.meta("season") ?? 1), seed: repository.meta("seed") ?? "?" });
  if (!own) return { state: e.state, exact: false };
  const last = repository.last("FINANCIAL_CLOSE", { k: "club", id: c.id });
  return {
    state: e.state, exact: true, balance: clubBalance(repository, c),
    budget: (() => {
      const o = clubBudget(repository, c, params, Number(repository.meta("season") ?? 1));
      const currentBill = monthlyWageBill(repository, c.id) * 12;
      return { wageBillMax: o.wageBillMax, transfers: o.transfers, currentBill, above: currentBill > o.wageBillMax };
    })(),
    ...(last ? { lastClose: { date: last.date, revenues: Number(last.data.revenues), expenses: Number(last.data.expenses), byCategory: last.data.month as Record<string, number> } } : {}),
  };
}
