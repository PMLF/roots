import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS as P } from "../config/parameters";
import type { CardRecord } from "../persistence/types";
import { MemoryRepository } from "../persistence/repositoryMemory";
import { syntheticMatch } from "../persistence/repository.contract";
import { disciplinaryState, directRedMatches, withoutSuspended, clubSuspended } from "./suspensions";

const ca = (round: number, player = "p"): CardRecord => ({ player, match: `j${round}`, round, minute: 30, type: "CA", extra: "" });
const cv = (round: number, extra = "", player = "p"): CardRecord => ({ player, match: `j${round}`, round, minute: 60, type: "CV", extra });
const rounds = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
const state = (cards: CardRecord[], played: number, next = played + 1, pending = 0) => disciplinaryState("p", cards, rounds(played), next, "s", P, pending);

describe("castigos disciplinares", () => {
  it("sem cartões, ninguém está suspenso", () => {
    expect(state([], 10)).toMatchObject({ yellows: 0, suspended: false, matchesPerMeet: 0, forSuspension: 5 });
  });

  it("ao 5.º, 9.º, 12.º e 14.º amarelos, um jogo de suspensão que se cumpre no jogo seguinte", () => {
    const am = [1, 2, 4, 6, 7].map((j) => ca(j));
    expect(state(am.slice(0, 4), 7)).toMatchObject({ yellows: 4, suspended: false, forSuspension: 1 });
    // o 5.º amarelo na jornada 7: suspenso na 8
    expect(state(am, 7)).toMatchObject({ yellows: 5, suspended: true, matchesPerMeet: 1, reason: "accumulation", forSuspension: 4 });
    // cumprido na 8: já pode jogar na 9
    expect(state(am, 8)).toMatchObject({ suspended: false, matchesPerMeet: 0 });
    // entre o 5.º e o 9.º não há castigo; o 9.º dá outro
    const upTo = (n: number) => Array.from({ length: n }, (_, i) => ca(i + 1 + (i >= 5 ? 1 : 0)));  // o 6.º jogo cumpre-se de castigo
    expect(state(upTo(8), 9)).toMatchObject({ yellows: 8, suspended: false, forSuspension: 1 });
    expect(state(upTo(9), 10)).toMatchObject({ yellows: 9, suspended: true, matchesPerMeet: 1, forSuspension: 3 });
  });

  it("o 12.º e o 14.º dão castigo; depois do 14.º já não há mais", () => {
    // um amarelo por jogo; o jogo seguinte a cada limiar cumpre-se de castigo (sem amarelo)
    const season = (n: number, thresholds = P.discipline.yellowThresholds) => {
      const cards: CardRecord[] = [];
      let round = 1;
      let last = 0;
      for (let y = 1; y <= n; y++, round++) {
        cards.push(ca(round));
        last = round;
        if (thresholds.includes(y)) round++;
      }
      return { cards, last };
    };
    const a12 = season(12);
    expect(state(a12.cards, a12.last)).toMatchObject({ yellows: 12, suspended: true, matchesPerMeet: 1, forSuspension: 2 });
    const a13 = season(13);
    expect(state(a13.cards, a13.last)).toMatchObject({ yellows: 13, suspended: false });
    const a14 = season(14);
    expect(state(a14.cards, a14.last)).toMatchObject({ yellows: 14, suspended: true });
    expect(state(a14.cards, a14.last).forSuspension).toBeUndefined();
    const a16 = season(16);
    expect(state(a16.cards, a16.last)).toMatchObject({ yellows: 16, suspended: false });
    expect(state(a16.cards, a16.last)).not.toHaveProperty("forSuspension");
  });

  it("vermelho por segundo amarelo: um jogo; o primeiro amarelo conta para a acumulação", () => {
    const cs = [ca(3), cv(3, "2A")];
    expect(state(cs, 3)).toMatchObject({ suspended: true, matchesPerMeet: 1, reason: "second-yellow", yellows: 1 });
    expect(state(cs, 4)).toMatchObject({ suspended: false });
  });

  it("vermelho direto: pelo menos um jogo, o mesmo sempre, e nunca mais que o máximo", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 400; i++) {
      const n = directRedMatches("s", `j${i}`, "p", P.discipline);
      expect(directRedMatches("s", `j${i}`, "p", P.discipline)).toBe(n);
      expect(n).toBeGreaterThanOrEqual(P.discipline.directRed.matches);
      expect(n).toBeLessThanOrEqual(P.discipline.directRed.max);
      seen.add(n);
    }
    expect(seen.size).toBeGreaterThan(1);
    // cumpre-se jogo a jogo
    const n = directRedMatches("s", "j5", "p", P.discipline);
    expect(state([cv(5)], 5)).toMatchObject({ suspended: true, matchesPerMeet: n, reason: "red" });
    expect(state([cv(5)], 5 + n - 1)).toMatchObject({ suspended: true, matchesPerMeet: 1 });
    expect(state([cv(5)], 5 + n)).toMatchObject({ suspended: false });
  });

  it("quem está suspenso não joga: castigos seguidos acumulam e o clube sem jogos não cumpre", () => {
    // vermelho na 5 e 5.º amarelo na 4 → o castigo do amarelo cumpre-se antes?
    const cs = [ca(1), ca(2), ca(3), ca(4), ca(5)]; // 5.º amarelo na jornada 5 → fora na 6
    expect(state(cs, 5)).toMatchObject({ suspended: true, matchesPerMeet: 1 });
    // o clube folga na jornada 6 (não jogou): continua suspenso na 7
    const withoutSix = [1, 2, 3, 4, 5, 7];
    expect(disciplinaryState("p", cs, withoutSix, 7, "s", P)).toMatchObject({ suspended: true });
    expect(disciplinaryState("p", cs, [1, 2, 3, 4, 5, 6], 7, "s", P)).toMatchObject({ suspended: false });
    // cartões de outro jogador não contam
    expect(disciplinaryState("other", cs, rounds(5), 6, "s", P).yellows).toBe(0);
  });

  it("o castigo pendente da época anterior cumpre-se na seguinte", () => {
    expect(state([], 0, 1, 2)).toMatchObject({ suspended: true, matchesPerMeet: 2 });
    expect(state([], 1, 2, 2)).toMatchObject({ suspended: true, matchesPerMeet: 1 });
    expect(state([], 2, 3, 2)).toMatchObject({ suspended: false });
  });

  it("lê do repositório, por competição e época, e tira os suspensos do onze", () => {
    const r = new MemoryRepository();
    // A-4 vê amarelo em casa em cada jogo; o 5.º dá suspensão
    for (let j = 1; j <= 5; j++) {
      const x = syntheticMatch(`g${j}`, { home: "A", away: "B", homeGoals: 0, awayGoals: 0, round: j, date: `2026-09-${10 + j}` }, { cards: true });
      r.recordMatch(x.match, x.facts, x.part);
    }
    const players = ["A-4", "A-5", "B-5"];
    const susp = clubSuspended(r, "A", players, "PL", 1, 6, "s", P);
    expect(susp.map((s) => s.player)).toEqual(["A-4"]);
    expect(susp[0]).toMatchObject({ yellows: 5, matchesPerMeet: 1, reason: "accumulation" });
    expect(clubSuspended(r, "A", players, "TP", 1, 6, "s", P)).toEqual([]);
    expect(clubSuspended(r, "A", players, "PL", 2, 6, "s", P)).toEqual([]);
    const candidates = [{ person: "A-4" }, { person: "A-9" }];
    expect(withoutSuspended(candidates, susp)).toEqual([{ person: "A-9" }]);
    // pendente da época anterior
    expect(clubSuspended(r, "A", ["A-9"], "PL", 1, 1, "s", P, new Map([["A-9", 1]]))).toHaveLength(1);
  });
});
