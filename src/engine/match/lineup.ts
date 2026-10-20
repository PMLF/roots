/**
 * Onze escolhido pelo gamer (RZ-248): funções puras sobre as posições da formação. O onze pode estar incompleto enquanto o gamer
 * o monta; o motor nunca o completa por ele no ecrã (só em simulações sem interface). Usado pelo motor e pela interface.
 */
import type { Position } from "../world/types";
import { FORMATIONS } from "./formations";
import type { FormationId } from "./types";

export type Slot = { player: string; position: Position };

/** Quantos suplentes se convocam. */
export const BENCH_SIZE = 7;

/** As posições da formação ainda por preencher, dadas as já ocupadas (por contagem). */
export function missingPositions(formation: FormationId, taken: readonly Position[]): Position[] {
  const rest = [...taken];
  const out: Position[] = [];
  for (const p of FORMATIONS[formation]) {
    const i = rest.indexOf(p);
    if (i >= 0) rest.splice(i, 1);
    else out.push(p);
  }
  return out;
}

/** O onze noutra formação: cada jogador fica numa posição igual à que tinha, se a nova formação a tiver; os outros saem (ficam por escolher). */
export function remapLineup(lineup: readonly Slot[], to: FormationId): Slot[] {
  const free = [...FORMATIONS[to]];
  const out: Slot[] = [];
  for (const s of lineup) {
    const i = free.indexOf(s.position);
    if (i < 0) continue;
    free.splice(i, 1);
    out.push(s);
  }
  return out;
}

/** O que o gamer monta no ecrã de táticas: 11 lugares (pela ordem da formação) e o banco. O resto do plantel são os reservas. */
export type Board = { slots: (string | undefined)[]; bench: string[] };

const without = (b: Board, player: string): Board => ({ slots: b.slots.map((p) => (p === player ? undefined : p)), bench: b.bench.filter((p) => p !== player) });
const where = (b: Board, player: string): { zone: "slot"; index: number } | { zone: "bench" } | { zone: "reserve" } => {
  const i = b.slots.indexOf(player);
  return i >= 0 ? { zone: "slot", index: i } : b.bench.includes(player) ? { zone: "bench" } : { zone: "reserve" };
};

/** Põe o jogador num lugar do onze. Quem lá estava vai para onde o jogador estava (troca de lugar, banco ou reservas). */
export function moveToSlot(b: Board, player: string, index: number): Board {
  const occupant = b.slots[index];
  if (occupant === player) return b;
  const from = where(b, player);
  const next = without(b, player);
  const slots = [...next.slots];
  slots[index] = player;
  let bench = next.bench;
  if (occupant !== undefined) {
    if (from.zone === "slot") slots[from.index] = occupant;
    else if (from.zone === "bench") bench = [...bench, occupant];
  }
  return { slots, bench };
}

/** Convoca o jogador para o banco; devolve `undefined` se o banco já está cheio. */
export function moveToBench(b: Board, player: string): Board | undefined {
  if (b.bench.includes(player)) return b;
  if (b.bench.length >= BENCH_SIZE) return undefined;
  const next = without(b, player);
  return { slots: next.slots, bench: [...next.bench, player] };
}

/** Tira o jogador do onze e do banco: fica nos reservas. */
export function moveToReserve(b: Board, player: string): Board {
  return without(b, player);
}

/** Troca dois jogadores de sítio (lugar, banco ou reservas): quem larga por cima de outro fica com o lugar dele, e o outro vai para onde estava (ou para os reservas). */
export function swapPlayers(b: Board, a: string, c: string): Board {
  const sw = (p: string) => (p === a ? c : p === c ? a : p);
  return { slots: b.slots.map((p) => (p === undefined ? p : sw(p))), bench: b.bench.map(sw) };
}
