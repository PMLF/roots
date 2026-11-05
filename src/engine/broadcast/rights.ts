/**
 * Direitos de transmissão (RZ-218). Em cada época, as emissoras (televisão, rádio, streaming) disputam um pacote por escalão
 * (e por distrito, nas distritais): licitam em função do interesse, da proximidade e da capacidade; ganha a melhor proposta e paga
 * o segundo preço (com um mínimo de reserva). O valor reparte-se pelos clubes do pacote em proporção à reputação, como contratos
 * `broadcast` de uma época. A Taça e a Supertaça têm uma emissora própria que paga por jogo escolhido (`featured.ts`).
 */
import { Rng } from "../random/rng";
import { createDate } from "../calendar/dates";
import type { Params, Tier } from "../config/parameters";
import type { BaseClub, BaseData } from "../data/types";
import { annualFixedRevenues, factorReputation } from "../club/finances";
import { isBroadcaster } from "../company/sectors";
import type { Repository } from "../persistence/repository";
import type { CompanyRecord, IsoDate } from "../persistence/types";

export type RightsContext = { season: number; start: IsoDate; tiers: ReadonlyMap<string, Tier>; /** Época a que os direitos se aplicam (a que começa em `start`). */ forSeason?: number };

export type RightsDeal = { company: string; total: number; tier: Tier };

const TIER_ORDER: Tier[] = ["firstLeague", "secondLeague", "thirdLeague", "cp", "district"];

const rightsKey = (season: number, scope: string): string => `rights.${season}.${scope}`;

/** Pacote em vigor numa época: `tier` ou `district:<distrito>` ou `cup` / `supercup`. */
export function readRights(repo: Repository, season: number, scope: string): RightsDeal | undefined {
  const v = repo.meta(rightsKey(season, scope));
  return v ? (JSON.parse(v) as RightsDeal) : undefined;
}

type Group = { scope: string; tier: Tier; clubs: BaseClub[]; districts: Set<string> };

function groupsOf(data: BaseData, tiers: ReadonlyMap<string, Tier>): Group[] {
  const out = new Map<string, Group>();
  for (const club of data.clubs) {
    const tier = tiers.get(club.id);
    if (!tier) continue; // fora da pirâmide (segunda distrital)
    const scope = tier === "district" ? `district:${club.district}` : tier;
    const g = out.get(scope) ?? { scope, tier, clubs: [], districts: new Set<string>() };
    g.clubs.push(club);
    g.districts.add(club.district);
    out.set(scope, g);
  }
  return [...out.values()].sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier) || (a.scope < b.scope ? -1 : 1));
}

function interestOf(company: CompanyRecord, g: Group, districtOfCity: ReadonlyMap<string, string>, params: Params): number {
  const base = params.broadcast.interest[g.tier][company.sector as "television" | "radio" | "streaming"]?.[company.scale] ?? 0;
  if (company.scale === "national" || company.scale === "international") return base;
  return base * (g.districts.has(districtOfCity.get(company.city) ?? "") ? 1 : company.scale === "regional" ? 0.1 : 0.02);
}

/** Compromisso de direitos já assumido por cada emissora na época (para respeitar a capacidade). */
function committedOf(repo: Repository, on: IsoDate): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of repo.activeSponsorships(on)) if (s.kind === "broadcast") m.set(s.company, (m.get(s.company) ?? 0) + s.annualValue);
  return m;
}

