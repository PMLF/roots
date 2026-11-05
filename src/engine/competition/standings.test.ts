import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS as P, validateParameters } from "../config/parameters";
import type { StandingsLine } from "../persistence/types";
import { sortStandings, type StandingsContext, type ResultMatch } from "./standings";

const ctx: StandingsContext = { winPoints: 3, drawPoints: 1, seed: "s", competition: "PL", season: 1 };
const j = (home: string, away: string, homeGoals: number, awayGoals: number): ResultMatch => ({ home, away, homeGoals, awayGoals });

/** Constrói as linhas a partir dos jogos (como faz a derivada do repositório). */
function lines(matches: ResultMatch[], adjustments: Record<string, number> = {}): StandingsLine[] {
  const m = new Map<string, StandingsLine>();
  const l = (c: string) => m.get(c) ?? m.set(c, { club: c, matches: 0, wins: 0, draws: 0, losses: 0, scoredGoals: 0, concededGoals: 0, matchesPoints: 0, adjustment: adjustments[c] ?? 0, points: 0 }).get(c)!;
  for (const x of matches) {
    const a = l(x.home), b = l(x.away);
    a.matches++; b.matches++;
    a.scoredGoals += x.homeGoals; a.concededGoals += x.awayGoals;
    b.scoredGoals += x.awayGoals; b.concededGoals += x.homeGoals;
    if (x.homeGoals > x.awayGoals) { a.wins++; b.losses++; a.matchesPoints += 3; }
    else if (x.homeGoals < x.awayGoals) { b.wins++; a.losses++; b.matchesPoints += 3; }
    else { a.draws++; b.draws++; a.matchesPoints++; b.matchesPoints++; }
  }
  for (const v of m.values()) v.points = v.matchesPoints + v.adjustment;
  return [...m.values()];
}
const order = (js: ResultMatch[], crit = P.tiebreak.league, extra: Partial<StandingsContext> = {}, adjustments: Record<string, number> = {}) =>
  sortStandings(lines(js, adjustments), js, crit, { ...ctx, ...extra }).map((l) => l.club);

