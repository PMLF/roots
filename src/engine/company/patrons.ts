/**
 * Mecenato (RZ-235, docs/CITY.md §12.5): empresários do concelho do clube do gamer oferecem dinheiro, às vezes em troca de
 * naming (patrocínio do estádio). A proposta chega à caixa de entrada e o gamer aceita ou recusa; a escala da empresa e o escalão do clube
 * definem o valor, a vaidade do dono escolhe o naming.
 */
import { addDays } from "../calendar/dates";
import { annualFixedRevenues, post } from "../club/finances";
import type { Params } from "../config/parameters";
import type { BaseClub } from "../data/types";
import type { Repository } from "../persistence/repository";
import type { IsoDate } from "../persistence/types";
import { Rng } from "../random/rng";
import { SECTOR_INFO, type CompanySector } from "./sectors";

export type PatronCounterpart = "none" | "naming";
export type PatronOffer = {
  id: number; company: string; owner?: string; club: string; amount: number; counterpart: PatronCounterpart; years: number;
  created: IsoDate; expires: IsoDate; status: "pending" | "accepted" | "declined" | "expired";
};

const KEY = "patron.offers";
export const patronOffers = (repo: Repository): PatronOffer[] => JSON.parse(repo.meta(KEY) ?? "[]") as PatronOffer[];
const save = (repo: Repository, list: PatronOffer[]) => repo.setMeta(KEY, JSON.stringify(list));
export const pendingPatrons = (repo: Repository): PatronOffer[] => patronOffers(repo).filter((o) => o.status === "pending");

/** Todos os dias: fecha as vencidas e, às vezes, uma empresa da cidade faz uma proposta (uma de cada vez, com intervalo). */
export function dailyPatrons(repo: Repository, params: Params, gamer: BaseClub, today: IsoDate, season: number): void {
  const cfg = params.companies.city.patron;
  let list = patronOffers(repo);
  if (list.some((o) => o.status === "pending" && o.expires < today)) {
    list = list.map((o) => (o.status === "pending" && o.expires < today ? { ...o, status: "expired" as const } : o));
    save(repo, list);
  }
  if (repo.meta("companies.enabled") !== "1" || list.some((o) => o.status === "pending")) return;
  const last = list.map((o) => o.created).sort().at(-1);
  if (last && addDays(last, cfg.cooldownDays) > today) return;
  const rng = new Rng(repo.meta("seed") ?? "?", `patron/${today}`);
  if (!rng.prob(cfg.dailyChance)) return;
  const companies = repo.companies({ city: gamer.city, state: "active" });
  if (companies.length === 0) return;
  const company = rng.weighted(companies, (c) => SECTOR_INFO[c.sector as CompanySector].visibility * cfg.share[c.scale]);
  const vanity = company.owner ? repo.person(company.owner)?.personality.vanity ?? 10 : 10;
  const slots = params.companies.sponsorship.slots[gamer.tier];
  const freeStadium = slots.includes("stadium") && !repo.clubSponsorships(gamer.id, today).some((s) => s.kind === "stadium");
  const naming = freeStadium && vanity >= 13;
  const base = Math.max(500, Math.round((annualFixedRevenues(gamer, params).sponsorships * cfg.share[company.scale]) / 100) * 100);
  const offer: PatronOffer = {
    id: Math.max(0, ...list.map((o) => o.id)) + 1, company: company.id, ...(company.owner ? { owner: company.owner } : {}), club: gamer.id,
    amount: naming ? Math.round((base * cfg.namingBonus) / 100) * 100 : base, counterpart: naming ? "naming" : "none", years: naming ? cfg.namingYears : 0,
    created: today, expires: addDays(today, cfg.validDays), status: "pending",
  };
  save(repo, [...list, offer]);
  repo.appendEvent({
    type: "PATRON_OFFER", date: today, season, visibility: "exposed", origin: "generated",
    entities: [{ k: "club", id: gamer.id }, { k: "company", id: company.id, roleKind: "company" }, ...(company.owner ? [{ k: "person" as const, id: company.owner, roleKind: "owner" }] : [])],
    data: { offer: offer.id, amount: offer.amount, counterpart: offer.counterpart },
  });
}

/** O gamer aceita ou recusa. Aceitar: o dinheiro entra (doação) ou o contrato de naming do estádio começa. */
export function respondPatron(repo: Repository, gamer: BaseClub, today: IsoDate, id: number, accept: boolean): { ok: boolean } {
  const list = patronOffers(repo);
  const o = list.find((x) => x.id === id && x.status === "pending");
  if (!o || o.club !== gamer.id) return { ok: false };
  if (accept) {
    if (o.counterpart === "naming") repo.addSponsorship({ company: o.company, club: o.club, kind: "stadium", annualValue: o.amount, start: today, end: addDays(today, 365 * o.years) });
    else post(repo, gamer, "donations", o.amount);
  }
  save(repo, list.map((x) => (x.id === id ? { ...x, status: accept ? ("accepted" as const) : ("declined" as const) } : x)));
  return { ok: true };
}