export function auctionRights(repo: Repository, data: BaseData, params: Params, ctx: RightsContext): { packages: number; unsold: number } {
  const bp = params.broadcast;
  const forSeason = ctx.forSeason ?? ctx.season;
  const seed = repo.meta("seed") ?? "?";
  const broadcasters = repo.companies({ state: "active" }).filter((c) => isBroadcaster(c.sector));
  const districtOfCity = new Map(data.cities.map((c) => [c.id, c.district] as const));
  const committed = committedOf(repo, ctx.start);
  const end = createDate(Number(ctx.start.slice(0, 4)) + 1, 6, 30);
  const previous = (scope: string) => readRights(repo, forSeason - 1, scope)?.company;
  let packages = 0;
  let unsold = 0;

  for (const g of groupsOf(data, ctx.tiers)) {
    const rng = new Rng(seed, `rights/${forSeason}/${g.scope}`);
    const weights = g.clubs.map((c) => factorReputation({ ...c, tier: g.tier }, params));
    const sumWeights = weights.reduce((a, b) => a + b, 0);
    const reference = g.clubs.reduce((t, c) => t + annualFixedRevenues({ ...c, tier: g.tier }, params).commercial, 0) * bp.packageShareOfCommercial[g.tier];
    // licitantes: sorteio por interesse, sem repetição
    const pool = broadcasters.map((c) => ({ c, w: interestOf(c, g, districtOfCity, params) })).filter((x) => x.w > 0);
    const bids: { company: CompanyRecord; bid: number }[] = [];
    while (bids.length < bp.bidders[g.tier] && pool.length > 0) {
      const pick = rng.weighted(pool, (x) => x.w);
      pool.splice(pool.indexOf(pick), 1);
      const room = Math.max(0, pick.c.capital * bp.maxShareOfCapital - (committed.get(pick.c.id) ?? 0));
      const fit = 0.6 + 0.5 * Math.min(1, pick.w);
      const bonus = previous(g.scope) === pick.c.id ? 1 + bp.incumbentBonus : 1;
      bids.push({ company: pick.c, bid: Math.min(room, reference * fit * bonus * Math.exp(rng.gauss(0, bp.bidSigma))) });
    }
    bids.sort((a, b) => b.bid - a.bid || (a.company.id < b.company.id ? -1 : 1));
    const best = bids[0];
    const floor = reference * bp.reserve;
    if (!best || best.bid < floor || reference <= 0) {
      unsold++;
      continue;
    }
    const total = Math.round(Math.max(floor, Math.min(best.bid, bids[1]?.bid ?? best.bid * 0.9)) / 1000) * 1000;
    committed.set(best.company.id, (committed.get(best.company.id) ?? 0) + total);
    repo.setMeta(rightsKey(forSeason, g.scope), JSON.stringify({ company: best.company.id, total, tier: g.tier } satisfies RightsDeal));
    g.clubs.forEach((club, i) => {
      const value = Math.round((total * (weights[i] as number)) / sumWeights / 100) * 100;
      if (value > 0) repo.addSponsorship({ company: best.company.id, club: club.id, kind: "broadcast", annualValue: value, start: ctx.start, end });
    });
    repo.appendEvent({
      type: "RIGHTS_SIGNED", date: ctx.start, season: forSeason, visibility: "exposed", origin: "generated",
      entities: [{ k: "company", id: best.company.id, roleKind: "broadcaster" }, ...(g.tier === "district" ? [] : [{ k: "competition" as const, id: g.scope }])],
      data: { scope: g.scope, tier: g.tier, total, bidders: bids.length, runnerUp: bids[1]?.company.id ?? null, clubs: g.clubs.length },
    });
    packages++;
  }

  // Taça e Supertaça: emissora nacional de televisão ou streaming, escolhida por interesse; paga por jogo escolhido
  const national = broadcasters.filter((c) => c.scale === "national" || c.scale === "international").filter((c) => c.sector !== "radio");
  for (const scope of ["cup", "supercup"] as const) {
    if (national.length === 0) break;
    const rng = new Rng(seed, `rights/${forSeason}/${scope}`);
    const winner = rng.weighted(national, (c) => (previous(scope) === c.id ? 1 + bp.incumbentBonus : 1) * Math.sqrt(c.capital));
    repo.setMeta(rightsKey(forSeason, scope), JSON.stringify({ company: winner.id, total: 0, tier: "firstLeague" } satisfies RightsDeal));
    repo.appendEvent({ type: "RIGHTS_SIGNED", date: ctx.start, season: forSeason, visibility: "exposed", origin: "generated", entities: [{ k: "company", id: winner.id, roleKind: "broadcaster" }], data: { scope, perMatch: scope === "cup" ? bp.cup.matchFee : bp.cup.superCupFee } });
  }
  return { packages, unsold };
}


