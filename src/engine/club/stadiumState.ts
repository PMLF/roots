/** Estado do estádio de um clube (RZ-116): setores e obra em curso. À parte de `stadium.ts` para as finanças o poderem ler sem ciclo de imports. */
import { STADIUM_SECTORS, type Params, type StadiumSector } from "../config/parameters";
import type { BaseClub } from "../data/types";
import type { Repository } from "../persistence/repository";
import type { IsoDate } from "../persistence/types";

const key = (club: string) => `stadium.${club}`;

export type StadiumWorks = { /** Ampliação (por omissão) ou cobertura do setor. */ kind?: "expand" | "cover"; sector: StadiumSector; seats: number; cost: number; councilPaid: number; start: IsoDate; end: IsoDate };
export type StadiumState = {
  sectors: Record<StadiumSector, number>;
  works?: StadiumWorks;
  /** Setores cobertos. */
  covered?: Partial<Record<StadiumSector, true>>;
  /** Preço do bilhete por setor, como múltiplo do preço do escalão (1 por omissão). */
  price?: Partial<Record<StadiumSector, number>>;
  /** Estado do relvado, 0-1 (`params.stadium.turf.start` por omissão). */
  turf?: number;
};

export const saveStadium = (repo: Repository, club: string, s: StadiumState): void => repo.setMeta(key(club), JSON.stringify(s));
export const priceOf = (s: StadiumState, sector: StadiumSector): number => s.price?.[sector] ?? 1;
export const turfOf = (s: StadiumState, params: Params): number => s.turf ?? params.stadium.turf.start;

/** Os setores tal como se vendem num jogo em casa deste mês: lugares abertos, preço, cobertura e procura relativa. */
export function sellingSectors(repo: Repository, club: BaseClub, params: Params): { id: StadiumSector; seats: number; price: number; covered: boolean }[] {
  const s = stadiumState(repo, club, params);
  return STADIUM_SECTORS.map((id) => ({ id, seats: s.sectors[id] - (s.works?.kind !== "cover" && s.works?.sector === id ? Math.round(s.sectors[id] * params.stadium.works.closedShare) : 0), price: priceOf(s, id), covered: !!s.covered?.[id] }));
}

/** Capacidade dos dados repartida pelos setores (o resto dos arredondamentos vai para a bancada central). */
export function defaultSectors(capacity: number, params: Params): Record<StadiumSector, number> {
  const sectors = Object.fromEntries(STADIUM_SECTORS.map((s) => [s, Math.round(capacity * params.stadium.split[s])])) as Record<StadiumSector, number>;
  sectors.central += capacity - STADIUM_SECTORS.reduce((t, s) => t + sectors[s], 0);
  return sectors;
}

export function stadiumState(repo: Repository, club: BaseClub, params: Params): StadiumState {
  const raw = repo.meta(key(club.id));
  return raw ? (JSON.parse(raw) as StadiumState) : { sectors: defaultSectors(club.stadium.capacity, params) };
}

export const stadiumTotalOf = (s: StadiumState) => STADIUM_SECTORS.reduce((t, x) => t + s.sectors[x], 0);

/** Lugares disponíveis hoje (com a obra em curso a fechar parte do setor ampliado). */
export function stadiumCapacity(repo: Repository, club: BaseClub, params: Params): number {
  const s = stadiumState(repo, club, params);
  return stadiumTotalOf(s) - (s.works && s.works.kind !== "cover" ? Math.round(s.sectors[s.works.sector] * params.stadium.works.closedShare) : 0);
}


/** Lugares construídos (mesmo com a obra em curso a fechar parte deles): é o que se paga de manutenção. */
export const stadiumTotal = (repo: Repository, club: BaseClub, params: Params): number => stadiumTotalOf(stadiumState(repo, club, params));