describe("classificação e desempates", () => {
  it("os parâmetros de desempate são válidos", () => {
    expect(validateParameters(P)).toEqual([]);
    expect(validateParameters({ ...P, tiebreak: { ...P.tiebreak, league: ["difference", "points"] } })).not.toEqual([]);
    expect(validateParameters({ ...P, tiebreak: { ...P.tiebreak, league: ["points", "difference"] } })).not.toEqual([]); // sem desempate final
  });

  it("ordena por pontos; posições 1..n", () => {
    const js = [j("A", "B", 1, 0), j("B", "C", 2, 0), j("C", "A", 0, 3)];
    const t = sortStandings(lines(js), js, P.tiebreak.league, ctx);
    expect(t.map((l) => l.club)).toEqual(["A", "B", "C"]);
    expect(t.map((l) => l.position)).toEqual([1, 2, 3]);
    expect(t[0]?.difference).toBe(4);
    expect(t.every((l) => l.tiebreakPer === undefined)).toBe(true);
  });

  it("os ajustes (sanções) contam nos pontos", () => {
    const js = [j("A", "B", 1, 0), j("B", "C", 2, 0), j("C", "A", 0, 3)];
    expect(order(js, P.tiebreak.league, {}, { A: -4 })).toEqual(["B", "A", "C"]);
  });

  it("confronto direto antes da diferença de golos", () => {
    // A e B terminam com 3 pontos; B tem melhor diferença de golos, mas A ganhou o jogo entre os dois
    const js = [j("A", "B", 1, 0), j("Z", "A", 1, 0), j("B", "Y", 5, 0), j("Z", "Q", 1, 0)];
    const t = sortStandings(lines(js), js, P.tiebreak.league, ctx);
    const A = t.find((l) => l.club === "A")!, B = t.find((l) => l.club === "B")!;
    expect(A.points).toBe(B.points);
    expect(B.difference).toBeGreaterThan(A.difference);
    expect(t.findIndex((l) => l.club === "A")).toBeLessThan(t.findIndex((l) => l.club === "B"));
    expect(A.tiebreakPer).toBe("headToHead");
    // sem confronto direto na lista, ganha a diferença
    expect(order(js, ["points", "difference", "scoredGoals", "lottery"]).indexOf("B")).toBeLessThan(order(js, ["points", "difference", "scoredGoals", "lottery"]).indexOf("A"));
  });

  it("de três empatados, o confronto direto reaplica-se aos que continuam empatados", () => {
    // mini-liga A, B, C, todos com 3 pontos entre si (A>B, B>C, C>A); mas com diferenças de golos entre si
    // A 2-0 B, B 1-0 C, C 1-0 A → A: 3 pts dif +1; B: 3 pts dif -1; C: 3 pts dif 0 → A, C, B
    const js = [j("A", "B", 2, 0), j("B", "C", 1, 0), j("C", "A", 1, 0)];
    expect(order(js)).toEqual(["A", "C", "B"]);
    // mini-liga em que um fica à frente e os outros dois se medem só entre si
    // D bate E, F e E empatam; D 1-0 E, D 1-0 F, E 2-1 F, mas F-D e E-D ... usar jogo de ida e volta
    const js2 = [j("D", "E", 1, 0), j("D", "F", 1, 0), j("E", "D", 0, 0), j("F", "D", 0, 0), j("E", "F", 3, 0), j("F", "E", 1, 0)];
    const t = order(js2);
    expect(t[0]).toBe("D");
  });

  it("empate total em golos e pontos entre os dois: diferença global, golos marcados, vitórias, depois sorteio estável", () => {
    // A e B com o mesmo registo exato em tudo, sem jogos entre si
    const js = [j("A", "X", 1, 0), j("B", "Y", 1, 0)];
    const a = order(js, ["points", "headToHead", "difference", "scoredGoals", "wins", "lottery"]);
    expect(a.slice(0, 2).sort()).toEqual(["A", "B"]);
    // estável
    expect(order(js, ["points", "headToHead", "difference", "scoredGoals", "wins", "lottery"])).toEqual(a);
    // outra seed, pode mudar; e ao longo de várias seeds os dois ficam à frente do outro vezes semelhantes
    let frontA = 0;
    for (let i = 0; i < 400; i++) if (order(js, ["points", "lottery"], { seed: `s${i}` }).indexOf("A") < order(js, ["points", "lottery"], { seed: `s${i}` }).indexOf("B")) frontA++;
    expect(frontA).toBeGreaterThan(140);
    expect(frontA).toBeLessThan(260);
  });

  it("promoção: em empate total ganha o clube de menor reputação", () => {
    const js = [j("A", "X", 1, 0), j("B", "Y", 1, 0)];
    const reputation = new Map([["A", 5000], ["B", 3000], ["X", 1], ["Y", 1]]);
    const t = sortStandings(lines(js), js, P.tiebreak.promotion, { ...ctx, reputation });
    expect(t.map((l) => l.club).slice(0, 2)).toEqual(["B", "A"]);
    expect(t[0]?.tiebreakPer).toBe("smallerReputation");
    expect(sortStandings(lines(js), js, P.tiebreak.promotion, { ...ctx, reputation: new Map([["A", 100], ["B", 900]]) }).map((l) => l.club).slice(0, 2)).toEqual(["A", "B"]);
  });

  it("clubes que ainda não jogaram entram a zeros, e o desempate de começo de época é estável", () => {
    const t = sortStandings([], [], P.tiebreak.league, { ...ctx, clubs: ["C", "A", "B"] });
    expect(t).toHaveLength(3);
    expect(t.every((l) => l.points === 0 && l.matches === 0)).toBe(true);
    expect(t.map((l) => l.position)).toEqual([1, 2, 3]);
    expect(sortStandings([], [], P.tiebreak.league, { ...ctx, clubs: ["B", "C", "A"] }).map((l) => l.club)).toEqual(t.map((l) => l.club));
  });

  it("invariantes: com jogos aleatórios, a tabela é uma permutação, ordenada por pontos, e não depende da ordem de entrada", () => {
    const clubs = ["A", "B", "C", "D", "E", "F"];
    for (let k = 0; k < 40; k++) {
      let x = k * 7919 + 13;
      const rnd = () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648;
      const js: ResultMatch[] = [];
      for (const a of clubs) for (const b of clubs) if (a !== b) js.push(j(a, b, Math.floor(rnd() * 3), Math.floor(rnd() * 3)));
      const t = sortStandings(lines(js), js, P.tiebreak.league, ctx);
      expect(t.map((l) => l.club).sort()).toEqual(clubs);
      for (let i = 1; i < t.length; i++) expect(t[i - 1]!.points).toBeGreaterThanOrEqual(t[i]!.points);
      const shuffled = [...js].reverse();
      expect(sortStandings([...lines(shuffled)].reverse(), shuffled, P.tiebreak.league, ctx).map((l) => l.club)).toEqual(t.map((l) => l.club));
    }
  });
});
