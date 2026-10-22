/** Ficha pública de uma cidade (RZ-133): converte o estado verdadeiro em níveis em palavras e tendências. */
import type { CityCompaniesView, CityProfileData, ViewCityLevel, ViewCouncil } from "../api/contracts";
import type { Params } from "../config/parameters";
import type { BaseData } from "../data/types";
import { seasonName } from "../calendar/seasonName";
import type { Repository } from "../persistence/repository";
import type { View } from "../view/view";
import { cityHistoryWithPast } from "./cities";
import { CITY_SERVICES, type CityEventType } from "../config/parameters";
import { INDICATORS, levelOf, serviceTrendOf } from "./state";
import { agendaOf, mayorOf, priorityLevel } from "../council/agenda";
import { cityJobs, localJobsOf } from "../company/employment";
import { candidateInfo, electionOf, termsOf } from "../council/elections";
import { costOf, kindStatus, requestsOf } from "../council/requests";
import { relationOf } from "../council/relation";
import { COUNCIL_AREAS, COUNCIL_REQUESTS } from "../config/parameters";
import type { IsoDate } from "../persistence/types";

/** Atitude da Câmara perante o desporto (1-10 nos dados) em cinco níveis. */
const supportLevel = (v: number): ViewCityLevel => (v <= 2 ? 1 : v <= 4 ? 2 : v <= 6 ? 3 : v <= 8 ? 4 : 5);

/** Quintil do valor entre todos (1 = os 20 % mais baixos). */
const quintile = (value: number, all: readonly number[]): ViewCityLevel => {
  const below = all.filter((x) => x < value).length;
  return (Math.min(4, Math.floor((below / Math.max(1, all.length)) * 5)) + 1) as ViewCityLevel;
};

export function cityProfile(repo: Repository, data: BaseData, base: BaseData, params: Params, view: View, id: string): CityProfileData | null {
  const c = base.cities.find((x) => x.id === id);
  if (!c) return null;
  const history = cityHistoryWithPast(repo, base, params, id);
  const now = history[history.length - 1]!;
  const before = history[history.length - 2];
  const label = (season: number) => seasonName(season, params.calendar.initialYear);

  const perCapita = (x: { municipalBudget: number; population: number }) => x.municipalBudget / Math.max(1, x.population);
  const mayorInfo = mayorOf(repo, base, id);
  const mayor = mayorInfo ? view.person(mayorInfo.person) : undefined;
  const { vanity, ambition } = mayorInfo?.traits ?? c.mayor.traits;
  const profile: NonNullable<CityProfileData["mayor"]>["profile"] = [];
  if (vanity >= 15) profile.push("vain"); else if (vanity <= 6) profile.push("lowProfile");
  if (ambition >= 15) profile.push("ambitious");
  // o mandato em curso começou nas últimas autárquicas já contadas (RZ-236B)
  const election = electionOf(repo);
  const since = !election ? params.city.sinceTerm : election.stage === "done" ? election.year : election.year - params.city.yearsMunicipalElections;

  const recent = repo
    .eventsOf({ k: "city", id }, { type: "CITY_EVENT", publicOnly: true, limit: 10 })
    .map((e) => ({ type: String(e.data.event) as CityEventType, season: e.season }));
  const companies = companiesView(repo, base, params, id);
  const council = councilView(repo, base, params, id, now.state, before?.state);
  return {
    id: c.id, name: c.name, district: c.district, hub: c.hub, island: c.island, sector: c.sector, secondarySector: c.tag2,
    population: now.state.population,
    historyPopulation: history.map((h) => ({ season: h.season, label: label(h.season), population: h.state.population })),
    indicators: INDICATORS.map((i) => ({
      id: i,
      level: levelOf(now.state[i], params),
      trend: serviceTrendOf(before?.state[i], now.state[i], params),
      history: history.map((h) => ({ season: h.season, label: label(h.season), level: levelOf(h.state[i], params) })),
    })),
    services: CITY_SERVICES.map((id) => {
      // causa: o acontecimento mais recente (últimas duas épocas) que mexeu neste serviço
      const cause = recent.find((a) => (params.city.events.types[a.type]?.effects[id] ?? 0) !== 0 && a.season >= now.season - 2);
      return {
        id,
        level: levelOf(now.state[id], params),
        trend: serviceTrendOf(before?.state[id], now.state[id], params),
        history: history.map((h) => ({ season: h.season, label: label(h.season), level: levelOf(h.state[id], params) })),
        ...(cause ? { cause: { type: cause.type, label: label(cause.season) } } : {}),
      };
    }),
    budget: quintile(perCapita({ municipalBudget: c.municipalBudget, population: now.state.population }), base.cities.map(perCapita)),
    ...(mayor
      ? { mayor: { person: { k: "person" as const, id: mayor.id, name: mayor.sportingName }, sinceTerm: since, untilTerm: since + params.city.yearsMunicipalElections, sportSupport: supportLevel(mayorInfo?.sportSupport ?? c.mayor.sportSupport), profile } }
      : {}),
    ...(council ? { council } : {}),
    ...(companies ? { companies } : {}),
    localities: base.localities
      .filter((l) => l.city === id)
      .map((l) => {
        const record = repo.locality(l.id);
        return { ref: { k: "locality" as const, id: l.id, name: l.name }, status: record?.status ?? l.status, population: record?.population ?? l.population };
      }),
    clubs: data.clubs
      .filter((x) => x.city === id)
      .map((x) => ({ ref: { k: "club" as const, id: x.id, name: x.name }, league: x.league, tier: x.tier, stadium: { name: x.stadium.name, capacity: x.stadium.capacity, ownership: x.stadium.ownership } })),
    incidents: repo
      .eventsOf({ k: "city", id }, { type: "CITY_EVENT", publicOnly: true, limit: 10 })
      .map((e) => ({ date: e.date, season: e.season, label: label(e.season), type: String(e.data.event), regional: e.data.regional === true, ...(typeof e.data.hub === "string" ? { hub: e.data.hub } : {}) })),
  };
}

