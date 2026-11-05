import { describe, expect, it } from "vitest";
import { Rng } from "../random/rng";
import { DEFAULT_PARAMETERS as P, validateParameters } from "../config/parameters";
import { matchReport } from "../match/statistics";
import { matchRecord } from "../match/record";
import { MatchSimulator, simulateMatch } from "../match/simulator";
import { syntheticTeam } from "../match/test-util";
import { DEFAULT_TACTIC } from "../match/formations";
import type { MatchInput, MatchTeam, MatchEvent, OnPitchPlayer, Tactic } from "../match/types";
import { MemoryRepository } from "../persistence/repositoryMemory";
import { INJURY_EVENT, physicalState, injuryEvent, clubInjured, withoutInjured } from "./state";
import { playerForm } from "./form";
import { riskPer90, drawLotsInjury, type RiskContext } from "./injury";

const base: RiskContext = { form: 1, physicalAptitude: 10 };

describe("lesões: sorteio e risco", () => {
  it("os parâmetros são válidos", () => {
    expect(validateParameters(P)).toEqual([]);
  });

  it("a gravidade segue a distribuição e os dias ficam nos limites", () => {
    const n = 20000;
    const count = [0, 0, 0, 0, 0];
    for (let i = 0; i < n; i++) {
      const l = drawLotsInjury(new Rng("s", `l${i}`), P);
      count[l.severity - 1]!++;
      const [min, max] = P.injuries.severities[l.severity - 1]!.days;
      expect(l.days).toBeGreaterThanOrEqual(min);
      expect(l.days).toBeLessThanOrEqual(max);
      expect(l.relapse).toBe(false);
    }
    P.injuries.severities.forEach((g, k) => expect(Math.abs(count[k]! / n - g.weight)).toBeLessThan(0.02));
  });

  it("os tipos fazem sentido com a gravidade: ligeiras são pancadas ou musculares, as gravíssimas ligamentos ou fraturas", () => {
    for (let i = 0; i < 5000; i++) {
      const l = drawLotsInjury(new Rng("s", `t${i}`), P);
      if (l.severity === 1) expect(["knock", "muscular", "sprain"]).toContain(l.type);
      if (l.severity === 5) expect(["ligaments", "fracture"]).toContain(l.type);
    }
  });

  it("a recaída repete o tipo e dura mais; o staff médico encurta a paragem", () => {
    const mean = (option: Parameters<typeof drawLotsInjury>[2], prefix: string) => {
      let t = 0;
      for (let i = 0; i < 4000; i++) t += drawLotsInjury(new Rng("s", `${prefix}${i}`), P, option).days;
      return t / 4000;
    };
    const normal = mean({}, "n");
    expect(mean({ relapse: "muscular" }, "n")).toBeGreaterThan(normal * 1.2);
    expect(drawLotsInjury(new Rng("s", "r"), P, { relapse: "sprain" })).toMatchObject({ type: "sprain", relapse: true });
    expect(mean({ medical: 20 }, "n")).toBeLessThan(normal * 0.88);
    expect(mean({ medical: 1 }, "n")).toBeGreaterThan(normal * 1.1);
  });

  it("é determinístico", () => {
    expect(drawLotsInjury(new Rng("s", "x"), P)).toEqual(drawLotsInjury(new Rng("s", "x"), P));
  });

  it("o risco sobe com fadiga, calendário, relvado mau, intensidade, adversário duro e recaída; desce com físico e médicos", () => {
    const r0 = riskPer90(base, P);
    expect(r0).toBeCloseTo(P.injuries.pPerMatchPlayer, 10);
    const more: Partial<RiskContext>[] = [{ form: 0.8 }, { turf: 0 }, { medical: 3 }, { physicalAptitude: 4 }, { opponentPlayFair: 5 }, { intensity: 5 }, { fatigue: 2 }, { relapse: true }];
    for (const m of more) expect(riskPer90({ ...base, ...m }, P), JSON.stringify(m)).toBeGreaterThan(r0);
    const less: Partial<RiskContext>[] = [{ form: 1.1 }, { turf: 1 }, { medical: 18 }, { physicalAptitude: 17 }, { opponentPlayFair: 1 }, { intensity: 1 }];
    for (const m of less) expect(riskPer90({ ...base, ...m }, P), JSON.stringify(m)).toBeLessThan(r0);
    expect(riskPer90({ ...base, form: 0.7, turf: 0, medical: 1, physicalAptitude: 1, opponentPlayFair: 5, intensity: 5, fatigue: 5, relapse: true }, P)).toBeLessThanOrEqual(1);
  });
});

