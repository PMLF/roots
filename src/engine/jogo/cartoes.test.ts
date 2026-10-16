import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS as P } from "../config/parametros";
import { matchReport } from "./estatisticas";
import { matchRecord } from "./registo";
import { MatchSimulator, simulateMatch } from "./simulador";
import { syntheticTeam } from "./teste-util";
import type { MatchInput, MatchTeam, MatchEvent, Tactic } from "./tipos";
import { DEFAULT_TACTIC } from "./formacoes";

const input = (id: string, fairPlay: Tactic["fairPlay"] = 3): MatchInput => ({ seed: "c", id, home: { ...syntheticTeam("A", 10), tactic: { ...DEFAULT_TACTIC, fairPlay } }, away: syntheticTeam("B", 10) });
type Card = Extract<MatchEvent, { type: "card" }>;
const cards = (e: readonly MatchEvent[]) => e.filter((x): x is Card => x.type === "card");

describe("cartões", () => {
  it("calibração: ≈4 amarelos e ≈0,15 vermelhos por jogo", () => {
    let am = 0, see = 0, seconds = 0, matchesWithRed = 0;
    const N = 3000;
    for (let i = 0; i < N; i++) {
      const { events, summary } = simulateMatch(input(`k${i}`), P);
      const c = cards(events);
      am += c.filter((x) => x.colour === "yellow").length;
      const v = c.filter((x) => x.colour === "red");
      see += v.length;
      seconds += v.filter((x) => x.secondYellow).length;
      if (v.length) matchesWithRed++;
      expect(summary.home.yellows + summary.away.yellows).toBe(c.filter((x) => x.colour === "yellow").length);
      expect(summary.home.reds + summary.away.reds).toBe(v.length);
    }
    console.log("cartões", { matchAm: am / N, seeMatch: see / N, seconds: seconds / N, matchesWithRed: matchesWithRed / N });
    expect(am / N).toBeGreaterThan(3.2);
    expect(am / N).toBeLessThan(5);
    expect(see / N).toBeGreaterThan(0.06);
    expect(see / N).toBeLessThan(0.3);
    expect(seconds).toBeGreaterThan(0);
  });

  it("os cartões são coerentes: um expulso desaparece, o segundo amarelo vem a seguir ao primeiro", () => {
    for (let i = 0; i < 600; i++) {
      const { events } = simulateMatch(input(`e${i}`), P);
      const yellows = new Set<string>();
      const sentOff = new Map<string, number>();
      for (const e of events) {
        if (e.type === "card") {
          expect(sentOff.has(e.player), "cartão a um expulso").toBe(false);
          if (e.colour === "yellow") yellows.add(e.player);
          else {
            if (e.secondYellow) expect(yellows.has(e.player)).toBe(true);
            sentOff.set(e.player, e.minute);
          }
        } else if ("player" in e && sentOff.has(e.player)) {
          // um expulso não faz mais nada em campo depois do minuto da expulsão
          expect(e.minute <= (sentOff.get(e.player) as number), `${e.type} de expulso depois do vermelho`).toBe(true);
        }
      }
    }
  });

  it("um segundo amarelo é sempre amarelo + vermelho no mesmo minuto", () => {
    let seen = 0;
    for (let i = 0; i < 3000 && seen < 5; i++) {
      const c = cards(simulateMatch(input(`s${i}`), P).events);
      c.forEach((x, k) => {
        if (x.colour === "red" && x.secondYellow) {
          seen++;
          const before = c[k - 1] as Card;
          expect(before).toMatchObject({ colour: "yellow", player: x.player, minute: x.minute });
        }
      });
    }
    expect(seen).toBeGreaterThan(0);
  });

  it("fair play duro leva mais cartões; cavalheiro leva menos", () => {
    const mean = (fp: Tactic["fairPlay"]) => {
      let t = 0;
      for (let i = 0; i < 1500; i++) t += simulateMatch(input(`fp${fp}-${i}`, fp), P).summary.home.yellows;
      return t / 1500;
    };
    const [hard, normal, clean] = [mean(5), mean(3), mean(1)];
    expect(hard).toBeGreaterThan(normal * 1.4);
    expect(clean).toBeLessThan(normal * 0.65);
  });

  it("ficar com dez pesa: depois do vermelho a equipa marca menos e sofre mais", () => {
    let dec = 0, lineup = 0, reds = 0;
    for (let i = 0; i < 30000; i++) {
      const { events } = simulateMatch(input(`d${i}`), P);
      const v = cards(events).find((x) => x.colour === "red" && x.minute <= 60);
      if (!v) continue;
      reds++;
      for (const e of events) {
        if (e.type !== "shot" || e.outcome !== "goal" || e.minute <= v.minute) continue;
        if (e.side === v.side) dec++;
        else lineup++;
      }
    }
    expect(reds).toBeGreaterThan(800);
    expect(dec / lineup).toBeLessThan(0.85);
  }, 60000);

  it("um expulso não volta nem com alterarEquipa; a equipa fica com menos um", () => {
    for (let i = 0; i < 3000; i++) {
      const e = input(`a${i}`);
      const s = new MatchSimulator(e, P);
      const ev = s.simulateUntil(94);
      const v = cards(ev).find((x) => x.colour === "red");
      if (!v) continue;
      const s2 = new MatchSimulator(e, P);
      s2.simulateUntil(v.minute);
      const before = s2.summary();
      expect(before[v.side].reds).toBeGreaterThan(0);
      // repor a equipa original (com o expulso): continua sem ele
      s2.changeTeam(v.side, e[v.side === "home" ? "home" : "away"] as MatchTeam);
      const after = s2.simulateUntil(94);
      expect(after.some((x) => "player" in x && x.player === v.player)).toBe(false);
      return;
    }
    throw new Error("nenhum jogo com vermelho");
  });

  it("as estatísticas e o registo contam os cartões", () => {
    for (let i = 0; i < 3000; i++) {
      const e = input(`r${i}`);
      const { events, summary } = simulateMatch(e, P);
      if (!cards(events).some((x) => x.colour === "red")) continue;
      const report = matchReport(e, { home: e.home, away: e.away }, events, summary, P);
      expect(report.cards).toHaveLength(cards(events).length);
      expect(report.players.reduce((s, j) => s + j.yellows, 0)).toBe(summary.home.yellows + summary.away.yellows);
      const sentOff = report.players.find((j) => j.reds > 0)!;
      expect(sentOff.minutes).toBeLessThan(summary.duration);
      expect(sentOff.rating).toBeLessThan(6);
      expect(report.moments.some((m) => m.type === "expulsao")).toBe(true);
      const { facts, appearances } = matchRecord({ id: "x", competition: "c", season: 1, round: 1, date: "2026-09-01" as never }, e.home, e.away, events, summary, report);
      expect(facts.filter((f) => f.type === "CA")).toHaveLength(summary.home.yellows + summary.away.yellows);
      expect(facts.filter((f) => f.type === "CV")).toHaveLength(summary.home.reds + summary.away.reds);
      expect(appearances.find((p) => p.player === sentOff.id)?.minutes).toBe(sentOff.minutes);
      return;
    }
    throw new Error("nenhum jogo com vermelho");
  });
});
