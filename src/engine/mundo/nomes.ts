/** Geração de nomes por família linguística (RZ-132). Determinística e sem colisões com pessoas conhecidas. */
import type { Rng } from "../aleatorio/rng";
import { isBlocked, BLOCK_LIST } from "./bloqueio";
import { LISTS, type ListNames } from "./listas";

export type Name = { own: string[]; surnames: string[]; full: string; sporting: string };

/** Escolha enviesada para o início da lista (os nomes mais comuns saem mais vezes). */
function common(rng: Rng, xs: readonly string[], exclude: readonly string[] = []): string {
  for (let i = 0; i < 12; i++) {
    const x = xs[Math.min(xs.length - 1, Math.floor(xs.length * rng.float() ** 1.7))] as string;
    if (!exclude.includes(x)) return x;
  }
  return xs.find((x) => !exclude.includes(x)) ?? (xs[0] as string);
}

function assemble(rng: Rng, l: ListNames): Name {
  const own = [common(rng, l.own)];
  const surnames: string[] = [];
  if (l.style === "pt") {
    if (rng.prob(0.3)) own.push(common(rng, l.own, own));
    surnames.push(common(rng, l.surnames));
    if (rng.prob(0.65)) surnames.push(common(rng, l.surnames, surnames));
    return { own, surnames, full: [...own, ...surnames].join(" "), sporting: `${own[0]} ${surnames[surnames.length - 1]}` };
  }
  if (l.style === "es") {
    if (rng.prob(0.15)) own.push(common(rng, l.own, own));
    surnames.push(common(rng, l.surnames), common(rng, l.surnames));
    return { own, surnames, full: [...own, ...surnames].join(" "), sporting: `${own[0]} ${surnames[0]}` };
  }
  surnames.push(common(rng, l.surnames));
  const name = `${own[0]} ${surnames[0]}`;
  return { own, surnames, full: name, sporting: name };
}

export const namesFamilies = (): string[] => Object.keys(LISTS);

/** Gera um nome da família dada; repete se coincidir com a lista de bloqueio. */
export function generateName(rng: Rng, family: string, block: ReadonlySet<string> = BLOCK_LIST): Name {
  const l = LISTS[family];
  if (!l) throw new Error(`Família de nomes desconhecida: ${family}`);
  for (let i = 0; i < 30; i++) {
    const n = assemble(rng, l);
    const firstLast = `${n.own[0]} ${n.surnames[n.surnames.length - 1]}`;
    if (![n.full, n.sporting, firstLast].some((x) => isBlocked(x, block))) return n;
  }
  throw new Error(`Não foi possível gerar um nome livre de bloqueio para ${family}`);
}
