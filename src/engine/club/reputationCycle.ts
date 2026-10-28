/**
 * Reputação dinâmica dos clubes (RZ-270). A reputação dos dados é só o valor da época 1; no fim de cada época o motor grava a
 * da seguinte (`reputation.<época>`): sobe com a posição na tabela, o título, as subidas, as taças e a Europa; desce com as
 * descidas e os maus anos. É puxada para o intervalo do escalão onde o clube vai jogar e regride devagar para o seu centro.
 * Afeta tudo o que lê `club.reputation` dos dados da época: receitas (patrocínios, bilheteira), nível do plantel que o clube
 * procura, atração de jogadores e a cidade.
 */
import type { Params, Tier } from "../config/parameters";
import type { BaseClub, BaseData, ClubId } from "../data/types";
import type { Repository } from "../persistence/repository";
import { clamp } from "../random/rng";

const key = (season: number) => `reputation.${season}`;

export const reputationsOf = (repo: Repository, season: number): Record<ClubId, number> | undefined => {
  const raw = repo.meta(key(season));
  return raw ? (JSON.parse(raw) as Record<ClubId, number>) : undefined;
};

/** Os clubes com a reputação da época. Sem registo (época 1), devolve-os como estão. */
export function withReputation(repo: Repository, clubs: BaseClub[], season: number): BaseClub[] {
  const map = reputationsOf(repo, season);
  return map ? clubs.map((c) => (map[c.id] === undefined ? c : { ...c, reputation: map[c.id] as number })) : clubs;
}

export type SeasonFinish = { club: ClubId; tier: Tier; position: number; size: number };

export type ReputationInput = {
  season: number;
  /** Classificação final de cada clube na liga onde jogou. */
  finish: readonly SeasonFinish[];
  champions: readonly ClubId[];
  /** Escalão da época seguinte. */
  nextTier: ReadonlyMap<ClubId, Tier>;
  /** Escalão da época que acabou. */
  tier: ReadonlyMap<ClubId, Tier>;
  cupWinners?: readonly ClubId[];
  europe?: { played: readonly ClubId[]; winner?: ClubId };
};

const TIER_ORDER: Tier[] = ["firstLeague", "secondLeague", "thirdLeague", "cp", "district"];

/** Calcula e grava a reputação da época seguinte. `clubs` traz a reputação desta época. */
export function updateReputations(repo: Repository, clubs: readonly BaseClub[], params: Params, o: ReputationInput): Record<ClubId, number> {
  const d = params.reputation.dynamics;
  const finish = new Map(o.finish.map((f) => [f.club, f] as const));
  const champions = new Set(o.champions);
  const cups = new Set(o.cupWinners ?? []);
  const europe = new Set(o.europe?.played ?? []);
  const out: Record<ClubId, number> = {};
  for (const c of clubs) {
    const t = o.tier.get(c.id) ?? c.tier;
    const next = o.nextTier.get(c.id) ?? t;
    let delta = 0;
    const f = finish.get(c.id);
    if (f && f.size > 1) delta += d.position[f.tier] * (1 - (2 * (f.position - 1)) / (f.size - 1));
    if (champions.has(c.id)) delta += d.champion[t];
    const move = TIER_ORDER.indexOf(t) - TIER_ORDER.indexOf(next);
    if (move > 0) delta += d.promotion * move;
    if (move < 0) delta += d.relegation * move;
    if (cups.has(c.id)) delta += d.cup;
    if (europe.has(c.id)) delta += d.europe;
    if (o.europe?.winner === c.id) delta += d.europeWinner;
    const [lo, hi] = d.bands[next];
    const centre = (lo + Math.min(hi, lo * 2.2)) / 2;
    let rep = c.reputation + delta;
    rep += (centre - rep) * d.meanReversion;
    if (rep < lo) rep += (lo - rep) * d.bandPull;
    if (rep > hi) rep -= (rep - hi) * d.bandPull;
    out[c.id] = Math.round(clamp(rep, d.min, d.max));
  }
  repo.setMeta(key(o.season + 1), JSON.stringify(out));
  return out;
}

/** Os dados com a reputação em vigor numa época. */
export const reputationData = (repo: Repository, data: BaseData, season: number): BaseData => ({ ...data, clubs: withReputation(repo, data.clubs, season) });
