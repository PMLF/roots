/**
 * Classificação com desempates (RZ-110; docs/DESIGN_RULES.md §1). Pura: recebe as linhas (que já trazem os ajustes de
 * sanções retroativas) e os jogos, e ordena segundo a lista de critérios da competição.
 *
 * Confronto direto: entre os clubes empatados, contam só os jogos entre eles (pontos, diferença e golos marcados).
 * Se isso separa o grupo em partes, o critério volta a aplicar-se a cada parte que continue empatada (ex.: de 3 empatados,
 * um fica à frente e os outros dois voltam a medir-se só entre si). Se não separa ninguém, passa-se ao critério seguinte.
 */
import { Rng } from "../random/rng";
import type { Criterion } from "../config/parameters";
import type { StandingsLine } from "../persistence/types";

export type ResultMatch = { home: string; away: string; homeGoals: number; awayGoals: number };

export type SortedLine = StandingsLine & {
  position: number;
  difference: number;
  /** Se esteve empatado em pontos com outro clube: o critério que por fim o separou. */
  tiebreakPer?: Criterion;
};

export type StandingsContext = {
  winPoints: number;
  drawPoints: number;
  seed: string;
  competition: string;
  season: number;
  /** Reputação dos clubes (para `reputacaoMenor`). */
  reputation?: ReadonlyMap<string, number>;
  /** Clubes da competição que ainda não jogaram: entram a zeros. */
  clubs?: readonly string[];
};

const emptyLine = (club: string): StandingsLine => ({ club, matches: 0, wins: 0, draws: 0, losses: 0, scoredGoals: 0, concededGoals: 0, matchesPoints: 0, adjustment: 0, points: 0 });

type Mini = { points: number; difference: number; goals: number };

function tableMini(group: readonly string[], matches: readonly ResultMatch[], ctx: StandingsContext): Map<string, Mini> {
  const m = new Map<string, Mini>(group.map((c) => [c, { points: 0, difference: 0, goals: 0 }]));
  for (const j of matches) {
    const a = m.get(j.home);
    const b = m.get(j.away);
    if (!a || !b) continue;
    a.goals += j.homeGoals;
    b.goals += j.awayGoals;
    a.difference += j.homeGoals - j.awayGoals;
    b.difference += j.awayGoals - j.homeGoals;
    if (j.homeGoals > j.awayGoals) a.points += ctx.winPoints;
    else if (j.homeGoals < j.awayGoals) b.points += ctx.winPoints;
    else {
      a.points += ctx.drawPoints;
      b.points += ctx.drawPoints;
    }
  }
  return m;
}

/** Parte um grupo em subgrupos por ordem decrescente de uma chave (vetor comparado por ordem lexicográfica). */
function split(group: readonly string[], rowKey: (c: string) => number[]): string[][] {
  const sorted = [...group].sort((x, y) => {
    const a = rowKey(x);
    const b = rowKey(y);
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return (b[i] as number) - (a[i] as number);
    return x < y ? -1 : x > y ? 1 : 0;
  });
  const parts: string[][] = [];
  let previous: number[] | undefined;
  for (const c of sorted) {
    const k = rowKey(c);
    if (previous && k.every((v, i) => v === previous?.[i])) (parts.at(-1) as string[]).push(c);
    else parts.push([c]);
    previous = k;
  }
  return parts;
}

export function sortStandings(lines: readonly StandingsLine[], matches: readonly ResultMatch[], criteria: readonly Criterion[], ctx: StandingsContext): SortedLine[] {
  const byClub = new Map<string, StandingsLine>(lines.map((l) => [l.club, l]));
  for (const c of ctx.clubs ?? []) if (!byClub.has(c)) byClub.set(c, emptyLine(c));
  const line = (c: string) => byClub.get(c) as StandingsLine;
  const diff = (c: string) => line(c).scoredGoals - line(c).concededGoals;
  const tiebreakPer = new Map<string, Criterion>();
  const lottery = (c: string) => new Rng(ctx.seed, `classificacao/${ctx.competition}/${ctx.season}/${c}`).float();

  const resolve = (group: string[], idx: number): string[] => {
    if (group.length <= 1) return group;
    const criterion = criteria[idx];
    if (criterion === undefined) return [...group].sort(); // nunca devia chegar cá: o último critério desempata sempre
    let parts: string[][];
    if (criterion === "headToHead") {
      const mini = tableMini(group, matches, ctx);
      parts = split(group, (c) => {
        const m = mini.get(c) as Mini;
        return [m.points, m.difference, m.goals];
      });
      if (parts.length > 1 && idx > 0) for (const c of group) tiebreakPer.set(c, criterion);
      // um confronto direto que separa o grupo reaplica-se a cada parte que continue empatada
      return parts.flatMap((p) => (parts.length > 1 && p.length > 1 ? resolve(p, idx) : resolve(p, idx + 1)));
    }
    const rowKey: Record<Exclude<Criterion, "headToHead">, (c: string) => number[]> = {
      points: (c) => [line(c).points],
      difference: (c) => [diff(c)],
      scoredGoals: (c) => [line(c).scoredGoals],
      wins: (c) => [line(c).wins],
      smallerReputation: (c) => [-(ctx.reputation?.get(c) ?? 0)],
      lottery: (c) => [lottery(c)],
    };
    parts = split(group, rowKey[criterion]);
    if (parts.length > 1 && idx > 0) for (const c of group) tiebreakPer.set(c, criterion);
    return parts.flatMap((p) => resolve(p, idx + 1));
  };

  const order = resolve([...byClub.keys()], 0);
  return order.map((c, i) => {
    const l = line(c);
    const por = tiebreakPer.get(c);
    return { ...l, position: i + 1, difference: diff(c), ...(por ? { tiebreakPer: por } : {}) };
  });
}