/** Orçamento da Câmara em palavras (RZ-236) e, na cidade do clube do gamer, relação e pedidos. */
function councilView(repo: Repository, base: BaseData, params: Params, city: string, now: Parameters<typeof agendaOf>[2], before: Parameters<typeof agendaOf>[2]): ViewCouncil | undefined {
  const mayor = mayorOf(repo, base, city);
  if (!mayor) return undefined;
  const seed = repo.meta("seed") ?? "?";
  const a = agendaOf(seed, mayor, now, params);
  // autarca novo (eleições, RZ-236B): a seta compara com o anterior e a causa é a mudança de autarca
  const terms = termsOf(repo, base, params, city);
  const last = terms.at(-1);
  const prev = terms.at(-2);
  const fresh = !!last && !!prev && last.person === mayor.person && last.from >= Number(repo.meta("season") ?? 1) - 1;
  const b = fresh && prev ? agendaOf(seed, candidateInfo(repo, { p: prev.person, k: "exMayor", s: 5 }), now, params) : before ? agendaOf(seed, mayor, before, params) : undefined;
  const [weak, strong] = params.city.council.shareTrend;
  const areas = COUNCIL_AREAS.map((id) => {
    const d = b ? a.ratio[id] - b.ratio[id] : 0;
    const trend = d >= strong ? "up2" : d >= weak ? "up1" : d <= -strong ? "down2" : d <= -weak ? "down1" : "stable";
    return { id, priority: priorityLevel(a.ratio[id], params) as ViewCityLevel, trend: trend as ViewCouncil["areas"][number]["trend"], ...(trend !== "stable" ? { cause: (fresh ? "newMayor" : "need") as "need" | "newMayor" } : {}) };
  });
  const club = base.clubs.find((x) => x.id === repo.meta("gamer.club"));
  if (!club || club.city !== city) return { areas };
  const rel = relationOf(repo, params, mayor.person);
  const today = (repo.meta("date.today") ?? "") as IsoDate;
  const cfg = params.city.council.requests;
  const requests = requestsOf(repo).filter((r) => r.club === club.id).sort((x, y) => y.id - x.id).slice(0, 8);
  return {
    areas,
    relation: { level: rel.level as ViewCityLevel, trend: rel.trend, ...(rel.cause ? { cause: rel.cause } : {}) },
    own: {
      kinds: COUNCIL_REQUESTS.map((kind) => {
        const st = kindStatus(repo, params, club, kind, today);
        return { kind, area: cfg.areas[kind], status: st.status, ...(st.until ? { until: st.until } : {}), cost: costOf(base, params, club, kind), cofunds: kind === "subsidy" ? [0] : cfg.cofunds };
      }),
      requests: requests.map((r) => ({ id: r.id, kind: r.kind, created: r.created, due: r.due, status: r.status, cofund: r.cofund, ...(r.outcome ? { reply: { approved: r.status === "approved", reason: r.outcome.reason, tone: r.outcome.tone, amount: r.outcome.amount } } : {}) })),
    },
  };
}

/** Tamanho em palavras pelos empregos locais: 1 = muito pequena … 5 = muito grande. */
const sizeOf = (jobs: number): ViewCityLevel => (jobs < 10 ? 1 : jobs < 30 ? 2 : jobs < 100 ? 3 : jobs < 300 ? 4 : 5);

function companiesView(repo: Repository, base: BaseData, params: Params, city: string): CityCompaniesView | undefined {
  if (repo.meta("companies.enabled") !== "1") return undefined;
  const clubName = (id: string) => base.clubs.find((c) => c.id === id)?.name ?? id;
  const list = repo.companies({ city, state: "active" }).sort((a, b) => localJobsOf(b, params) - localJobsOf(a, params) || (a.id < b.id ? -1 : 1));
  return {
    dependence: cityJobs(repo, params, city).dependence,
    list: list.map((c) => ({
      id: c.id, name: c.name, sector: c.sector, scale: c.scale, size: sizeOf(localJobsOf(c, params)),
      ...(c.owner ? { owner: { k: "person" as const, id: c.owner, name: repo.publicPerson(c.owner)?.sportingName ?? c.owner } } : {}),
      sponsors: [...new Set(repo.companySponsorships(c.id, (repo.meta("date.today") ?? undefined) as IsoDate | undefined).map((s) => s.club))].map((id) => ({ k: "club" as const, id, name: clubName(id) })),
    })),
  };
}
