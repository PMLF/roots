/**
 * As cidades no save (RZ-133). Nada se grava à parte: o estado de cada cidade é o seu último evento privado `CIDADE_EPOCA`
 * (os números verdadeiros) e os acontecimentos são eventos públicos `CIDADE_EVENTO` (viram notícia). Antes do primeiro fecho
 * de época o estado é o de arranque, que se reconstrói da seed.
 */
import { Rng } from "../aleatorio/rng";
import type { Params } from "../config/parametros";
import type { BaseData } from "../dados/tipos";
import type { Repository } from "../persistencia/repositorio";
import type { IsoDate } from "../persistencia/tipos";
import { drawLotsIncidents } from "./acontecimentos";
import { WITHOUT_RESULTS, evolveCity, type ClubsResults } from "./evolucao";
import { cityTargets, sectorEffect, initialState, type CityState } from "./estado";

export type CityInstant = { season: number; state: CityState };

const FIELDS: readonly (keyof CityState)[] = ["population", "employment", "economy", "tourism", "pride", "notoriety", "footballCulture"];

const readState = (d: Record<string, unknown>): CityState => Object.fromEntries(FIELDS.map((c) => [c, Number(d[c])])) as CityState;

const rngDoSave = (repo: Repository) => new Rng(repo.meta("seed") ?? "?", "city");

/** Estado de arranque (época 1) de uma cidade, reconstruído da seed. */
export function startState(repo: Repository, base: BaseData, params: Pick<Params, "city">, city: string): CityState | undefined {
  const c = base.cities.find((x) => x.id === city);
  return c ? initialState(c, base.clubs, rngDoSave(repo).derive(`inicial:${c.id}`), params) : undefined;
}

/** Estado em cada época (a 1 é o de arranque), do mais antigo para o mais recente. */
export function cityHistory(repo: Repository, base: BaseData, params: Pick<Params, "city">, city: string): CityInstant[] {
  const initial = startState(repo, base, params, city);
  if (!initial) return [];
  const after = repo
    .eventsOf({ k: "city", id: city }, { type: "CIDADE_EPOCA" })
    .reverse()
    .map((e): CityInstant => ({ season: Number(e.data.valida), state: readState(e.data) }));
  return [{ season: 1, state: initial }, ...after];
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
      type: "CIDADE_EVENTO", date: today, season, visibility: "exposed", origin: "gerado",
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
        targets: cityTargets(c, base.clubs, params),
        driftPopulationPct: sectorEffect(c, "populationPct", params),
        results: results.get(c.id) ?? WITHOUT_RESULTS,
        effects: ownSquad.map((a) => params.city.events.types[a.type].effects),
      },
      rng.derive(`cidade:${c.id}`),
      params,
    );
    repo.appendEvent({
      type: "CIDADE_EPOCA", date: today, season, visibility: "privado", origin: "gerado",
      entities: [{ k: "city", id: c.id }],
      data: { valid: season + 1, ...fresh, incidents: ownSquad.map((a) => a.type) },
    });
  }
}
