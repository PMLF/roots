/**
 * Prioridade da terra (RZ-256): os jovens livres da cidade só podem ser contratados por clubes da cidade; quem assinou por um clube da
 * terra fica `localLockDays` dias (meia época) fechado a clubes de outras cidades. Assim a terra tem a primeira escolha do seu talento.
 */
import { addDays } from "../calendar/dates";
import type { Params } from "../config/parameters";
import type { BaseClub } from "../data/types";
import type { Repository } from "../persistence/repository";
import type { IsoDate } from "../persistence/types";

const KEY = "prospects.local";
type Locks = Record<string, IsoDate>;

export const readLocks = (repo: Repository): Locks => {
  const raw = repo.meta(KEY);
  return raw ? (JSON.parse(raw) as Locks) : {};
};

/** Um jovem da terra assinou por um clube da cidade: até esta data só clubes da cidade o podem contratar. */
export function lockLocalSigning(repo: Repository, params: Params, person: string, date: IsoDate): void {
  const locks = readLocks(repo);
  locks[person] = addDays(date, params.squadCycle.youth.prospects.localLockDays);
  repo.setMeta(KEY, JSON.stringify(locks));
}

/** Tira as trancas que já passaram (chamado na passagem de época). */
export function pruneLocks(repo: Repository, today: IsoDate): void {
  const locks = readLocks(repo);
  const kept = Object.fromEntries(Object.entries(locks).filter(([, until]) => until > today));
  repo.setMeta(KEY, JSON.stringify(kept));
}

export type LocalBlock = "prospect" | "locked";

/**
 * Pode `buyer` contratar este jogador? `prospect`: jovem livre da terra e o comprador é de outra cidade; `locked`: assinou há menos de meia
 * época por um clube da terra e o comprador é de outra cidade. Sem bloqueio devolve `undefined`.
 */
export function localBlock(repo: Repository, person: string, buyer: Pick<BaseClub, "city">, today: IsoDate, locks: Locks = readLocks(repo)): LocalBlock | undefined {
  const home = repo.person(person)?.birthCity;
  if (!home || home === buyer.city) return undefined;
  return localBlockWith(person, home, repo.player(person)?.state, buyer, today, locks);
}

/** Como `localBlock`, mas com a terra e o estado já lidos (para filtrar milhares de candidatos sem uma consulta por cada um). */
export function localBlockWith(person: string, home: string | undefined, state: string | undefined, buyer: Pick<BaseClub, "city">, today: IsoDate, locks: Locks): LocalBlock | undefined {
  if (!home || home === buyer.city) return undefined;
  if (state === "prospect") return "prospect";
  const until = locks[person];
  return until !== undefined && today < until ? "locked" : undefined;
}
