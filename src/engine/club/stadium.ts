/**
 * Estádio (RZ-116): a capacidade dos dados reparte-se por quatro setores (central, lateral, topo norte e topo sul) e o clube pode
 * encomendar uma obra de ampliação num setor, com custo, prazo e comparticipação da Câmara nos estádios municipais. Durante a obra
 * parte do setor fica fechada; no fim os lugares novos abrem. Os clubes do computador ampliam por regra simples no fim da época.
 * O estado só se guarda quando algo muda (meta `stadium.<clube>`); sem ele vale a capacidade dos dados.
 */
import { Rng, clamp } from "../random/rng";
import { STADIUM_SECTORS, type Params, type StadiumSector, type Tier } from "../config/parameters";
import type { BaseClub, BaseData } from "../data/types";
import type { Repository } from "../persistence/repository";
import type { IsoDate } from "../persistence/types";
import { addDays } from "../calendar/dates";
import { clubBalance, factorReputation, post } from "./finances";
import { saveStadium, stadiumState, stadiumTotalOf as total, turfOf } from "./stadiumState";
export { priceOf, sellingSectors, turfOf, defaultSectors, stadiumCapacity, stadiumState, stadiumTotal, stadiumTotalOf, type StadiumState, type StadiumWorks } from "./stadiumState";

export type WorksQuote = { cost: number; councilShare: number; clubCost: number; months: number; end: (today: IsoDate) => IsoDate };

export function quoteWorks(params: Params, club: BaseClub, sector: StadiumSector, seats: number, kind: "expand" | "cover" = "expand", sectorSeats = 0): WorksQuote {
  const w = params.stadium.works, pr = params.stadium.pricing;
  const tier = params.stadium.tierCost[club.tier];
  const terrain = 1 + w.terrainPenalty * (1 - clamp(club.stadium.location.expansionTerrain, 0, 100) / 100);
  const raw = kind === "cover" ? sectorSeats * pr.coverCostPerSeat * tier : seats * params.stadium.costPerSeat[sector] * tier * terrain;
  const cost = Math.round(raw / 1000) * 1000;
  const councilShare = params.stadium.councilShare[club.stadium.ownership];
  const months = kind === "cover" ? pr.coverMonths : Math.max(w.minMonths, Math.ceil(seats / w.seatsPerMonth));
  return { cost, councilShare, clubCost: Math.round(cost * (1 - councilShare)), months, end: (today) => addDays(today, months * 30) };
}

export type WorksResult = { ok: true; end: IsoDate; cost: number; clubCost: number } | { ok: false; reason: "ongoing" | "covered" | "tooSmall" | "tooBig" | "full" | "cash" | "unknown" };

function event(repo: Repository, type: "STADIUM_WORKS_STARTED" | "STADIUM_WORKS_DONE", date: IsoDate, season: number, club: string, data: Record<string, unknown>): void {
  repo.appendEvent({ type, date, season, visibility: "exposed", origin: "generated", entities: [{ k: "club", id: club }], data });
}

export function startWorks(repo: Repository, params: Params, club: BaseClub, sector: StadiumSector, seats: number, today: IsoDate, season: number, o: { ai?: boolean; kind?: "expand" | "cover" } = {}): WorksResult {
  if (!STADIUM_SECTORS.includes(sector)) return { ok: false, reason: "unknown" };
  const w = params.stadium.works, s = stadiumState(repo, club, params);
  if (s.works) return { ok: false, reason: "ongoing" };
  const kind = o.kind ?? "expand";
  seats = kind === "cover" ? 0 : Math.round(seats);
  if (kind === "cover") { if (s.covered?.[sector]) return { ok: false, reason: "covered" }; }
  else {
    if (seats < w.minSeats) return { ok: false, reason: "tooSmall" };
    if (seats > total(s) * w.maxGrowth) return { ok: false, reason: "tooBig" };
    if (total(s) + seats > w.maxCapacity) return { ok: false, reason: "full" };
  }
  const q = quoteWorks(params, club, sector, seats, kind, s.sectors[sector]);
  // clubes do computador: a Câmara paga a sua parte logo; o gamer paga tudo e pede a comparticipação à parte (ver `makeStadiumRequest`)
  const mine = o.ai ? q.clubCost : q.cost;
  if (clubBalance(repo, club) < (o.ai ? mine * params.stadium.ai.cashCover : mine)) return { ok: false, reason: "cash" };
  post(repo, club, "stadium", -mine);
  const end = q.end(today);
  saveStadium(repo, club.id, { ...s, works: { kind, sector, seats, cost: q.cost, councilPaid: o.ai ? q.cost - q.clubCost : 0, start: today, end } });
  markActive(repo, club.id);
  event(repo, "STADIUM_WORKS_STARTED", today, season, club.id, { kind, sector, seats, cost: q.cost, councilPaid: o.ai ? q.cost - q.clubCost : 0, end });
  return { ok: true, end, cost: q.cost, clubCost: mine };
}

/** Abre os lugares novos das obras que chegaram ao fim. Corre todos os dias (só toca nos clubes com obra). */
export function dailyStadium(repo: Repository, data: BaseData, params: Params, today: IsoDate, season: number): void {
  const raw = repo.meta("stadium.active");
  if (!raw) return;
  const active = JSON.parse(raw) as string[];
  const left: string[] = [];
  for (const id of active) {
    const club = data.clubs.find((c) => c.id === id);
    if (!club) continue;
    const s = stadiumState(repo, club, params);
    if (!s.works) continue;
    if (s.works.end > today) { left.push(id); continue; }
    const done = s.works;
    if (done.kind === "cover") s.covered = { ...s.covered, [done.sector]: true };
    else s.sectors[done.sector] += done.seats;
    delete s.works;
    saveStadium(repo, id, s);
    event(repo, "STADIUM_WORKS_DONE", today, season, id, { kind: done.kind ?? "expand", sector: done.sector, seats: done.seats, capacity: total(s) });
  }
  repo.setMeta("stadium.active", JSON.stringify(left));
}

