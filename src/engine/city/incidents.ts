/** Acontecimentos anuais que mexem com as cidades (RZ-133): fábricas, fundos, autoestradas, festivais… Puro e determinístico. */
import type { Rng } from "../random/rng";
import { CITY_EVENT_TYPES, type CfgCityEvent, type Params, type CityEventType } from "../config/parameters";
import type { BaseCity } from "../data/types";

export type CityIncident = {
  type: CityEventType;
  regional: boolean;
  /** Só nos regionais. */
  hub?: string;
  /** Concelhos atingidos. */
  cities: string[];
};

/** Peso do acontecimento para uma cidade: setor principal a 100 %, secundário a 50 %. */
function weightFor(cfg: CfgCityEvent, c: Pick<BaseCity, "sector" | "tag2">): number {
  const p = (s: string) => cfg.weight[s] ?? cfg.weight["*"] ?? 0;
  return p(c.sector) + 0.5 * p(c.tag2);
}

export function drawLotsIncidents(cities: readonly BaseCity[], rng: Rng, params: Pick<Params, "city">): CityIncident[] {
  const { cityProb, hubProb, types } = params.city.events;
  const locals = CITY_EVENT_TYPES.filter((t) => !types[t].regional);
  const regional = CITY_EVENT_TYPES.filter((t) => types[t].regional);
  const out: CityIncident[] = [];

  for (const c of [...cities].sort((a, b) => a.id.localeCompare(b.id))) {
    const r = rng.derive(`cidade:${c.id}`);
    if (!r.prob(cityProb)) continue;
    if (!locals.some((t) => weightFor(types[t], c) > 0)) continue;
    out.push({ type: r.weighted(locals, (t) => weightFor(types[t], c)), regional: false, cities: [c.id] });
  }

  const hubs = [...new Set(cities.map((c) => c.hub).filter((p) => p !== ""))].sort();
  for (const hub of hubs) {
    const r = rng.derive(`polo:${hub}`);
    if (!r.prob(hubProb) || regional.length === 0) continue;
    const members = cities.filter((c) => c.hub === hub);
    const mean = (t: CityEventType) => members.reduce((s, c) => s + weightFor(types[t], c), 0) / members.length;
    if (!regional.some((t) => mean(t) > 0)) continue;
    out.push({ type: r.weighted(regional, mean), regional: true, hub, cities: members.map((c) => c.id).sort() });
  }
  return out;
}
