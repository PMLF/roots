/**
 * Patrocínios de clubes por empresas (RZ-311). O valor total que um clube pode obter por ano continua a vir de
 * `annualFixedRevenues` (escalão × reputação), mas agora está repartido por contratos reais com empresas concretas,
 * por tipo (camisola, estádio, formação), com duração, renovação e rescisão quando a empresa fecha.
 */
import { Rng, clamp } from "../random/rng";
import { createDate } from "../calendar/dates";
import type { Params, Tier } from "../config/parameters";
import type { BaseClub, BaseData } from "../data/types";
import { annualFixedRevenues } from "../club/finances";
import type { Repository } from "../persistence/repository";
import type { CompanyRecord, IsoDate, SponsorSlot, SponsorshipRecord } from "../persistence/types";
import { SECTOR_INFO, type CompanySector } from "./sectors";

export type SponsorContext = {
  season: number;
  /** Primeiro dia dos contratos novos (início da época). */
  start: IsoDate;
  tiers: ReadonlyMap<string, Tier>;
  /** Escalão da época anterior (quem subiu ganha patrocínios maiores). */
  previousTiers?: ReadonlyMap<string, Tier>;
};

/** Multiplicador do valor de um patrocínio novo: escalão mais alto paga mais, e os clubes em destaque (campeões, promovidos) ainda mais. */
function performanceFactor(repo: Repository, club: BaseClub, tier: Tier, ctx: SponsorContext, params: Params): number {
  const b = params.companies.sponsorship.boost;
  let f = b.tier[tier];
  if (repo.eventsOf({ k: "club", id: club.id }, { type: "CHAMPION", seasonSince: ctx.season - 1, untilSeason: ctx.season }).length > 0) f += b.champion;
  const before = ctx.previousTiers?.get(club.id);
  if (before && TIER_ORDER.indexOf(before) > TIER_ORDER.indexOf(tier)) f += b.promoted;
  return f;
}

const TIER_ORDER: Tier[] = ["firstLeague", "secondLeague", "thirdLeague", "cp", "district"];

/** Valor anual de referência de um tipo de patrocínio num clube (sem ruído). */
function referenceValue(club: BaseClub, tier: Tier, kind: SponsorSlot, params: Params, active: readonly SponsorSlot[]): number {
  const s = params.companies.sponsorship;
  const total = annualFixedRevenues({ ...club, tier }, params).sponsorships;
  // o total do clube reparte-se só pelos tipos que ele tem: sem nome de estádio ou bancadas, a camisola e a formação valem mais
  const shareSum = active.reduce((t, k) => t + s.kindShare[k], 0);
  return (total * s.kindShare[kind]) / shareSum;
}

/**
 * Quantos contratos de cada tipo o clube comporta: um por tipo do escalão, mais "extras" quanto mais a reputação
 * ultrapassa a normal do escalão (clubes maiores e com mais ambição têm mais patrocinadores). Os extras repartem-se
 * pelos tipos por ordem (camisola, estádio, formação…).
 */
export function sponsorTargets(club: BaseClub, tier: Tier, params: Params, seed = "?"): Map<SponsorSlot, number> {
  const s = params.companies.sponsorship;
  const ratio = club.reputation / params.finances.model.refReputation[tier];
  const kinds = s.slots[tier].filter((k) => k !== "stadium" && k !== "stand");
  const targets = new Map<SponsorSlot, number>(kinds.map((k) => [k, 1] as const));
  const extra = Math.min(s.extra.max[tier], Math.max(0, Math.floor((ratio - s.extra.startRatio) / s.extra.perRatio) + (ratio >= s.extra.startRatio ? 1 : 0)));
  for (let i = 0; i < extra; i++) {
    const k = kinds[i % kinds.length]!;
    targets.set(k, (targets.get(k) ?? 0) + 1);
  }
  // nome do estádio e das bancadas: as empresas preferem os clubes grandes; o sorteio é estável por clube (sobe e desce com a reputação)
  const rng = new Rng(seed, `sponsorship/naming/${club.id}`);
  const p = (factor: number) => clamp(s.naming.byTier[tier] * ratio * factor, 0, s.naming.max);
  const stadium = s.slots[tier].includes("stadium") && rng.prob(p(s.naming.stadium)) ? 1 : 0;
  let stands = 0;
  for (let i = 0; i < 4; i++) if (s.slots[tier].includes("stand") && rng.prob(p(s.naming.stand))) stands++;
  if (stadium) targets.set("stadium", 1);
  if (stands) targets.set("stand", stands);
  return targets;
}