describe("forma e calendário", () => {
  const match = (date: string, minutes = 90) => ({ date, minutes });
  it("descansado = 1; calendário apertado cansa; descansar recupera", () => {
    expect(playerForm({ today: "2026-10-10", matches: [] }, P)).toBe(1);
    const tight = playerForm({ today: "2026-10-10", matches: [match("2026-10-09"), match("2026-10-06"), match("2026-10-03")] }, P);
    const comfortable = playerForm({ today: "2026-10-10", matches: [match("2026-09-30")] }, P);
    expect(tight).toBeLessThan(comfortable);
    expect(tight).toBeLessThan(0.95);
    // mais dias de descanso, mais forma
    const day = (d: string) => playerForm({ today: d, matches: [match("2026-10-03"), match("2026-10-06"), match("2026-10-09")] }, P);
    expect(day("2026-10-12")).toBeGreaterThan(day("2026-10-10"));
    expect(day("2026-10-30")).toBe(1); // fora da janela
    // poucos minutos cansam menos
    expect(playerForm({ today: "2026-10-10", matches: [match("2026-10-09", 20)] }, P)).toBeGreaterThan(playerForm({ today: "2026-10-10", matches: [match("2026-10-09", 90)] }, P));
  });
  it("quem regressa de lesão volta com forma baixa que sobe dia a dia", () => {
    const f = (today: string) => playerForm({ today, matches: [], returnedIn: "2026-10-01" }, P);
    expect(f("2026-10-01")).toBeCloseTo(P.injuries.form.onReturn, 6);
    expect(f("2026-10-05")).toBeGreaterThan(f("2026-10-01"));
    expect(f("2026-10-20")).toBe(1);
  });
  it("fica sempre entre os limites", () => {
    const many = Array.from({ length: 14 }, (_, i) => match(`2026-10-${String(i + 1).padStart(2, "0")}`));
    const v = playerForm({ today: "2026-10-15", matches: many }, P);
    expect(v).toBeGreaterThanOrEqual(P.injuries.form.min);
    expect(v).toBeLessThanOrEqual(P.injuries.form.max);
  });
});

describe("estado físico a partir do histórico", () => {
  const injury = { type: "muscular", severity: 2, days: 14, relapse: false } as const;
  it("lesionado até ao dia certo, depois recém-regressado, depois nada; o histórico não se apaga", () => {
    const r = new MemoryRepository();
    r.appendEvent(injuryEvent({ player: "p1", club: "A", date: "2026-10-01", season: 1, injury }));
    const e = (today: string) => physicalState(r, "p1", today, P);
    expect(e("2026-09-30")).toMatchObject({ injuriesInHistory: 0 });
    expect(e("2026-10-01").injured).toMatchObject({ type: "muscular", until: "2026-10-15", remainingDays: 14 });
    expect(e("2026-10-14").injured?.remainingDays).toBe(1);
    const leg = e("2026-10-15");
    expect(leg.injured).toBeUndefined();
    expect(leg.returnedNewly).toEqual({ type: "muscular", returnedIn: "2026-10-15" });
    expect(e("2026-12-15")).toMatchObject({ injuriesInHistory: 1 });
    expect(e("2026-12-15").returnedNewly).toBeUndefined();
    expect(physicalState(r, "other", "2026-10-05", P)).toEqual({ player: "other", injuriesInHistory: 0 });
  });

  it("filtra os lesionados de um plantel", () => {
    const r = new MemoryRepository();
    r.appendEvent(injuryEvent({ player: "p1", club: "A", date: "2026-10-01", season: 1, injury }));
    r.appendEvent(injuryEvent({ player: "p2", club: "A", date: "2026-10-01", season: 1, injury: { ...injury, days: 3 } }));
    const inj = clubInjured(r, ["p1", "p2", "p3"], "2026-10-08", P);
    expect(inj.map((l) => l.player)).toEqual(["p1"]);
    expect(withoutInjured([{ person: "p1" }, { person: "p2" }, { person: "p3" }], inj).map((c) => c.person)).toEqual(["p2", "p3"]);
    expect(injuryEvent({ player: "p1", club: "A", date: "2026-10-01", season: 1, injury, match: "j1", minute: 33 }).data).toMatchObject({ match: "j1", minute: 33, until: "2026-10-15" });
    expect(INJURY_EVENT).toBe("INJURY");
  });
});

// ---------- no jogo

