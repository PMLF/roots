/** Sorteios de uma ronda a eliminar (RZ-140): folgas, emparelhamento e quem joga em casa. Puro e determinístico por `Rng`. */
import type { Rng } from "../../random/rng";
import type { DrawRules, Entrant } from "./types";

export type Pair = {
  /** Quem tem a vantagem de jogar em casa (numa só mão joga em casa; em duas, joga a segunda mão em casa). */
  advantage: Entrant;
  other: Entrant;
};

/** Folgas: os de escalão mais alto (e, a igualdade, os de melhor seed e depois ao acaso). Devolve quem joga e quem folga. */
export function pickByes(field: readonly Entrant[], byes: number, rng: Rng): { playing: Entrant[]; byes: Entrant[] } {
  if (byes <= 0) return { playing: [...field], byes: [] };
  const shuffled = rng.shuffle(field);
  const sorted = [...shuffled].sort((a, b) => a.tier - b.tier || a.seed - b.seed);
  const bye = sorted.slice(0, byes);
  const ids = new Set(bye.map((e) => e.club));
  return { playing: shuffled.filter((e) => !ids.has(e.club)), byes: bye };
}

function advantageOf(a: Entrant, b: Entrant, rule: DrawRules["advantage"], rng: Rng): Pair {
  const [first, second] = rng.prob(0.5) ? [a, b] : [b, a];
  if (rule === "lowerTier" && a.tier !== b.tier) return a.tier > b.tier ? { advantage: a, other: b } : { advantage: b, other: a };
  if (rule === "betterSeed" && a.seed !== b.seed) return a.seed < b.seed ? { advantage: a, other: b } : { advantage: b, other: a };
  return { advantage: first, other: second };
}

const sameOrigin = (pairs: readonly [Entrant, Entrant][]) => pairs.filter(([a, b]) => a.origin !== undefined && a.origin === b.origin).length;

/** Emparelha os que jogam (número par). */
export function pairUp(playing: readonly Entrant[], rules: DrawRules, rng: Rng): Pair[] {
  if (playing.length % 2 !== 0) throw new Error(`Draw with ${playing.length} clubs: must be even`);
  const build = (): [Entrant, Entrant][] => {
    const out: [Entrant, Entrant][] = [];
    if (rules.pairing === "random") {
      const s = rng.shuffle(playing);
      for (let i = 0; i < s.length; i += 2) out.push([s[i] as Entrant, s[i + 1] as Entrant]);
    } else {
      const sorted = [...playing].sort((a, b) => a.seed - b.seed || (a.club < b.club ? -1 : 1));
      const n = sorted.length;
      if (rules.pairing === "bracket") for (let i = 0; i < n / 2; i++) out.push([sorted[i] as Entrant, sorted[n - 1 - i] as Entrant]);
      else {
        const seeded = sorted.slice(0, n / 2);
        const unseeded = rng.shuffle(sorted.slice(n / 2));
        for (let i = 0; i < n / 2; i++) out.push([seeded[i] as Entrant, unseeded[i] as Entrant]);
      }
    }
    return out;
  };
  let best = build();
  if (rules.avoidSameOrigin) for (let t = 0; t < 200 && sameOrigin(best) > 0; t++) {
    const c = build();
    if (sameOrigin(c) < sameOrigin(best)) best = c;
  }
  return best.map(([a, b]) => advantageOf(a, b, rules.advantage, rng));
}
