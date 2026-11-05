/**
 * Interesse de outros clubes num jogador (RZ-256). Determinístico (sem sorteio): para cada clube que o pode contratar, vê-se se a posição
 * é uma necessidade (falta gente ou o titular mais fraco é pior) e se a qualidade cabe no que o clube procura. Jovens livres da terra
 * só interessam a clubes da cidade; quem assinou há pouco por um clube da terra só interessa a clubes dessa cidade até acabar a tranca.
 * Serve para qualquer jogador: o gamer vê estes clubes no perfil (rumores de mercado), não a decisão oculta de cada clube.
 */
import { clamp } from "../random/rng";
import type { Params } from "../config/parameters";
import type { BaseData } from "../data/types";
import type { Repository } from "../persistence/repository";
import type { IsoDate } from "../persistence/types";
import { currentQuality } from "../world/player";
import { distributePositions } from "../world/generateWorld";
import type { Attributes, Position } from "../world/types";
import { isInSecondDistrict } from "../season/districts";
import { localBlock, readLocks } from "../squad/localPriority";

type InterestLevel = "high" | "medium" | "low";
export type ClubInterest = { club: string; level: InterestLevel; local: boolean };

const MAX = 6;

export function interestedClubs(repo: Repository, data: BaseData, params: Params, person: string, today: IsoDate): ClubInterest[] {
  const record = repo.player(person);
  if (!record || record.state === "retired") return [];
  const position = (record.positions[0]?.pos ?? "CM") as Position;
  const quality = currentQuality(record.attributes as Attributes, position);
  const home = repo.person(person)?.birthCity;
  const locks = readLocks(repo);
  const w = params.world;
  const out: (ClubInterest & { score: number })[] = [];
  const stats = new Map<string, { min: number; max: number }>();
  for (const c of data.clubs) {
    const s = stats.get(c.tier);
    stats.set(c.tier, { min: Math.min(s?.min ?? c.reputation, c.reputation), max: Math.max(s?.max ?? c.reputation, c.reputation) });
  }
  for (const club of data.clubs) {
    if (isInSecondDistrict(club.league) || club.id === record.club) continue;
    if (localBlock(repo, person, club, today, locks)) continue;
    const local = home !== undefined && club.city === home;
    const st = stats.get(club.tier)!;
    const repNorm = st.max > st.min ? (club.reputation - st.min) / (st.max - st.min) : 0.5;
    const desired = clamp(w.targetQuality[club.tier].mean + w.qualityByReputation * (repNorm - 0.5), 1, 20);
    const target = w.squad[club.tier];
    const wanted = distributePositions(target, w.placesByPosition).filter((p) => p === position).length;
    const qs = repo.clubPlayers(club.id).filter((j) => j.state === "active" && (j.positions[0]?.pos ?? "CM") === position).map((j) => currentQuality(j.attributes as Attributes, position)).sort((a, b) => b - a);
    const lacking = qs.length < wanted;
    const floorQ = qs[wanted - 1] ?? 0;
    const upgrade = quality - floorQ;
    const fits = quality <= desired + params.market.qualityCeiling && (lacking ? quality >= desired - 2 : upgrade >= params.market.minUpgrade);
    // jovens da terra: os clubes da cidade têm sempre um olho neles, mesmo sem grande necessidade
    const prospectHome = record.state === "prospect" && local;
    if (!fits && !prospectHome) continue;
    const score = (lacking ? 2 : Math.min(2, upgrade)) + (local ? 1.5 : 0) + (prospectHome ? 1 : 0);
    out.push({ club: club.id, local, level: score >= 3 ? "high" : score >= 1.5 ? "medium" : "low", score });
  }
  return out.sort((a, b) => b.score - a.score || a.club.localeCompare(b.club)).slice(0, MAX).map((x) => ({ club: x.club, level: x.level, local: x.local }));
}

