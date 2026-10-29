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
import { stadiumState, stadiumTotalOf as total, type StadiumState } from "./stadiumState";
export { defaultSectors, stadiumCapacity, stadiumState, stadiumTotal, stadiumTotalOf, type StadiumState, type StadiumWorks } from "./stadiumState";

const key = (club: string) => `stadium.${club}`;

export type WorksQuote = { cost: number; councilShare: number; clubCost: number; months: number; end: (today: IsoDate) => IsoDate };

export function quoteWorks(params: Params, club: BaseClub, sector: StadiumSector, seats: number): WorksQuote {
  const w = params.stadium.works;
  const cost = Math.round((seats * params.stadium.costPerSeat[sector] * params.stadium.tierCost[club.tier]) / 1000) * 1000;
  const councilShare = params.stadium.councilShare[club.stadium.ownership];
  const months = Math.max(w.minMonths, Math.ceil(seats / w.seatsPerMonth));
  return { cost, councilShare, clubCost: Math.round(cost * (1 - councilShare)), months, end: (today) => addDays(today, months * 30) };
}

export type WorksResult = { ok: true; end: IsoDate; cost: number; clubCost: number } | { ok: false; reason: "ongoing" | "tooSmall" | "tooBig" | "full" | "cash" | "unknown" };

function event(repo: Repository, type: "STADIUM_WORKS_STARTED" | "STADIUM_WORKS_DONE", date: IsoDate, season: number, club: string, data: Record<string, unknown>): void {
  repo.appendEvent({ type, date, season, visibility: "exposed", origin: "generated", entities: [{ k: "club", id: club }], data });
}

export function startWorks(repo: Repository, params: Params, club: BaseClub, sector: StadiumSector, seats: number, today: IsoDate, season: number, o: { ai?: boolean } = {}): WorksResult {
  if (!STADIUM_SECTORS.includes(sector)) return { ok: false, reason: "unknown" };
  const w = params.stadium.works, s = stadiumState(repo, club, params);
  if (s.works) return { ok: false, reason: "ongoing" };
  seats = Math.round(seats);
  if (seats < w.minSeats) return { ok: false, reason: "tooSmall" };
  if (seats > total(s) * w.maxGrowth) return { ok: false, reason: "tooBig" };
  if (total(s) + seats > w.maxCapacity) return { ok: false, reason: "full" };
  const q = quoteWorks(params, club, sector, seats);
  if (clubBalance(repo, club) < (o.ai ? q.clubCost * params.stadium.ai.cashCover : q.clubCost)) return { ok: false, reason: "cash" };
  post(repo, club, "stadium", -q.clubCost);
  const end = q.end(today);
  repo.setMeta(key(club.id), JSON.stringify({ ...s, works: { sector, seats, cost: q.cost, councilPaid: q.cost - q.clubCost, start: today, end } } satisfies StadiumState));
  markActive(repo, club.id);
  event(repo, "STADIUM_WORKS_STARTED", today, season, club.id, { sector, seats, cost: q.cost, councilPaid: q.cost - q.clubCost, end });
  return { ok: true, end, cost: q.cost, clubCost: q.clubCost };
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
    s.sectors[s.works.sector] += s.works.seats;
    repo.setMeta(key(id), JSON.stringify({ sectors: s.sectors }));
    event(repo, "STADIUM_WORKS_DONE", today, season, id, { sector: s.works.sector, seats: s.works.seats, capacity: total(s) });
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
