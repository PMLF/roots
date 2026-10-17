/**
 * Aposta de um clube nos jovens (1 = média). Depende da natureza do clube (sorteio fixo pela seed) e da personalidade do
 * presidente: paciente aposta mais na formação, ambicioso prefere contratar feito. Os clubes mais pequenos apostam mais.
 */
import { Rng, clamp } from "../random/rng";
import type { Params, Tier } from "../config/parameters";
import type { Repository } from "../persistence/repository";

const TIER_BONUS: Record<Tier, number> = { firstLeague: -0.1, secondLeague: 0, thirdLeague: 0.05, cp: 0.1, district: 0.15 };

export function youthFocus(repo: Repository, club: { id: string }, tier: Tier, params: Params): number {
  const f = params.squadCycle.youth.focus;
  const president = repo.publicRoles({ club: club.id }).find((p) => p.fn === "president");
  const traits = president ? repo.person(president.id)?.personality : undefined;
  const rng = new Rng(repo.meta("seed") ?? "?", `youthFocus/${club.id}`);
  const value = 1 + TIER_BONUS[tier] + rng.gauss(0, f.spread) + f.byPatience * ((traits?.patience ?? 10) - 10) - f.byAmbition * ((traits?.ambition ?? 10) - 10);
  return clamp(value, f.min, f.max);
}
