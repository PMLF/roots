/**
 * Gestão do clube (RZ-270): um fator oculto por clube, persistente e que regride à média, que soma ou tira qualidade ao plantel que o
 * clube consegue montar (presidente, diretor desportivo, azar e sorte nas contratações). Dá mobilidade à pirâmide: clubes bem geridos
 * podem subir vários escalões ao longo de décadas e os mal geridos descer, sem depender só da reputação de arranque.
 */
import type { Params } from "../config/parameters";
import type { BaseClub, ClubId } from "../data/types";
import { Rng } from "../random/rng";
import type { Repository } from "../persistence/repository";

const KEY = "management";

export const readManagement = (repo: Repository): Record<ClubId, number> => {
  const raw = repo.meta(KEY);
  return raw ? (JSON.parse(raw) as Record<ClubId, number>) : {};
};

/** Avança um ano: cada clube mantém parte do valor anterior e leva um novo choque. Determinístico por seed, clube e época. */
export function advanceManagement(repo: Repository, clubs: readonly BaseClub[], params: Params, season: number): Record<ClubId, number> {
  const m = params.squadCycle.management;
  const seed = repo.meta("seed") ?? "?";
  const before = readManagement(repo);
  const out: Record<ClubId, number> = {};
  for (const c of clubs) out[c.id] = (before[c.id] ?? 0) * m.persistence + new Rng(seed, `management/${season}/${c.id}`).gauss(0, m.sigma);
  repo.setMeta(KEY, JSON.stringify(out));
  return out;
}
