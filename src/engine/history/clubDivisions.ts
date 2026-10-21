/** O percurso de um clube pelas divisões: a pré-história (épocas ≤ 0) e as épocas do save, com lugar final e subidas/descidas. */
import type { Params, Tier } from "../config/parameters";
import type { BaseData } from "../data/types";
import type { Repository } from "../persistence/repository";
import { currentSeason, divisionsHistory } from "../season/seasonPyramid";
import { clubPreHistory } from "./preHistory";

export type ClubDivisionSeason = {
  season: number;
  tier: Tier;
  league: string;
  /** Lugar final na liga (só nas épocas já acabadas) e n.º de clubes. */
  position?: number;
  of?: number;
  /** O que aconteceu no fim da época. */
  movement?: "promoted" | "relegated";
  /** Época anterior ao arranque do save (sem jogos nem tabelas). */
  past?: true;
};

const ORDER: readonly Tier[] = ["firstLeague", "secondLeague", "thirdLeague", "cp", "district"];

export function clubDivisions(repo: Repository, base: BaseData, params: Params, club: string): ClubDivisionSeason[] {
  const own = base.clubs.find((c) => c.id === club);
  const past: ClubDivisionSeason[] = own ? clubPreHistory(repo.meta("seed") ?? "?", own, base, params).map((s) => ({ ...s, past: true as const })) : [];
  const now = currentSeason(repo);
  const real = divisionsHistory(repo, base, club).map((h): ClubDivisionSeason => {
    if (h.season >= now) return h;
    // época acabada: o lugar final na tabela dessa liga
    const table = [...repo.standings(h.league, h.season)].sort((a, b) => b.points - a.points || (b.scoredGoals - b.concededGoals) - (a.scoredGoals - a.concededGoals) || b.scoredGoals - a.scoredGoals);
    const at = table.findIndex((l) => l.club === club);
    return at < 0 ? h : { ...h, position: at + 1, of: table.length };
  });
  const all = [...past, ...real];
  // o movimento vê-se pelo escalão da época seguinte (a pré-história já o traz calculado; refaz-se de forma uniforme)
  return all.map((s, i) => {
    const after = all[i + 1];
    if (!after) return s;
    const d = ORDER.indexOf(s.tier) - ORDER.indexOf(after.tier);
    const { movement: _m, ...rest } = s;
    void _m;
    return { ...rest, ...(d > 0 ? { movement: "promoted" as const } : d < 0 ? { movement: "relegated" as const } : {}) };
  });
}
