/**
 * Catálogo dos clubes para o assistente de nova save (RZ-138). Sai só dos dados de origem (sem mundo): a escolha do clube
 * faz-se antes de a save existir. Tudo em palavras ou categorias; os números ocultos do modelo não saem daqui.
 */
import type { LevelReputation, Params, Tier } from "../config/parameters";
import type { BaseData } from "../data/types";
import { reputationLevel } from "../club/reputation";
import { isInSecondDistrict } from "../season/districts";
import type { Status } from "../locality/status";

/** Dificuldade sugerida: quem parte de baixo (underdog), do meio ou de cima. */
export type Difficulty = "underdog" | "balanced" | "big";

export type CatalogClub = {
  id: string;
  name: string;
  league: string;
  tier: Tier;
  district: { id: string; name: string };
  locality: { name: string; status: Status };
  city: string;
  colours: string;
  levelReputation: LevelReputation;
  /** Bacia de adeptos (população do concelho): 1 pequena, 2 média, 3 grande. */
  basin: 1 | 2 | 3;
  /** Finanças face aos clubes do mesmo escalão: 1 apertadas, 2 normais, 3 folgadas. */
  finances: 1 | 2 | 3;
  ownStadium: boolean;
  stadiumCapacity: number;
  rival?: { id: string; name: string };
  difficulty: Difficulty;
};

const DIFFICULTY: Record<LevelReputation, Difficulty> = { worldClass: "big", continental: "big", national: "big", regional: "balanced", local: "underdog", obscure: "underdog" };

export function buildCatalog(data: BaseData, params: Params): CatalogClub[] {
  const cities = new Map(data.cities.map((c) => [c.id, c] as const));
  const localities = new Map(data.localities.map((l) => [l.id, l] as const));
  const districts = new Map(data.districts.map((d) => [d.id, d] as const));
  const clubs = new Map(data.clubs.map((c) => [c.id, c] as const));
  const byTier = new Map<Tier, number[]>();
  for (const c of data.clubs) byTier.set(c.tier, [...(byTier.get(c.tier) ?? []), c.finances]);
  const cuts = new Map<Tier, [number, number]>();
  for (const [tier, xs] of byTier) {
    const sorted = [...xs].sort((a, b) => a - b);
    cuts.set(tier, [sorted[Math.floor(sorted.length / 3)] ?? 0, sorted[Math.floor((2 * sorted.length) / 3)] ?? 0]);
  }
  const [small, large] = params.onboarding.basinThresholds;
  return data.clubs
    .filter((c) => !isInSecondDistrict(c.league))
    .map((c): CatalogClub => {
      const city = cities.get(c.city);
      const locality = localities.get(c.localityId);
      const [lo, hi] = cuts.get(c.tier) ?? [0, 0];
      const population = city?.population ?? 0;
      const rival = clubs.get(c.rival);
      const level = reputationLevel(c.reputation, params);
      return {
        id: c.id,
        name: c.name,
        league: c.league,
        tier: c.tier,
        district: { id: c.district, name: districts.get(c.district)?.name ?? c.district },
        locality: { name: locality?.name ?? c.locality, status: locality?.status ?? "town" },
        city: city?.name ?? c.city,
        colours: c.colours,
        levelReputation: level,
        basin: population < small ? 1 : population < large ? 2 : 3,
        finances: c.finances < lo ? 1 : c.finances < hi ? 2 : 3,
        ownStadium: c.stadium.ownership === "club" || c.stadium.ownership === "shared",
        stadiumCapacity: c.stadium.capacity,
        ...(rival ? { rival: { id: rival.id, name: rival.name } } : {}),
        difficulty: DIFFICULTY[level],
      };
    });
}