type Pool = {
  repo: Repository;
  data: BaseData;
  params: Params;
  districtOfCity: Map<string, string>;
  companies: CompanyRecord[];
  committed: Map<string, number>;
};

function makePool(repo: Repository, data: BaseData, params: Params, on: IsoDate): Pool {
  const committed = new Map<string, number>();
  for (const s of repo.activeSponsorships(on)) if (s.kind !== "broadcast") committed.set(s.company, (committed.get(s.company) ?? 0) + s.annualValue);
  return { repo, data, params, districtOfCity: new Map(data.cities.map((c) => [c.id, c.district] as const)), companies: repo.companies({ state: "active" }), committed };
}

function weightOf(pool: Pool, company: CompanyRecord, club: BaseClub, tier: Tier, desired: number, already: ReadonlySet<string>): number {
  const s = pool.params.companies.sponsorship;
  if (already.has(company.id)) return 0;
  const fit = s.scaleFit[tier][company.scale];
  const visibility = SECTOR_INFO[company.sector as CompanySector]?.visibility ?? 1;
  let prox = company.city === club.city ? s.proximity.city : pool.districtOfCity.get(company.city) === club.district ? s.proximity.district : s.proximity.elsewhere;
  if (company.scale === "national" || company.scale === "international") prox = Math.max(prox, s.proximity.nationalFloor);
  const room = company.capital * s.maxShareOfCapital - (pool.committed.get(company.id) ?? 0);
  const capacity = room >= desired ? 1 : room > 0 ? Math.max(0.05, room / desired) ** 1.5 : 0.01;
  return fit * visibility * prox * capacity;
}

const roundValue = (x: number) => Math.max(500, Math.round(x / 100) * 100);

function sign(pool: Pool, rng: Rng, club: BaseClub, tier: Tier, kind: SponsorSlot, ctx: SponsorContext, active: readonly SponsorSlot[], already: Set<string>, keep?: CompanyRecord, isExtra = false, kindCount = 1): SponsorshipRecord | undefined {
  const s = pool.params.companies.sponsorship;
  const desired = performanceFactor(pool.repo, club, tier, ctx, pool.params) * (referenceValue(club, tier, kind, pool.params, active) / (1 + (kindCount - 1) * s.extra.valueShare)) * (isExtra ? s.extra.valueShare : 1) * Math.exp(rng.gauss(0, s.valueSigma));
  const company = keep ?? (pool.companies.length === 0 ? undefined : rng.weighted(pool.companies, (c) => weightOf(pool, c, club, tier, desired, already)));
  if (!company || already.has(company.id)) return undefined;
  const room = Math.max(0, company.capital * s.maxShareOfCapital - (pool.committed.get(company.id) ?? 0));
  const value = roundValue(Math.min(desired, Math.max(room, desired * 0.35)));
  const years = rng.integer(s.yearsMin, s.yearsMax);
  const end = createDate(Number(ctx.start.slice(0, 4)) + years, 6, 30);
  const id = pool.repo.addSponsorship({ company: company.id, club: club.id, kind, annualValue: value, start: ctx.start, end });
  pool.committed.set(company.id, (pool.committed.get(company.id) ?? 0) + value);
  already.add(company.id);
  pool.repo.appendEvent({
    type: "SPONSORSHIP_SIGNED", date: ctx.start, season: ctx.season, visibility: "exposed", origin: "generated",
    entities: [{ k: "company", id: company.id, roleKind: "sponsor" }, { k: "club", id: club.id, roleKind: "sponsored" }],
    data: { kind, annualValue: value, years },
  });
  return { id, company: company.id, club: club.id, kind, annualValue: value, start: ctx.start, end };
}

