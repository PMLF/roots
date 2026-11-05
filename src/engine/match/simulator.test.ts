import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS as P } from "../config/parameters";
import { MemoryRepository } from "../persistence/repositoryMemory";
import { syntheticTeam } from "./test-util";
import { matchRecord } from "./record";
import { MatchSimulator, simulateMatch } from "./simulator";
import type { MatchInput, MatchEvent } from "./types";

const input = (id = "j1", seed = "s", a = 10, b = 10): MatchInput => ({ seed, id, home: syntheticTeam("A", a), away: syntheticTeam("B", b) });

describe("motor de jogo", () => {
  it("é determinístico: mesma seed e mesmo jogo, mesmo resultado; outro id, outro jogo", () => {
    const a = simulateMatch(input(), P);
    const b = simulateMatch(input(), P);
    expect(b).toEqual(a);
    const c = simulateMatch(input("j2"), P);
    expect(c.events).not.toEqual(a.events);
    expect(simulateMatch(input("j1", "other"), P).events).not.toEqual(a.events);
  });

  it("é retomável: simular por partes dá o mesmo jogo que simular de uma vez", () => {
    const integer = simulateMatch(input("r1"), P);
    const s = new MatchSimulator(input("r1"), P);
    const parts: MatchEvent[] = [];
    for (const m of [10, 10, 45, 46, 70, 200]) parts.push(...s.simulateUntil(m));
    expect(s.finished).toBe(true);
    expect(parts).toEqual(integer.events);
    expect(s.summary()).toEqual(integer.summary);
    // depois do fim não há mais nada
    expect(s.simulateUntil(300)).toEqual([]);
  });

  it("os eventos são coerentes com o resumo", () => {
    for (let i = 0; i < 60; i++) {
      const { events, summary } = simulateMatch(input(`c${i}`), P);
      const goals = { home: 0, away: 0 };
      let shots = 0;
      let corners = 0;
      let fouls = 0;
      let last = 0;
      for (const e of events) {
        expect(e.minute).toBeGreaterThanOrEqual(last);
        expect(e.minute).toBeGreaterThanOrEqual(1);
        expect(e.minute).toBeLessThanOrEqual(summary.duration);
        last = e.minute;
        if (e.type === "shot") {
          shots++;
          if (e.outcome === "goal") goals[e.side]++;
          expect(e.xg).toBeGreaterThan(0);
          expect(e.xg).toBeLessThan(1);
          if (e.assistant) expect(e.assistant).not.toBe(e.player);
          expect(e.player.startsWith(e.side === "home" ? "A-" : "B-")).toBe(true);
          expect(e.player).not.toBe(`${e.side === "home" ? "A" : "B"}-0`); // o guarda-redes não remata
        } else if (e.type === "corner") corners++;
        else if (e.type === "foul") fouls++;
      }
      expect(goals).toEqual({ home: summary.home.goals, away: summary.away.goals });
      expect(shots).toBe(summary.home.shots + summary.away.shots);
      expect(corners).toBe(summary.home.corners + summary.away.corners);
      expect(fouls).toBe(summary.home.fouls + summary.away.fouls);
      expect(summary.home.onTarget).toBeGreaterThanOrEqual(summary.home.goals);
      expect(summary.duration).toBeGreaterThanOrEqual(P.match.duration + P.match.stoppage.min);
      expect(summary.duration).toBeLessThanOrEqual(P.match.duration + P.match.stoppage.max);
      expect(summary.homePossession).toBeGreaterThan(0);
      expect(summary.homePossession).toBeLessThan(1);
    }
  });

  it("alterar a equipa a meio só afeta o que vem depois", () => {
    const s1 = new MatchSimulator(input("a1", "s", 10, 10), P);
    const before1 = s1.simulateUntil(45);
    s1.changeTeam("away", syntheticTeam("B", 4));
    const after1 = s1.simulateUntil(200);
    const s2 = new MatchSimulator(input("a1", "s", 10, 10), P);
    expect(s2.simulateUntil(45)).toEqual(before1);
    const after2 = s2.simulateUntil(200);
    expect(after2).not.toEqual(after1);
  });

  it("um guarda-redes péssimo sofre mais: o atributo conta", () => {
    let goodGoals = 0;
    let badGoals = 0;
    for (let i = 0; i < 400; i++) {
      const good = { seed: "g", id: `gr${i}`, home: syntheticTeam("A", 10), away: syntheticTeam("B", 10, { reflexes: 18, handling: 18, gkPositioning: 18, outputs: 18 }) };
      const bad = { seed: "g", id: `gr${i}`, home: syntheticTeam("A", 10), away: syntheticTeam("B", 10, { reflexes: 3, handling: 3, gkPositioning: 3, outputs: 3 }) };
      goodGoals += simulateMatch(good, P).summary.home.goals;
      badGoals += simulateMatch(bad, P).summary.home.goals;
    }
    expect(badGoals).toBeGreaterThan(goodGoals * 1.2);
  });

  it("o registo do jogo é aceite pelo repositório e os factos batem com o resultado", () => {
    const e = input("reg1");
    const { events, summary } = simulateMatch(e, P);
    const { match, facts, appearances } = matchRecord({ id: "reg1", competition: "SL", season: 1, round: 1, date: "2026-08-22" }, e.home, e.away, events, summary);
    expect(appearances).toHaveLength(22);
    expect(facts.filter((f) => f.type === "G")).toHaveLength(summary.home.goals + summary.away.goals);
    const r = new MemoryRepository();
    r.recordMatch(match, facts, appearances);
    expect(r.match("reg1")).toMatchObject({ homeGoals: summary.home.goals, awayGoals: summary.away.goals });
    expect(r.standings("SL", 1)).toHaveLength(2);
  });
});
