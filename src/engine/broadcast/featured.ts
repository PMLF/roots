/**
 * Jogos de interesse (RZ-218): em cada jornada, a emissora com os direitos escolhe os jogos mais apetecíveis (reputação das
 * duas equipas, dérbi, jogos a eliminar) e paga por cada um aos dois clubes. A escolha é determinística e guardada por
 * competição e época (`featured.<época>.<competição>.<jornada>`); as datas/horas continuam a vir do calendário (RZ-102).
 */
import type { Params, Tier } from "../config/parameters";
import type { BaseClub, BaseData } from "../data/types";
import { post } from "../club/finances";
import type { Repository } from "../persistence/repository";
import type { ScheduledMatch } from "../persistence/types";
import { cupKind } from "../season/competitions";
import { readRights } from "./rights";

type Featured = { ids: string[]; interest: Record<string, number> };

const featuredKey = (season: number, competition: string, round: number) => `featured.${season}.${competition}.${round}`;

/** Interesse de um jogo (1 = jogo típico do escalão). */
export function matchInterest(home: BaseClub, away: BaseClub, tier: Tier, params: Params): number {
  const ref = params.finances.model.refReputation[tier];
  const rivals = home.rival === away.id || away.rival === home.id || home.city === away.city;
  return (home.reputation + away.reputation) / 2 / ref + (rivals ? params.broadcast.derbyBonus : 0);
}

function build(repo: Repository, data: BaseData, params: Params, season: number, competition: string, round: number, tier: Tier, perRound: number): Featured {
  const matches = repo.calendar(competition, season).matches.filter((m: ScheduledMatch) => m.round === round);
  const clubs = new Map(data.clubs.map((c) => [c.id, c] as const));
  const scored = matches.flatMap((m) => {
    const h = clubs.get(m.home);
    const a = clubs.get(m.away);
    return h && a ? [{ id: m.id, interest: matchInterest(h, a, tier, params) + (m.knockout ? 0.3 : 0) }] : [];
  }).sort((x, y) => y.interest - x.interest || (x.id < y.id ? -1 : 1)).slice(0, perRound);
  return { ids: scored.map((x) => x.id), interest: Object.fromEntries(scored.map((x) => [x.id, x.interest])) };
}

/** Quem emite e quanto paga um jogo, se for um jogo de interesse. */
export function broadcastFee(repo: Repository, data: BaseData, params: Params, season: number, match: { id: string; competition: string; round: number; home: string }): { company: string; fee: number } | undefined {
  if (repo.meta("companies.enabled") !== "1") return undefined;
  const bp = params.broadcast;
  const kind = cupKind(match.competition);
  const home = data.clubs.find((c) => c.id === match.home);
  if (!home) return undefined;
  let scope: string;
  let tier: Tier = home.tier;
  let perRound = bp.featuredPerRound[tier];
  let base = bp.matchFee[tier];
  if (kind === "supercup") {
    const rights = readRights(repo, season, "supercup");
    return rights ? { company: rights.company, fee: bp.cup.superCupFee } : undefined;
  }
  if (kind === "cup") {
    scope = "cup";
    tier = "firstLeague";
    perRound = bp.cup.featuredPerRound;
    base = bp.cup.matchFee;
  } else if (kind === "districtCup" || kind === "districtSupercup") {
    tier = "district";
    scope = `district:${home.district}`;
    perRound = 1;
    base = bp.matchFee.district;
  } else scope = tier === "district" ? `district:${home.district}` : tier;
  const rights = readRights(repo, season, scope);
  if (!rights) return undefined;
  const key = featuredKey(season, match.competition, match.round);
  let featured = repo.meta(key) ? (JSON.parse(repo.meta(key) as string) as Featured) : undefined;
  if (!featured) {
    featured = build(repo, data, params, season, match.competition, match.round, tier, perRound);
    repo.setMeta(key, JSON.stringify(featured));
  }
  if (!featured.ids.includes(match.id)) return undefined;
  const interest = Math.min(bp.interestRange.max, Math.max(bp.interestRange.min, featured.interest[match.id] as number));
  return { company: rights.company, fee: Math.round((base * interest) / 10) * 10 };
}

/** Lança o pagamento de um jogo transmitido: metade a cada clube (o dinheiro vem de quem tem os direitos). */
export function postBroadcast(repo: Repository, data: BaseData, params: Params, season: number, match: { id: string; competition: string; round: number; home: string; away: string }): void {
  const deal = broadcastFee(repo, data, params, season, match);
  if (!deal) return;
  const h = data.clubs.find((c) => c.id === match.home);
  const a = data.clubs.find((c) => c.id === match.away);
  const half = Math.floor(deal.fee / 2);
  if (h) post(repo, h, "broadcasting", deal.fee - half);
  if (a) post(repo, a, "broadcasting", half);
}
