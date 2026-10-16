import { setBudget, clubBudget } from "../clube/orcamento";
import { financialState, monthlyWageBill, clubBalance } from "../clube/financas";
import { createDate } from "../calendario/datas";
import { DEFAULT_PARAMETERS, type Params } from "../config/parametros";
import { SCHEMA_VERSION as DB_SCHEMA } from "../persistencia/esquema";
import type { Repository } from "../persistencia/repositorio";
import { importData } from "../dados/importar";
import type { BaseClub, BaseData, SourcesCsv } from "../dados/tipos";
import { generateWorld } from "../mundo/gerarMundo";
import { importCountries, type Country } from "../mundo/paises";
import { validateWorld } from "../mundo/validar";
import { worldCompetitions, labMatch, labLeague } from "../laboratorio/laboratorio";
import { inbox, markInboxRead, markMessage, news } from "../noticias/noticias";
import { clubSeason } from "../competicao/clubeEpoca";
import { readLiveMatch } from "../epoca/jogoAoVivo";
import { startSession, changeSessionTactic, sessionStep, currentSession, substituteSession } from "../epoca/sessaoJogo";
import { isInSecondDistrict } from "../epoca/distritais";
import { acceptOffer, resign, isUnemployed, gamerOffers } from "../epoca/mercadoTreinadores";
import { advance, timeState } from "../epoca/avancar";
import { saveParameters, seasonYearContaining, saveInitialYear, seasonName } from "../epoca/anoDoSave";
import { seasonData, pyramidData, currentSeason, divisionsHistory } from "../epoca/piramideEpoca";
import { planView } from "../epoca/vistaDoPlano";
import { confirmMatch, savePlan } from "../epoca/planoDeJogo";
import { cityProfile } from "../cidade/ficha";
import { competitionPage } from "../competicao/ficha";
import { reputationLevel } from "../clube/reputacao";
import { generalLevel } from "../mundo/nivel";
import { KEY } from "../mundo/jogador";
import type { Attribute, Position } from "../mundo/tipos";
import { View } from "../vista/vista";
import { buildIndex, find, type InputIndex, type Indexed } from "../pesquisa/pesquisar";
import type { EstimatedLevel, PersonTruth, SummaryClub, DbDiagnostics, ClubProfileData, ClubFinances, LocalityProfileData, PersonProfileData, EntityRef, LocalityStatus, Message, EngineRequests, WorldProgress, CreatedWorldSummary, RequestType } from "./contratos";

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
      r.appendEvent({ type: "DIAGNOSTICO", date: new Date().toISOString().slice(0, 10), season: 0, visibility: "privado", entities: [], data: {} });
      const output: DbDiagnostics = {
        backend: a.backend,
        persistent: a.backend === "opfs",
        ...(a.memoryReason !== undefined ? { memoryReason: a.memoryReason } : {}),
        sqlite: a.sqliteVersion,
        schema: r.schemaVersion,
        openings: r.count("DIAGNOSTICO"),
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
      const level = playerLevel(repository, m.input.id, profile.exposed.player?.position, profile.attributes?.fields, m.input.seeAll === true);
      if (level) output.level = level;
      if (m.input.seeAll) output.truth = personTruth(repository, m.input.id);
      const club = profile.exposed.club ? data.clubs.find((c) => c.id === profile.exposed.club) : undefined;
      if (club) output.club = { k: "club", id: club.id, name: club.name };
      const city = profile.exposed.naturalDe ? data.cities.find((c) => c.id === profile.exposed.naturalDe) : undefined;
      if (city) output.naturalDe = { k: "city", id: city.id, name: city.name };
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
        locality: { k: "locality", id: c.localityId, name: c.locality, status: locality?.status ?? data.localities.find((x) => x.id === c.localityId)?.status ?? "vila" },
        city: { k: "city", id: c.city, name: city?.name ?? c.city },
        district: c.district, colours: c.colours, nickname: c.nickname, mascot: c.mascot, reputation: c.reputation,
        ...(rival ? { rival: { k: "club", id: rival.id, name: rival.name } as EntityRef } : {}),
        stadium: { name: c.stadium.name, capacity: c.stadium.capacity },
        squad: view.squad(c.id),
        roles: view.roles({ club: c.id }),
        tier: c.tier,
        levelReputation: reputationLevel(c.reputation, params),
        finances: clubFinances(repository, data, params, c, repository.meta("clube.gamer") === c.id || seeAll),
        detailStadium: { ownership: c.stadium.ownership, zone: c.stadium.location.zone, centreDistanceKm: c.stadium.location.centreDistanceKm, transport: c.stadium.location.transport, roadAccess: c.stadium.location.roadAccess, parking: c.stadium.location.parking, expansionTerrain: c.stadium.location.expansionTerrain },
        divisionsHistory: divisionsHistory(repository, base, c.id).map((h) => ({ ...h, label: seasonName(h.season, params.calendar.initialYear) })),
        extraSquad: {},
        ...(clubSeason(repository, data, params, c.id) ? { season: clubSeason(repository, data, params, c.id) as NonNullable<ReturnType<typeof clubSeason>> } : {}),
      };
      for (const j of output.squad) {
        const ct = repository.contract(j.id);
        const fields = seeAll ? undefined : view.profile(j.id)?.attributes?.fields;
        const level = playerLevel(repository, j.id, j.player?.position, fields, seeAll);
        output.extraSquad[j.id] = { ...(ct ? { endContract: ct.end } : {}), ...(level ? { level } : {}) };
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
        .eventsOf({ k: "locality", id: base.id }, { publicOnly: true, type: "LOCALIDADE_ESTATUTO" })
        .map((e) => ({ date: e.date, de: e.data.de as LocalityStatus, para: e.data.para as LocalityStatus, population: Number(e.data.populacao) }));
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
      const id = repository.meta("clube.gamer");
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
    case "offers": {
      const { repository, data, params } = await context(servicos);
      const unemployed = isUnemployed(repository);
      const name = (id: string) => data.clubs.find((c) => c.id === id)?.name;
      const previous = repository.meta("gamer.anterior");
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
      const current = repository.meta("clube.gamer");
      if (current && current !== m.input.id && m.input.force !== true) throw new Error("O clube do save já foi escolhido: só muda se fores despedido ou te despedires");
      repository.setMeta("clube.gamer", m.input.id);
      return { id: m.input.id };
    }
    case "plan": {
      const { repository, data, params } = await context(servicos);
      const club = repository.meta("clube.gamer");
      return club ? planView(repository, data, params, club) : null;
    }
    case "savePlan": {
      const { repository, data, params } = await context(servicos);
      const club = repository.meta("clube.gamer");
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
      const club = repository.meta("clube.gamer");
      if (!club) throw new Error("Escolhe um clube primeiro");
      return startSession(repository, data, params, club, m.input.match);
    }
    case "matchStep": {
      const { repository, data, params } = await context(servicos);
      return sessionStep(repository, data, params, m.input.minutes);
    }
    case "setBudget": {
      const { repository, data, params } = await context(servicos);
      const id = repository.meta("clube.gamer");
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
      return advance(repository, data, params, m.input.mode, m.input.club ?? repository.meta("clube.gamer"));
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
    repository.setMeta("ano.inicial", String(year));
    repository.setMeta("mundo.jogadores", String(batch.players.length));
    saveStartLocalities(repository, data, year);
    repository.saveWorld(batch, (done, total) => onProgress({ phase: "save", done, total }));
  });
  return { seed, clubs: data.clubs.length, people: batch.people.length, players: batch.players.length, ms: Date.now() - t0, warnings: v.warnings, alreadyExisted: false };
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
  if (r.localities().length === 0) saveStartLocalities(r, data, Number(r.meta("ano.inicial") ?? DEFAULT_PARAMETERS.calendar.initialYear));
}

