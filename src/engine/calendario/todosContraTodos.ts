/**
 * Todos contra todos pelo método do círculo (RZ-102), com casa/fora equilibrado.
 * - Número par de clubes: n−1 rondas por volta. Ímpar: n rondas e um clube de folga em cada.
 * - Casa/fora alternado: ninguém joga mais de 2 jogos seguidos em casa ou fora numa volta.
 * - Na 2.ª volta repetem-se os jogos com o campo trocado; as duas primeiras rondas da 2.ª volta
 *   trocam de ordem para que também não haja 3 seguidos na passagem de uma volta para a outra.
 */
import type { Rng } from "../aleatorio/rng";

export type Duelo = { casa: string; fora: string };
export type Ronda = { jogos: Duelo[]; folga?: string };

export function todosContraTodos(clubes: readonly string[], voltas: 1 | 2, rng: Rng): Ronda[] {
  if (clubes.length < 2) throw new Error("É preciso pelo menos 2 clubes");
  if (new Set(clubes).size !== clubes.length) throw new Error("Clubes repetidos");
  // ordem aleatória (mas determinística) para que cada seed dê jornadas diferentes
  const base: (string | null)[] = rng.baralhar(clubes);
  if (base.length % 2 === 1) base.push(null); // null = folga
  const n = base.length;
  const t = base.map((_, i) => i);
  const primeira: Ronda[] = [];
  for (let r = 0; r < n - 1; r++) {
    const ronda: Ronda = { jogos: [] };
    for (let i = 0; i < n / 2; i++) {
      const a = t[i] as number;
      const b = t[n - 1 - i] as number;
      const aEmCasa = i === 0 ? r % 2 === 0 : i % 2 === 0;
      const [h, v] = aEmCasa ? [a, b] : [b, a];
      const casa = base[h] ?? null;
      const fora = base[v] ?? null;
      if (casa === null || fora === null) ronda.folga = (casa ?? fora) as string;
      else ronda.jogos.push({ casa, fora });
    }
    primeira.push(ronda);
    t.splice(0, 0, t.splice(n - 2, 1)[0] as number); // roda todos menos o último
  }
  if (voltas === 1) return primeira;
  const espelho: Ronda[] = primeira.map((r) => ({
    jogos: r.jogos.map((j) => ({ casa: j.fora, fora: j.casa })),
    ...(r.folga !== undefined ? { folga: r.folga } : {}),
  }));
  if (espelho.length > 2) [espelho[0], espelho[1]] = [espelho[1] as Ronda, espelho[0] as Ronda];
  return [...primeira, ...espelho];
}

/** Maior sequência de jogos seguidos em casa ou fora de cada clube (as folgas não interrompem). */
export function maiorSequenciaCasaFora(rondas: readonly Ronda[]): Map<string, number> {
  const ultimo = new Map<string, { casa: boolean; corrida: number }>();
  const maximo = new Map<string, number>();
  for (const r of rondas)
    for (const j of r.jogos)
      for (const [clube, casa] of [[j.casa, true], [j.fora, false]] as const) {
        const u = ultimo.get(clube);
        const corrida = u && u.casa === casa ? u.corrida + 1 : 1;
        ultimo.set(clube, { casa, corrida });
        maximo.set(clube, Math.max(maximo.get(clube) ?? 0, corrida));
      }
  return maximo;
}
