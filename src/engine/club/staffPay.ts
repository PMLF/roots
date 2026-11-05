/** Qualidade e ordenado do staff (RZ-208). À parte de `staff.ts` para as finanças poderem usar sem ciclo de imports. */
import { clamp } from "../random/rng";
import type { Params, Tier } from "../config/parameters";
import type { Repository } from "../persistence/repository";

/** Qualidade global (média das áreas) de um profissional, 1-20. */
export function staffRating(repo: Repository, person: string): number {
  const q = repo.role(person)?.quality;
  const v = q ? Object.values(q) : [];
  return v.length === 0 ? 10 : v.reduce((a, b) => a + b, 0) / v.length;
}

/** Ordenado mensal de um profissional de staff num clube desse escalão, a partir da qualidade (1-20). */
export function staffWage(params: Params, tier: Tier, rating: number): number {
  const w = params.staff.wages;
  const base = (params.finances.model.monthlyStaff[tier] * w.share) / w.heads;
  return Math.max(10, Math.round((base * (1 + w.spread * (clamp(rating, 1, 20) - 10) / 10)) / 10) * 10);
}
