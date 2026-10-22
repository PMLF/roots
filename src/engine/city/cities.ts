/**
 * As cidades no save (RZ-133). Nada se grava à parte: o estado de cada cidade é o seu último evento privado `CIDADE_EPOCA`
 * (os números verdadeiros) e os acontecimentos são eventos públicos `CIDADE_EVENTO` (viram notícia). Antes do primeiro fecho
 * de época o estado é o de arranque, que se reconstrói da seed.
 */
import { Rng } from "../random/rng";
import type { Params } from "../config/parameters";
import type { BaseData } from "../data/types";
import type { Repository } from "../persistence/repository";
import type { IsoDate } from "../persistence/types";
import { drawLotsIncidents } from "./incidents";
import { WITHOUT_RESULTS, evolveCity, type ClubsResults } from "./evolution";
import { CITY_SERVICES, budgetIndexes, cityTargets, sectorEffect, initialState, type CityState } from "./state";
import { cityPreHistory } from "../history/preHistory";

export type CityInstant = { season: number; state: CityState };

const FIELDS: readonly (keyof CityState)[] = ["population", "employment", "economy", "tourism", "pride", "notoriety", "footballCulture", ...CITY_SERVICES];

/** Lê um estado gravado; os campos que faltam (saves anteriores aos serviços) vêm do estado de arranque. */
const readState = (d: Record<string, unknown>, fallback?: () => CityState | undefined): CityState => {
  const start = FIELDS.some((c) => d[c] === undefined) ? fallback?.() : undefined;
  return Object.fromEntries(FIELDS.map((c) => [c, d[c] === undefined && start ? start[c] : Number(d[c])])) as CityState;
};

const budgetCache = new WeakMap<object, Map<string, number>>();
/** Orçamento municipal por habitante (−1…+1) de cada concelho: só depende dos dados, por isso guarda-se. */
export function budgetIndexOf(base: BaseData, city: string): number {
  let m = budgetCache.get(base.cities);
  if (!m) budgetCache.set(base.cities, (m = budgetIndexes(base.cities)));
  return m.get(city) ?? 0;
}

const rngDoSave = (repo: Repository) => new Rng(repo.meta("seed") ?? "?", "city");

/** Estado de arranque (época 1) de uma cidade, reconstruído da seed. */
function startState(repo: Repository, base: BaseData, params: Pick<Params, "city">, city: string): CityState | undefined {
  const c = base.cities.find((x) => x.id === city);
  return c ? initialState(c, base.clubs, rngDoSave(repo).derive(`inicial:${c.id}`), params, budgetIndexOf(base, c.id)) : undefined;
}

/** Estado atual de uma cidade (o do último fecho de época, ou o de arranque na 1.ª época). */
export function cityStateNow(repo: Repository, base: BaseData, params: Pick<Params, "city">, city: string): CityState | undefined {
  const last = repo.eventsOf({ k: "city", id: city }, { type: "CITY_SEASON" })[0];
  return last ? readState(last.data, () => startState(repo, base, params, city)) : startState(repo, base, params, city);
}

/** Estado em cada época (a 1 é o de arranque), do mais antigo para o mais recente. */
export function cityHistory(repo: Repository, base: BaseData, params: Pick<Params, "city">, city: string): CityInstant[] {
  const initial = startState(repo, base, params, city);
  if (!initial) return [];
  const after = repo
    .eventsOf({ k: "city", id: city }, { type: "CITY_SEASON" })
    .reverse()
    .map((e): CityInstant => ({ season: Number(e.data.valid), state: readState(e.data, () => initial) }));
  return [{ season: 1, state: initial }, ...after];
}

/** Como `cityHistory`, mais as épocas anteriores ao arranque (épocas ≤ 0, RZ-265), só para mostrar na ficha. */
export function cityHistoryWithPast(repo: Repository, base: BaseData, params: Params, city: string): CityInstant[] {
  const c = base.cities.find((x) => x.id === city);
  const present = cityHistory(repo, base, params, city);
  if (!c || present.length === 0) return present;
  return [...cityPreHistory(repo.meta("seed") ?? "?", c, present[0]!.state, cityTargets(c, base.clubs, params, budgetIndexOf(base, c.id)), params), ...present];
}

/**
 * Fecha o ano de todas as cidades: sorteia os acontecimentos, evolui cada estado e grava os eventos.
 * `epoca` é a que acabou; os estados novos valem para `epoca + 1`.
 */
export function evolveCities(repo: Repository, base: BaseData, params: Pick<Params, "city">, season: number, today: IsoDate, results: ReadonlyMap<string, ClubsResults>): void {
  const rng = rngDoSave(repo).derive(`e${season}`);
  const incidents = drawLotsIncidents(base.cities, rng.derive("incidents"), params);
  const byCity = new Map<string, typeof incidents>();
  for (const a of incidents) for (const id of a.cities) byCity.set(id, [...(byCity.get(id) ?? []), a]);

  for (const a of incidents) {
    repo.appendEvent({
      type: "CITY_EVENT", date: today, season, visibility: "exposed", origin: "generated",
      entities: a.cities.map((id) => ({ k: "city" as const, id, roleKind: a.regional ? "regiao" : "afetada" })),
      data: { event: a.type, regional: a.regional, ...(a.hub ? { hub: a.hub } : {}) },
    });
  }

  for (const c of base.cities) {
    const history = cityHistory(repo, base, params, c.id);
    const before = history[history.length - 1]!.state;
    const ownSquad = byCity.get(c.id) ?? [];
    const fresh = evolveCity(
      before,
      {
        targets: cityTargets(c, base.clubs, params, budgetIndexOf(base, c.id)),
        driftPopulationPct: sectorEffect(c, "populationPct", params),
        results: results.get(c.id) ?? WITHOUT_RESULTS,
        effects: ownSquad.map((a) => params.city.events.types[a.type].effects),
      },
      rng.derive(`cidade:${c.id}`),
      params,
    );
    repo.appendEvent({
      type: "CITY_SEASON", date: today, season, visibility: "private", origin: "generated",
      entities: [{ k: "city", id: c.id }],
      data: { valid: season + 1, ...fresh, incidents: ownSquad.map((a) => a.type) },
    });
  }
}