/** Regista o clube como tendo obra (para o ciclo diário só olhar para estes). */
export function markActive(repo: Repository, club: string): void {
  const list = JSON.parse(repo.meta("stadium.active") ?? "[]") as string[];
  if (!list.includes(club)) repo.setMeta("stadium.active", JSON.stringify([...list, club]));
}

/**
 * Fim de época: os clubes do computador cujo estádio costuma estar cheio (ocupação típica do escalão × valor do clube) podem
 * encomendar uma ampliação num setor (os topos primeiro), se tiverem caixa para o custo com folga.
 */
export function aiStadiums(repo: Repository, data: BaseData, params: Params, season: number, today: IsoDate, tiers: ReadonlyMap<string, Tier>, gamerClub?: string): void {
  summerTurf(repo, data, params, gamerClub);
  const cfg = params.stadium.ai, m = params.finances.model;
  for (const club of data.clubs) {
    if (club.id === gamerClub) continue;
    const tier = tiers.get(club.id) ?? club.tier;
    const occupancy = m.occupancy[tier] * factorReputation({ ...club, tier }, params) ** 0.5;
    if (occupancy < cfg.occupancy) continue;
    const rng = new Rng(repo.meta("seed") ?? "?", `stadium/ai/${season}/${club.id}`);
    if (!rng.prob(cfg.probability)) continue;
    const s = stadiumState(repo, club, params);
    const sector = (["north", "south", "side", "central"] as const)[rng.integer(0, 3)]!;
    startWorks(repo, params, { ...club, tier }, sector, clamp(Math.round((total(s) * cfg.growth) / 100) * 100, params.stadium.works.minSeats, total(s) * params.stadium.works.maxGrowth), today, season, { ai: true });
  }
}

// --- relvado, preço e ocupação ---

/** Cada jogo em casa gasta o relvado do clube do gamer (mais no inverno); os outros clubes mantêm o valor inicial. */
export function wearTurf(repo: Repository, club: BaseClub, params: Params, month: number): void {
  if (repo.meta("gamer.club") !== club.id) return;
  const t = params.stadium.turf, s = stadiumState(repo, club, params);
  const value = Math.max(0, turfOf(s, params) - t.wearPerMatch * (t.winterMonths.includes(month) ? t.winter : 1));
  saveStadium(repo, club.id, { ...s, turf: Math.round(value * 1000) / 1000 });
}

export type TurfResult = { ok: true; turf: number; cost: number } | { ok: false; reason: "cash" | "perfect" };

/** O gamer trata o relvado (ganho pequeno, barato) ou substitui-o (fica quase perfeito, caro). */
export function treatTurf(repo: Repository, params: Params, club: BaseClub, kind: "treat" | "replace"): TurfResult {
  const t = params.stadium.turf, s = stadiumState(repo, club, params), now = turfOf(s, params);
  const target = kind === "treat" ? Math.min(1, now + t.treatGain) : t.replaceTo;
  if (target <= now + 0.001) return { ok: false, reason: "perfect" };
  const cost = Math.round(((kind === "treat" ? t.treatCost : t.replaceCost) * params.stadium.tierCost[club.tier]) / 100) * 100;
  if (clubBalance(repo, club) < cost) return { ok: false, reason: "cash" };
  post(repo, club, "stadium", -cost);
  saveStadium(repo, club.id, { ...s, turf: Math.round(target * 1000) / 1000 });
  return { ok: true, turf: target, cost };
}

export function turfCosts(params: Params, club: BaseClub): { treat: number; replace: number } {
  const f = params.stadium.tierCost[club.tier], t = params.stadium.turf;
  return { treat: Math.round((t.treatCost * f) / 100) * 100, replace: Math.round((t.replaceCost * f) / 100) * 100 };
}

/** Preço do bilhete de um setor (múltiplo do preço do escalão), dentro dos limites. */
export function setSectorPrice(repo: Repository, params: Params, club: BaseClub, sector: StadiumSector, price: number): number {
  const p = params.stadium.pricing, s = stadiumState(repo, club, params);
  const value = Math.round(clamp(price, p.min, p.max) * 100) / 100;
  saveStadium(repo, club.id, { ...s, price: { ...s.price, [sector]: value } });
  return value;
}

/** Ocupação de cada setor no último jogo em casa (para a planta). */
export function recordFill(repo: Repository, club: string, bySector: Partial<Record<StadiumSector, number>>): void {
  repo.setMeta(`stadium.fill.${club}`, JSON.stringify(bySector));
}
export const lastFill = (repo: Repository, club: string): Partial<Record<StadiumSector, number>> => JSON.parse(repo.meta(`stadium.fill.${club}`) ?? "{}") as Partial<Record<StadiumSector, number>>;

/** Pausa de verão: o relvado do clube do gamer recupera até ao valor normal (o que passar disso fica). */
export function summerTurf(repo: Repository, data: BaseData, params: Params, gamerClub?: string): void {
  const club = data.clubs.find((c) => c.id === gamerClub);
  if (!club) return;
  const s = stadiumState(repo, club, params), now = turfOf(s, params);
  if (now < params.stadium.turf.start) saveStadium(repo, club.id, { ...s, turf: params.stadium.turf.start });
}
