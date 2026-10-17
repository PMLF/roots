import type { Params, Tier } from "../config/parameters";
import type { BaseClub, BaseData } from "../data/types";
import type { Repository } from "../persistence/repository";
import type { IsoDate } from "../persistence/types";
import { agentTraits } from "../agent/assign";
import { clamp } from "../random/rng";
import { currentQuality } from "../world/player";
import type { Attributes, Position } from "../world/types";
import { wageFor } from "./youth";

/** Pedido do jogador (e do agente) para renovar. */
export type RenewalAsk = { wage: number; years: number };
/** Decisão do gamer sobre um contrato a expirar: renovar com estas condições ou deixar sair. */
export type RenewalDecision = { kind: "renew"; wage: number; years: number } | { kind: "release" };

const key = (season: number, person: string) => `renewal.${season}.${person}`;

export function decisionOf(repo: Repository, season: number, person: string): RenewalDecision | undefined {
  const raw = repo.meta(key(season, person));
  return raw ? (JSON.parse(raw) as RenewalDecision) : undefined;
}

export function setDecision(repo: Repository, season: number, person: string, d: RenewalDecision): void {
  repo.setMeta(key(season, person), JSON.stringify(d));
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s.length === 0 ? 1 : (s[Math.floor(s.length / 2)] as number);
}

/** Pedido de renovação: a fórmula do escalão, mais cara com agente ganancioso, e nunca abaixo de 95 % do ordenado atual. */
export function renewalAsk(repo: Repository, data: BaseData, params: Params, club: BaseClub, person: string): RenewalAsk | undefined {
  const j = repo.player(person);
  const ct = repo.contract(person);
  const pos = j?.positions[0]?.pos;
  if (!j || !ct || !pos) return undefined;
  const tier: Tier = club.tier;
  const sameTier = data.clubs.filter((c) => c.tier === tier);
  const wageScale = clamp((club.finances / median(sameTier.map((c) => c.finances))) ** 0.4, 0.4, 2.5);
  const quality = currentQuality(j.attributes as Attributes, pos as Position);
  const ag = agentTraits(repo, j.agent);
  const agentFactor = ag ? 1 + params.market.agents.wageByGreed * (ag.greed - params.market.agents.greedPivot) : 1;
  const formula = wageFor(params, tier, quality, wageScale) * params.squadCycle.contracts.renewalWageFactor * agentFactor;
  const wage = Math.max(50, Math.round(Math.max(formula, ct.monthlyWage * 0.95) / 10) * 10);
  return { wage, years: params.squadCycle.contracts.negotiation.askYears };
}

/** Quanto do pedido o jogador aceita (fração): a lealdade e ser da terra baixam o patamar. */
export function acceptFloor(repo: Repository, params: Params, club: BaseClub, person: string): number {
  const n = params.squadCycle.contracts.negotiation;
  const p = repo.person(person);
  const loyalty = p?.personality.loyalty ?? 10;
  const native = p?.birthCity !== undefined && p.birthCity === club.city;
  return clamp(n.acceptFloor - n.floorByLoyalty * (loyalty - 10) - (native ? n.floorNative : 0), n.floorMin, 1);
}

/** Resposta à oferta do gamer: aceita se chega ao patamar do jogador; senão devolve o pedido. */
export function answerRenewal(repo: Repository, data: BaseData, params: Params, club: BaseClub, person: string, offer: { wage: number; years: number }): { accepted: boolean; ask: RenewalAsk } | undefined {
  const ask = renewalAsk(repo, data, params, club, person);
  if (!ask) return undefined;
  return { accepted: offer.wage >= ask.wage * acceptFloor(repo, params, club, person) && offer.years >= 1, ask };
}

/** Jogadores do clube cujo contrato acaba antes do início da próxima época. */
export function expiringPlayers(repo: Repository, club: string, nextSeasonStart: IsoDate): string[] {
  return repo.clubPlayers(club).filter((j) => (repo.contract(j.person)?.end ?? "9999-12-31") < nextSeasonStart).map((j) => j.person);
}
