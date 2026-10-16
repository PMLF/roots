/**
 * Todos contra todos pelo método do círculo (RZ-102), com casa/fora equilibrado.
 * - Número par de clubes: n−1 rondas por volta. Ímpar: n rondas e um clube de folga em cada.
 * - Casa/fora alternado: ninguém joga mais de 2 jogos seguidos em casa ou fora numa volta.
 * - Na 2.ª volta repetem-se os jogos com o campo trocado; as duas primeiras rondas da 2.ª volta
 *   trocam de ordem para que também não haja 3 seguidos na passagem de uma volta para a outra.
 */
import type { Rng } from "../random/rng";

export type Duel = { home: string; away: string };
export type Round = { matches: Duel[]; bye?: string };

export function allAgainstAll(clubs: readonly string[], legs: 1 | 2, rng: Rng): Round[] {
  if (clubs.length < 2) throw new Error("É preciso pelo menos 2 clubes");
  if (new Set(clubs).size !== clubs.length) throw new Error("Clubes repetidos");
  // ordem aleatória (mas determinística) para que cada seed dê jornadas diferentes
  const base: (string | null)[] = rng.shuffle(clubs);
  if (base.length % 2 === 1) base.push(null); // null = folga
  const n = base.length;
  const t = base.map((_, i) => i);
  const first: Round[] = [];
  for (let r = 0; r < n - 1; r++) {
    const round: Round = { matches: [] };
    for (let i = 0; i < n / 2; i++) {
      const a = t[i] as number;
      const b = t[n - 1 - i] as number;
      const atHome = i === 0 ? r % 2 === 0 : i % 2 === 0;
      const [h, v] = atHome ? [a, b] : [b, a];
      const home = base[h] ?? null;
      const away = base[v] ?? null;
      if (home === null || away === null) round.bye = (home ?? away) as string;
      else round.matches.push({ home, away });
    }
    first.push(round);
    t.splice(0, 0, t.splice(n - 2, 1)[0] as number); // roda todos menos o último
  }
  if (legs === 1) return first;
  const mirror: Round[] = first.map((r) => ({
    matches: r.matches.map((j) => ({ home: j.away, away: j.home })),
    ...(r.bye !== undefined ? { bye: r.bye } : {}),
  }));
  if (mirror.length > 2) [mirror[0], mirror[1]] = [mirror[1] as Round, mirror[0] as Round];
  return [...first, ...mirror];
}

/** Maior sequência de jogos seguidos em casa ou fora de cada clube (as folgas não interrompem). */
export function largerAwayHomeSequence(pairings: readonly Round[]): Map<string, number> {
  const last = new Map<string, { home: boolean; run: number }>();
  const max = new Map<string, number>();
  for (const r of pairings)
    for (const j of r.matches)
      for (const [club, home] of [[j.home, true], [j.away, false]] as const) {
        const u = last.get(club);
        const run = u && u.home === home ? u.run + 1 : 1;
        last.set(club, { home, run });
        max.set(club, Math.max(max.get(club) ?? 0, run));
      }
  return max;
}