function withBench(eq: MatchTeam, n = 7): MatchTeam {
  const positions = ["GK", "CB", "RB", "CM", "CM", "RW", "ST"] as const;
  const bench: OnPitchPlayer[] = Array.from({ length: n }, (_, i) => ({ ...(eq.lineup[1] as OnPitchPlayer), id: `${eq.club}-b${i}`, position: positions[i % positions.length] as OnPitchPlayer["position"] }));
  return { ...eq, bench };
}
type Injury = Extract<MatchEvent, { type: "injury" }>;
const injuries = (e: readonly MatchEvent[]) => e.filter((x): x is Injury => x.type === "injury");

describe("lesões em jogo", () => {
  const input = (id: string, extra: Partial<MatchInput> = {}, home = withBench(syntheticTeam("A", 10)), away = withBench(syntheticTeam("B", 10))): MatchInput => ({ seed: "inj", id, home, away, ...extra });

  it("calibração: ≈0,3-0,5 lesões por jogo", () => {
    let t = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) {
      const { events, summary } = simulateMatch(input(`c${i}`), P);
      t += injuries(events).length;
      expect(summary.home.injuries + summary.away.injuries).toBe(injuries(events).length);
    }
    console.log("lesões por jogo", t / N);
    expect(t / N).toBeGreaterThan(0.25);
    expect(t / N).toBeLessThan(0.55);
  });

  it("o lesionado sai e é substituído por alguém do banco; nunca volta; o suplente joga na posição dele", () => {
    let seen = 0;
    for (let i = 0; i < 3000 && seen < 30; i++) {
      const { events } = simulateMatch(input(`s${i}`), P);
      for (const l of injuries(events)) {
        seen++;
        const sub = events.find((e) => e.type === "substitution" && e.playerOut === l.player);
        expect(sub, "substituição").toMatchObject({ minute: l.minute, side: l.side, reason: "injury" });
        expect(l.player.startsWith(l.side === "home" ? "A-" : "B-")).toBe(true);
        expect(events.some((e) => e.minute > l.minute && "player" in e && e.player === l.player), "lesionado em campo").toBe(false);
      }
    }
    expect(seen).toBeGreaterThan(10);
  });

  it("sem suplentes, joga-se com menos um e isso pesa", () => {
    let nWithout = 0;
    for (let i = 0; i < 4000 && nWithout < 5; i++) {
      const e = input(`n${i}`, {}, syntheticTeam("A", 10), syntheticTeam("B", 10));
      const { events } = simulateMatch(e, P);
      if (injuries(events).length > 0) {
        nWithout++;
        expect(events.some((x) => x.type === "substitution")).toBe(false);
      }
    }
    expect(nWithout).toBeGreaterThan(0);
    // pior depois da lesão do que um jogo sem lesão
    let dec = 0, lineup = 0;
    for (let i = 0; i < 40000; i++) {
      const { events } = simulateMatch(input(`p${i}`, {}, syntheticTeam("A", 10), syntheticTeam("B", 10)), P);
      const l = injuries(events).find((x) => x.minute <= 60);
      if (!l) continue;
      for (const e of events) {
        if (e.type !== "shot" || e.outcome !== "goal" || e.minute <= l.minute) continue;
        if (e.side === l.side) dec++;
        else lineup++;
      }
    }
    expect(dec / lineup).toBeLessThan(0.9);
  }, 120000);

  const rate = (cfg: (i: number) => MatchInput, side: "home" | "away", n = 2500) => {
    let t = 0;
    for (let i = 0; i < n; i++) t += injuries(simulateMatch(cfg(i), P).events).filter((l) => l.side === side).length;
    return t / n;
  };

  it("relvado mau, staff fraco, fair play duro do adversário e jogadores cansados: mais lesões", () => {
    const normal = rate((i) => input(`x${i}`), "home");
    const badTurf = rate((i) => input(`x${i}`, { turf: 0 }), "home");
    const goodTurf = rate((i) => input(`x${i}`, { turf: 1 }), "home");
    expect(badTurf).toBeGreaterThan(normal * 1.2);
    expect(goodTurf).toBeLessThan(normal * 0.9);
    const weakMedical = rate((i) => input(`x${i}`, {}, withBench({ ...syntheticTeam("A", 10), medical: 2 })), "home");
    const goodMedical = rate((i) => input(`x${i}`, {}, withBench({ ...syntheticTeam("A", 10), medical: 19 })), "home");
    expect(weakMedical).toBeGreaterThan(goodMedical * 1.3);
    const hard: Tactic = { ...DEFAULT_TACTIC, fairPlay: 1 };
    const hardOpponent = rate((i) => input(`x${i}`, {}, undefined, { ...withBench(syntheticTeam("B", 10)), tactic: hard }), "home");
    expect(hardOpponent).toBeGreaterThan(normal * 1.25);
    const tired = withBench(syntheticTeam("A", 10));
    tired.lineup = tired.lineup.map((j) => ({ ...j, form: 0.75 }));
    expect(rate((i) => input(`x${i}`, {}, tired), "home")).toBeGreaterThan(normal * 1.4);
  }, 120000);

  it("quem acaba de voltar da mesma lesão tem pior sorte e uma recaída dura mais", () => {
    const eq = withBench(syntheticTeam("A", 10));
    const target = eq.lineup[5] as OnPitchPlayer;
    const frágil: MatchTeam = { ...eq, lineup: eq.lineup.map((j) => (j.id === target.id ? { ...j, relapse: "muscular" as const } : j)) };
    let normal = 0, relapses = 0, rightType = true;
    for (let i = 0; i < 6000; i++) {
      normal += injuries(simulateMatch(input(`z${i}`, {}, eq), P).events).filter((l) => l.player === target.id).length;
      for (const l of injuries(simulateMatch(input(`z${i}`, {}, frágil), P).events).filter((x) => x.player === target.id)) {
        relapses++;
        expect(l.injury.relapse).toBe(true);
        rightType &&= l.injury.type === "muscular";
      }
    }
    expect(rightType).toBe(true);
    expect(relapses).toBeGreaterThan(normal * 1.5);
  }, 120000);

  it("alterarEquipa não traz de volta um lesionado", () => {
    for (let i = 0; i < 3000; i++) {
      const e = input(`a${i}`);
      const l = injuries(simulateMatch(e, P).events)[0];
      if (!l) continue;
      const s = new MatchSimulator(e, P);
      s.simulateUntil(l.minute);
      s.changeTeam(l.side, e[l.side]);
      expect(s.simulateUntil(94).some((x) => "player" in x && x.player === l.player)).toBe(false);
      return;
    }
    throw new Error("sem lesões");
  });
});