/** Preenche os tipos de patrocínio que cada clube oferece e ainda não tem vigentes na data de início. */
export function fillSponsorships(repo: Repository, data: BaseData, params: Params, ctx: SponsorContext): number {
  const seed = repo.meta("seed") ?? "?";
  const pool = makePool(repo, data, params, ctx.start);
  const order = [...data.clubs].sort((a, b) => TIER_ORDER.indexOf(ctx.tiers.get(a.id) ?? a.tier) - TIER_ORDER.indexOf(ctx.tiers.get(b.id) ?? b.tier) || b.reputation - a.reputation || (a.id < b.id ? -1 : 1));
  let signed = 0;
  for (const club of order) {
    const tier = ctx.tiers.get(club.id) ?? club.tier;
    const current = repo.clubSponsorships(club.id, ctx.start).filter((x) => x.kind !== "broadcast");
    const already = new Set(current.map((x) => x.company));
    const rng = new Rng(seed, `sponsorship/${ctx.season}/${club.id}`);
    const targets = sponsorTargets(club, tier, params, seed);
    const active = [...targets.keys()];
    for (const [kind, target] of targets) {
      let n = current.filter((x) => x.kind === kind).length;
      while (n < target) {
        if (!sign(pool, rng, club, tier, kind, ctx, active, already, undefined, n >= 1, target)) break;
        n++;
        signed++;
      }
    }
  }
  return signed;
}

/**
 * Fim de época: os contratos que acabaram renovam-se com a mesma empresa (se ainda existe e quiser) ao valor de hoje do clube,
 * ou ficam livres para novos patrocinadores. Subir de escalão ajuda a renovar, descer prejudica.
 */
export function renewSponsorships(repo: Repository, data: BaseData, params: Params, ctx: SponsorContext & { previousTiers: ReadonlyMap<string, Tier> }): { renewed: number; lapsed: number } {
  const seed = repo.meta("seed") ?? "?";
  const s = params.companies.sponsorship;
  const pool = makePool(repo, data, params, ctx.start);
  const dayBefore = createDate(Number(ctx.start.slice(0, 4)), 6, 30);
  const expiring = repo.activeSponsorships(dayBefore).filter((x) => x.kind !== "broadcast" && x.end < ctx.start).sort((a, b) => a.id - b.id);
  const clubs = new Map(data.clubs.map((c) => [c.id, c] as const));
  let renewed = 0;
  let lapsed = 0;
  for (const old0 of expiring) {
    if (old0.kind === "broadcast") continue;
    const old = old0 as typeof old0 & { kind: SponsorSlot };
    const club = clubs.get(old.club);
    const company = repo.company(old.company);
    if (!club || !company) continue;
    const tier = ctx.tiers.get(club.id) ?? club.tier;
    const change = TIER_ORDER.indexOf(ctx.previousTiers.get(club.id) ?? tier) - TIER_ORDER.indexOf(tier);
    const p = clamp(s.renewBase + (change > 0 ? s.renewPromoted : change < 0 ? s.renewRelegated : 0), 0.02, 0.98);
    const rng = new Rng(seed, `sponsorship/renew/${ctx.season}/${old.id}`);
    const current = repo.clubSponsorships(club.id, ctx.start).filter((x) => x.kind !== "broadcast");
    const sameKind = current.filter((x) => x.kind === old.kind).length;
    const targets = sponsorTargets(club, tier, params, seed);
    const offered = sameKind < (targets.get(old.kind) ?? 0);
    const already = new Set(current.filter((x) => x.kind !== old.kind || x.company !== old.company).map((x) => x.company));
    if (company.state === "active" && offered && rng.prob(p) && sign(pool, rng, club, tier, old.kind, ctx, [...targets.keys()], already, company, sameKind >= 1, targets.get(old.kind) ?? 1)) {
      renewed++;
    } else {
      lapsed++;
      pool.repo.appendEvent({
        type: "SPONSORSHIP_ENDED", date: ctx.start, season: ctx.season, visibility: "exposed", origin: "generated",
        entities: [{ k: "company", id: company.id, roleKind: "sponsor" }, { k: "club", id: club.id, roleKind: "sponsored" }],
        data: { kind: old.kind, reason: company.state === "closed" ? "closure" : "expired" },
      });
    }
  }
  return { renewed, lapsed };
}
