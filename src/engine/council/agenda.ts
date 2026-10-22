/**
 * Orçamento da Câmara por áreas (RZ-236, docs/CITY.md §12.6): quanto cada autarca valoriza cada área. Puro e sem estado guardado:
 * a prioridade vem dos traços do autarca, do apoio ao desporto e da necessidade (o serviço que está pior pesa mais).
 */
import { Rng } from "../random/rng";
import { COUNCIL_AREAS, type CouncilArea, type CityService, type Params } from "../config/parameters";
import type { BaseData } from "../data/types";
import type { Repository } from "../persistence/repository";
import type { CityState } from "../city/state";

export type Traits = { ambition: number; vanity: number; patience: number; integrity: number };
export type MayorInfo = { person: string; traits: Traits; sportSupport: number };
export type Agenda = {
  /** Fatia do orçamento de cada área (soma 1). */
  share: Record<CouncilArea, number>;
  /** Fatia ÷ fatia neutra (1/7): 1 = prioridade média. */
  ratio: Record<CouncilArea, number>;
};

/** O serviço que cada área financia (o desporto não tem serviço). */
export const AREA_SERVICE: Partial<Record<CouncilArea, CityService>> = { health: "health", education: "education", mobility: "mobility", housing: "housing", safety: "safety", leisure: "entertainment" };

const KEY = (city: string) => `council.mayor.${city}`;

/** O autarca de uma cidade: quem tem o cargo e as suas inclinações (o registo guardado de eleições, se existir, manda sobre os dados de base). */
export function mayorOf(repo: Repository, data: BaseData, cityId: string): MayorInfo | undefined {
  const city = data.cities.find((c) => c.id === cityId);
  if (!city) return undefined;
  const stored = repo.meta(KEY(cityId));
  const override = stored ? (JSON.parse(stored) as { person: string; sportSupport: number }) : undefined;
  const person = override?.person ?? repo.publicRoles({ city: cityId }).find((p) => p.fn === "mayor")?.id;
  if (!person) return undefined;
  const pers = repo.person(person)?.personality;
  const t = city.mayor.traits;
  return {
    person,
    traits: { ambition: pers?.ambition ?? t.ambition, vanity: pers?.vanity ?? t.vanity, patience: pers?.patience ?? t.patience, integrity: pers?.integrity ?? t.integrity },
    sportSupport: override?.sportSupport ?? city.mayor.sportSupport,
  };
}

/** Pesos do autarca por área: um valor estável da pessoa (`profile`) e o da necessidade do momento (`need`). */
function weights(seed: string, mayor: MayorInfo, state: Pick<CityState, CityService> | undefined, params: Pick<Params, "city">): Record<CouncilArea, { profile: number; need: number }> {
  const c = params.city.council;
  const rng = new Rng(seed, `council/${mayor.person}`);
  return Object.fromEntries(
    COUNCIL_AREAS.map((a) => {
      const l = c.loadings[a];
      const t = mayor.traits;
      let profile = 1 + l.ambition * (t.ambition - 10) / 10 + l.vanity * (t.vanity - 10) / 10 + l.patience * (t.patience - 10) / 10 + l.integrity * (t.integrity - 10) / 10;
      if (a === "sport") profile += c.sportSupport * (mayor.sportSupport - 5.5) / 4.5;
      profile += rng.derive(a).gauss(0, c.jitter);
      const service = AREA_SERVICE[a];
      const need = service && state ? (c.moodWeight * (50 - state[service])) / 50 : 0;
      return [a, { profile, need }] as const;
    }),
  ) as Record<CouncilArea, { profile: number; need: number }>;
}

export function agendaOf(seed: string, mayor: MayorInfo, state: Pick<CityState, CityService> | undefined, params: Pick<Params, "city">): Agenda {
  const w = weights(seed, mayor, state, params);
  const total = COUNCIL_AREAS.reduce((s, a) => s + Math.max(0.15, w[a].profile + w[a].need), 0);
  const share = Object.fromEntries(COUNCIL_AREAS.map((a) => [a, Math.max(0.15, w[a].profile + w[a].need) / total])) as Record<CouncilArea, number>;
  const ratio = Object.fromEntries(COUNCIL_AREAS.map((a) => [a, share[a] * COUNCIL_AREAS.length])) as Record<CouncilArea, number>;
  return { share, ratio };
}

/** Nível de prioridade em palavras (1 = muito baixa … 5 = muito alta). */
export function priorityLevel(ratio: number, params: Pick<Params, "city">): 1 | 2 | 3 | 4 | 5 {
  const cuts = params.city.council.levelCuts;
  return (1 + cuts.filter((c) => ratio >= c).length) as 1 | 2 | 3 | 4 | 5;
}

/** O que o orçamento de cada área soma ao alvo do serviço respetivo (pontos): acima da fatia neutra sobe, abaixo desce. */
export function councilServiceOffsets(agenda: Agenda, params: Pick<Params, "city">): Partial<Record<CityService, number>> {
  const out: Partial<Record<CityService, number>> = {};
  for (const a of COUNCIL_AREAS) {
    const s = AREA_SERVICE[a];
    if (s) out[s] = params.city.council.serviceByShare * (agenda.ratio[a] - 1);
  }
  return out;
}
