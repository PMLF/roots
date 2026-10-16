/**
 * Prémio do Estado por distrito (RZ-112; docs/DESIGN_RULES.md §3). Puro: escolhe, em cada distrito, o clube mais bem
 * classificado da pirâmide. A tesouraria do clube e o orçamento da Câmara entram com as finanças (RZ-114): por agora o
 * valor fica no evento `PREMIO_ESTADO`, de onde se reconstrói.
 */
import type { Tier } from "../config/parameters";
import type { ClubId, DistrictId } from "../data/types";

export type RankedClub = {
  club: ClubId;
  district: DistrictId;
  tier: Tier;
  /** Posição final na tabela da sua competição (no CP, dentro da série). */
  position: number;
  matches: number;
  points: number;
  difference: number;
  scoredGoals: number;
  reputation: number;
};

const TIER_ORDER: Record<Tier, number> = { firstLeague: 0, secondLeague: 1, thirdLeague: 2, cp: 3, district: 4 };

/** Negativo se `a` é melhor classificado que `b`: escalão, posição, pontos por jogo, diferença, golos marcados, menor reputação. */
export function compareForPrize(a: RankedClub, b: RankedClub): number {
  const ppg = (c: RankedClub) => (c.matches > 0 ? c.points / c.matches : 0);
  return (
    TIER_ORDER[a.tier] - TIER_ORDER[b.tier] ||
    a.position - b.position ||
    ppg(b) - ppg(a) ||
    b.difference - a.difference ||
    b.scoredGoals - a.scoredGoals ||
    a.reputation - b.reputation ||
    (a.club < b.club ? -1 : a.club > b.club ? 1 : 0)
  );
}

/** O melhor classificado de cada distrito (só os distritos com clubes). Ordenado por distrito, para ser estável. */
export function winnersPerDistrict(clubs: readonly RankedClub[]): { district: DistrictId; club: ClubId }[] {
  const best = new Map<DistrictId, RankedClub>();
  for (const c of clubs) {
    const current = best.get(c.district);
    if (!current || compareForPrize(c, current) < 0) best.set(c.district, c);
  }
  return [...best.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([district, c]) => ({ district, club: c.club }));
}

/** Anos seguidos em que o mesmo clube ganha o prémio do distrito (1 na primeira vez ou depois de outro vencedor). */
export function consecutiveYears(previous: { club: ClubId; consecutive: number } | undefined, club: ClubId): number {
  return previous && previous.club === club ? previous.consecutive + 1 : 1;
}