function existingSummary(r: Repository, data: BaseData): CreatedWorldSummary {
  return { seed: r.meta("seed") ?? "?", clubs: data.clubs.length, people: r.peopleTotal(), players: Number(r.meta("mundo.jogadores") ?? 0), ms: 0, warnings: [], alreadyExisted: true };
}

/**
 * A Vista de quem joga. Enquanto não há escolha de clube (RZ-134/RZ-120), o observador é o clube
 * guardado em `clube.gamer` ou ninguém: só factos públicos.
 */
function gamerView(r: Repository, observer?: string): View {
  const club = observer ?? r.meta("clube.gamer") ?? "";
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
  const last = repository.last("FECHO_FINANCEIRO", { k: "club", id: c.id });
  return {
    state: e.state, exact: true, balance: clubBalance(repository, c),
    budget: (() => {
      const o = clubBudget(repository, c, params, Number(repository.meta("season") ?? 1));
      const currentBill = monthlyWageBill(repository, c.id) * 12;
      return { wageBillMax: o.wageBillMax, transfers: o.transfers, currentBill, above: currentBill > o.wageBillMax };
    })(),
    ...(last ? { lastClose: { date: last.date, revenues: Number(last.data.receitas), expenses: Number(last.data.despesas), byCategory: last.data.mes as Record<string, number> } } : {}),
  };
}
