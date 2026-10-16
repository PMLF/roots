/** Ficha pública de uma cidade (RZ-133): converte o estado verdadeiro em níveis em palavras e tendências. */
import type { CityProfileData, ViewCityLevel } from "../api/contratos";
import type { Params } from "../config/parametros";
import type { BaseData } from "../dados/tipos";
import { seasonName } from "../calendario/nomeEpoca";
import type { Repository } from "../persistencia/repositorio";
import type { View } from "../vista/vista";
import { cityHistory } from "./cidades";
import { INDICATORS, levelOf, trendOf } from "./estado";

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
  const history = cityHistory(repo, base, params, id);
  const now = history[history.length - 1]!;
  const before = history[history.length - 2];
  const label = (season: number) => seasonName(season, params.calendar.initialYear);

  const perCapita = (x: { municipalBudget: number; population: number }) => x.municipalBudget / Math.max(1, x.population);
  const mayor = view.roles({ city: id }).find((p) => p.fn === "mayor");
  const { vanity, ambition } = c.mayor.traits;
  const profile: NonNullable<CityProfileData["mayor"]>["profile"] = [];
  if (vanity >= 15) profile.push("vaidoso"); else if (vanity <= 6) profile.push("discreto");
  if (ambition >= 15) profile.push("ambicioso");
  // mandato fixo no MVP: as eleições autárquicas (RZ-308) ainda não mudam o autarca
  const since = params.city.sinceTerm;

  return {
    id: c.id, name: c.name, district: c.district, hub: c.hub, island: c.island, sector: c.sector, secondarySector: c.tag2,
    population: now.state.population,
    historyPopulation: history.map((h) => ({ season: h.season, label: label(h.season), population: h.state.population })),
    indicators: INDICATORS.map((i) => ({
      id: i,
      level: levelOf(now.state[i], params),
      trend: trendOf(before?.state[i], now.state[i], params),
      history: history.map((h) => ({ season: h.season, label: label(h.season), level: levelOf(h.state[i], params) })),
    })),
    budget: quintile(perCapita({ municipalBudget: c.municipalBudget, population: now.state.population }), base.cities.map(perCapita)),
    ...(mayor
      ? { mayor: { person: { k: "person" as const, id: mayor.id, name: mayor.sportingName }, sinceTerm: since, untilTerm: since + params.city.yearsMunicipalElections, sportSupport: supportLevel(c.mayor.sportSupport), profile } }
      : {}),
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
      .eventsOf({ k: "city", id }, { type: "CIDADE_EVENTO", publicOnly: true, limit: 10 })
      .map((e) => ({ date: e.date, season: e.season, label: label(e.season), type: String(e.data.evento), regional: e.data.regional === true, ...(typeof e.data.polo === "string" ? { hub: e.data.polo } : {}) })),
  };
}