describe("lesões nas estatísticas e no registo", () => {
  it("minutos, momentos, factos, participações e eventos LESAO coerentes; o repositório aceita tudo", () => {
    for (let i = 0; i < 3000; i++) {
      const e: MatchInput = { seed: "record", id: `g${i}`, home: withBench(syntheticTeam("A", 10)), away: withBench(syntheticTeam("B", 10)) };
      const { events, summary } = simulateMatch(e, P);
      const ls = injuries(events);
      if (ls.length === 0 || events.some((x) => x.type === "card" && x.colour === "red")) continue;
      const report = matchReport(e, { home: e.home, away: e.away }, events, summary, P);
      const l = ls[0] as Injury;
      const playerOut = report.players.find((j) => j.id === l.player)!;
      const sub = events.find((x) => x.type === "substitution" && x.playerOut === l.player) as Extract<MatchEvent, { type: "substitution" }>;
      const playerIn = report.players.find((j) => j.id === sub.playerIn)!;
      expect(playerOut).toMatchObject({ minutes: l.minute, injury: l.injury });
      expect(playerIn.minutes).toBe(summary.duration - l.minute);
      expect(playerIn.position).toBe(playerOut.position);
      expect(report.moments.find((m) => m.type === "injury" && m.player === l.player)).toMatchObject({ substitute: sub.playerIn });
      // cada equipa soma 11 × duração em minutos (sem expulsões)
      for (const side of ["home", "away"] as const) expect(report.players.filter((j) => j.side === side).reduce((s, j) => s + j.minutes, 0)).toBe(11 * summary.duration);
      expect(report.players.every((j) => j.minutes > 0)).toBe(true);

      const r = new MemoryRepository();
      const record = matchRecord({ id: e.id, competition: "ST", season: 1, round: 1, date: "2026-09-05" }, e.home, e.away, events, summary, report);
      expect(record.facts.filter((f) => f.type === "L")).toHaveLength(ls.length);
      expect(record.facts.find((f) => f.type === "L")?.extra).toBe(`gravidade:${l.injury.severity}`);
      expect(record.facts.filter((f) => f.type === "S")).toHaveLength(events.filter((x) => x.type === "substitution").length);
      expect(record.injuries).toHaveLength(ls.length);
      expect(record.appearances.find((p) => p.player === sub.playerIn)).toMatchObject({ starter: false, minutes: playerIn.minutes });
      expect(record.appearances.find((p) => p.player === l.player)?.minutes).toBe(l.minute);
      r.recordMatch(record.match, record.facts, record.appearances);
      for (const ev of record.injuries) r.appendEvent(ev);
      const injured = physicalState(r, l.player, "2026-09-05", P);
      expect(injured.injured).toMatchObject({ type: l.injury.type, severity: l.injury.severity, match: e.id });
      return;
    }
    throw new Error("sem jogo adequado");
  });
});
