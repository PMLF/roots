/**
 * Bateria de testes comum a todos os adaptadores de `Repositorio` (RZ-128).
 * Cada adaptador chama `contratoRepositorio(nome, criar)` no seu ficheiro de testes.
 */
import { describe, expect, it } from "vitest";
import type { Repository } from "./repository";
import type { NewEvent, FactMatch, NewMatch, LocalityRecord, WorldBatchRecord, Appearance } from "./types";

export const ev = (type: string, extra: Partial<NewEvent> = {}): NewEvent => ({
  type,
  date: "2026-08-15",
  season: 1,
  visibility: "exposed",
  entities: [],
  data: {},
  ...extra,
});

export type InMatchGoals = { home: string; away: string; homeGoals: number; awayGoals: number };

/** Um jogo coerente: golos distribuídos por marcadores fixos do plantel `<clube>-1..11`. */
export function syntheticMatch(
  id: string,
  g: InMatchGoals & { competition?: string; season?: number; round?: number; date?: string },
  options: { goalAuto?: boolean; cards?: boolean } = {},
): { match: NewMatch; facts: FactMatch[]; part: Appearance[] } {
  const facts: FactMatch[] = [];
  for (let i = 0; i < g.homeGoals; i++) facts.push({ minute: 10 + i * 20, type: "G", player: `${g.home}-${(i % 3) + 9}`, club: g.home });
  for (let i = 0; i < g.awayGoals; i++) facts.push({ minute: 15 + i * 20, type: "G", player: `${g.away}-${(i % 3) + 9}`, club: g.away });
  if (g.homeGoals > 0) facts.push({ minute: 10, type: "A", player: `${g.home}-8`, club: g.home });
  if (options.goalAuto && g.awayGoals > 0) {
    const i = facts.findIndex((f) => f.type === "G" && f.club === g.away);
    facts[i] = { minute: 15, type: "G", player: `${g.home}-3`, club: g.away, extra: "auto" };
  }
  if (options.cards) {
    facts.push({ minute: 33, type: "CA", player: `${g.home}-4`, club: g.home });
    facts.push({ minute: 70, type: "CV", player: `${g.away}-5`, club: g.away });
  }
  const part: Appearance[] = [];
  for (const c of [g.home, g.away]) for (let n = 1; n <= 11; n++) part.push({ player: `${c}-${n}`, club: c, starter: true, minutes: n === 5 && c === g.away && options.cards ? 70 : 90 });
  part.push({ player: `${g.home}-12`, club: g.home, starter: false, minutes: 0 });
  return {
    match: {
      id, competition: g.competition ?? "PL", season: g.season ?? 1, round: g.round ?? 1, date: g.date ?? "2026-08-16",
      home: g.home, away: g.away, homeGoals: g.homeGoals, awayGoals: g.awayGoals,
    },
    facts,
    part,
  };
}

export function repositoryContract(name: string, create: () => Repository): void {
  describe(`Repositorio (${name}): eventos`, () => {
    it("guarda e devolve um evento com entidades por ordem estável", () => {
      const r = create();
      const id = r.appendEvent(
        ev("TRANSFER", {
          round: 3, v: 2, visibility: "private", origin: "generated",
          entities: [{ k: "person", id: "p1", roleKind: "player" }, { k: "club", id: "c2", roleKind: "destino" }, { k: "club", id: "c1" }],
          data: { value: 120000, clauses: ["bónus", { x: 1 }] },
        }),
      );
      expect(id).toBe(1);
      expect(r.event(1)).toEqual({
        id: 1, type: "TRANSFER", v: 2, date: "2026-08-15", season: 1, round: 3, visibility: "private", origin: "generated",
        entities: [{ k: "club", id: "c1" }, { k: "club", id: "c2", roleKind: "destino" }, { k: "person", id: "p1", roleKind: "player" }],
        data: { value: 120000, clauses: ["bónus", { x: 1 }] },
      });
      expect(r.event(99)).toBeUndefined();
    });

    it("ids sequenciais e eventosDe devolve os mais recentes primeiro, com filtros", () => {
      const r = create();
      const c = { k: "club" as const, id: "c1" };
      r.appendEvent(ev("PROMOTION", { season: 1, entities: [c] }));
      r.appendEvent(ev("INJURY", { season: 2, visibility: "private", entities: [c] }));
      r.appendEvent(ev("PROMOTION", { season: 3, entities: [c] }));
      r.appendEvent(ev("PROMOTION", { season: 3, entities: [{ k: "club", id: "c9" }] }));
      expect(r.eventsOf(c).map((e) => e.id)).toEqual([3, 2, 1]);
      expect(r.eventsOf(c, { publicOnly: true }).map((e) => e.id)).toEqual([3, 1]);
      expect(r.eventsOf(c, { visibility: ["private", "secret"] }).map((e) => e.id)).toEqual([2]);
      expect(r.eventsOf(c, { visibility: [] })).toEqual([]);
      expect(r.eventsOf(c, { type: "PROMOTION", limit: 1 }).map((e) => e.id)).toEqual([3]);
      expect(r.eventsOf(c, { seasonSince: 2, untilSeason: 2 }).map((e) => e.id)).toEqual([2]);
      expect(r.eventsOf(c, { afterOf: 1 }).map((e) => e.id)).toEqual([3, 2]);
      expect(r.eventsOf(c, { beforeOf: 3, limit: 1 }).map((e) => e.id)).toEqual([2]);
      expect(r.eventsOf({ k: "club", id: "ninguem" })).toEqual([]);
      expect(r.eventsTotal()).toBe(4);
    });

    it("eventosRecentes: todo o mundo, mais recentes primeiro, com filtros e paginação", () => {
      const r = create();
      const c = { k: "club" as const, id: "c1" };
      r.appendEvent(ev("PROMOTION", { season: 1, entities: [c] }));
      r.appendEvent(ev("INJURY", { season: 1, visibility: "private", entities: [c] }));
      r.appendEvent(ev("ROUT", { season: 1, entities: [{ k: "club", id: "c9" }] }));
      r.appendEvent(ev("PROMOTION", { season: 2, entities: [{ k: "club", id: "c9" }] }));
      expect(r.recentEvents().map((e) => e.id)).toEqual([4, 3, 2, 1]);
      expect(r.recentEvents({ publicOnly: true }).map((e) => e.id)).toEqual([4, 3, 1]);
      expect(r.recentEvents({ types: ["PROMOTION"] }).map((e) => e.id)).toEqual([4, 1]);
      expect(r.recentEvents({ types: [] })).toEqual([]);
      expect(r.recentEvents({ afterOf: 2 }).map((e) => e.id)).toEqual([4, 3]);
      expect(r.recentEvents({ beforeOf: 3, limit: 1 }).map((e) => e.id)).toEqual([2]);
      expect(r.recentEvents({ limit: 2 }).map((e) => e.id)).toEqual([4, 3]);
    });

    it("contar, ultimo e ultimos", () => {
      const r = create();
      const c = { k: "club" as const, id: "c1" };
      for (const season of [1, 4, 9]) r.appendEvent(ev("PROMOTION", { season, entities: [c] }));
      r.appendEvent(ev("PROMOTION", { season: 2, entities: [{ k: "club", id: "c2" }] }));
      expect(r.count("PROMOTION")).toBe(4);
      expect(r.count("PROMOTION", c)).toBe(3);
      expect(r.count("PROMOTION", c, { seasonSince: 2, untilSeason: 8 })).toBe(1);
      expect(r.count("RELEGATION", c)).toBe(0);
      expect(r.last("PROMOTION", c)?.season).toBe(9);
      expect(r.lastN("PROMOTION", c, 2).map((e) => e.season)).toEqual([9, 4]);
      expect(r.last("RELEGATION", c)).toBeUndefined();
    });

    it("cadeia devolve causas e efeitos por ordem", () => {
      const r = create();
      const a = r.appendEvent(ev("PROMISE_MADE"));
      const b = r.appendEvent(ev("PROMISE_BROKEN", { cause: a }));
      const x = r.appendEvent(ev("OTHER"));
      const c = r.appendEvent(ev("EXIT_REQUEST", { cause: b }));
      const d = r.appendEvent(ev("TRANSFER", { cause: c }));
      const fullback = r.appendEvent(ev("COMPLAINT", { cause: a }));
      expect(r.chain(c).map((e) => e.id)).toEqual([a, b, c, d]);
      expect(r.chain(a).map((e) => e.id)).toEqual([a, b, c, d, fullback]);
      expect(r.chain(x).map((e) => e.id)).toEqual([x]);
      expect(r.chain(999)).toEqual([]);
    });

    it("rejeita eventos inválidos sem deixar rasto", () => {
      const r = create();
      expect(() => r.appendEvent(ev("X", { date: "15/08/2026" }))).toThrow(/data inválida/);
      expect(() => r.appendEvent(ev("X", { fixes: 1 }))).toThrow(/CORRECAO/);
      expect(() => r.appendEvent(ev("CORRECTION"))).toThrow(/exige/);
      expect(() => r.appendEvent(ev("X", { cause: 42 }))).toThrow();
      expect(() => r.appendEvent(ev("X", { entities: [{ k: "club", id: "a" }, { k: "club", id: "a" }] }))).toThrow(/repetida/);
      expect(r.count("X")).toBe(0);
      expect(r.appendEvent(ev("OK"))).toBe(1); // nenhum id foi consumido
    });

    it("CORRECAO liga ao evento corrigido sem o alterar", () => {
      const r = create();
      const a = r.appendEvent(ev("RESULT", { data: { goals: 2 } }));
      const c = r.appendEvent(ev("CORRECTION", { fixes: a, data: { goals: 3 } }));
      expect(r.event(a)?.data).toEqual({ goals: 2 });
      expect(r.event(c)?.fixes).toBe(a);
    });

    it("exporta NDJSON, uma linha por evento, por ordem de id", () => {
      const r = create();
      expect(r.exportNdjson()).toBe("");
      r.appendEvent(ev("A", { entities: [{ k: "club", id: "c1" }], data: { n: 1 } }));
      r.appendEvent(ev("B", { round: 2, cause: 1 }));
      const lines = r.exportNdjson().trimEnd().split("\n");
      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[1] as string)).toMatchObject({ id: 2, type: "B", round: 2, cause: 1 });
    });
  });

  describe(`Repositorio (${name}): transações e meta`, () => {
    it("desfaz tudo quando a transação falha, incluindo transações internas", () => {
      const r = create();
      r.appendEvent(ev("BEFORE"));
      expect(() =>
        r.transaction(() => {
          r.appendEvent(ev("INSIDE", { entities: [{ k: "club", id: "c1" }] }));
          r.transaction(() => r.appendEvent(ev("INTERNAL")));
          r.setMeta("x", "1");
          throw new Error("falhou");
        }),
      ).toThrow("falhou");
      expect(r.count("INSIDE")).toBe(0);
      expect(r.count("INTERNAL")).toBe(0);
      expect(r.meta("x")).toBeUndefined();
      expect(r.eventsOf({ k: "club", id: "c1" })).toEqual([]);
      expect(r.appendEvent(ev("AFTER"))).toBe(2);
    });

    it("uma transação interna que falha só desfaz o seu trabalho", () => {
      const r = create();
      r.transaction(() => {
        r.appendEvent(ev("OUTSIDE"));
        expect(() => r.transaction(() => (r.appendEvent(ev("INTERNAL")), (() => { throw new Error("x"); })()))).toThrow("x");
        r.appendEvent(ev("OUTSIDE2"));
      });
      expect(r.count("OUTSIDE")).toBe(1);
      expect(r.count("OUTSIDE2")).toBe(1);
      expect(r.count("INTERNAL")).toBe(0);
    });

    it("meta guarda e substitui valores", () => {
      const r = create();
      expect(r.meta("seed")).toBeUndefined();
      r.setMeta("seed", "abc");
      r.setMeta("seed", "def");
      expect(r.meta("seed")).toBe("def");
    });
  });

  describe(`Repositorio (${name}): jogos e derivadas`, () => {
    it("regista o jogo, o evento JOGO_JOGADO e atualiza classificação e estatísticas", () => {
      const r = create();
      const j = syntheticMatch("j1", { home: "A", away: "B", homeGoals: 2, awayGoals: 1 }, { cards: true });
      const { event } = r.recordMatch(j.match, j.facts, j.part);
      expect(r.event(event)).toMatchObject({ type: "MATCH_PLAYED", visibility: "exposed", round: 1, data: { homeGoals: 2, awayGoals: 1 } });
      expect(r.eventsOf({ k: "club", id: "B" }).map((e) => e.type)).toEqual(["MATCH_PLAYED"]);
      expect(r.match("j1")).toMatchObject({ home: "A", homeGoals: 2, event });
      expect(r.standings("PL", 1)).toEqual([
        { club: "A", matches: 1, wins: 1, draws: 0, losses: 0, scoredGoals: 2, concededGoals: 1, matchesPoints: 3, adjustment: 0, points: 3 },
        { club: "B", matches: 1, wins: 0, draws: 0, losses: 1, scoredGoals: 1, concededGoals: 2, matchesPoints: 0, adjustment: 0, points: 0 },
      ]);
      expect(r.playerStats("A-9")).toEqual([{ player: "A-9", season: 1, club: "A", competition: "PL", matches: 1, minutes: 90, goals: 1, assists: 0, yellows: 0, reds: 0 }]);
      expect(r.playerStats("A-8")[0]).toMatchObject({ assists: 1 });
      expect(r.playerStats("A-4")[0]).toMatchObject({ yellows: 1 });
      expect(r.playerStats("B-5")[0]).toMatchObject({ reds: 1, minutes: 70 });
      expect(r.playerStats("A-12")[0]).toMatchObject({ matches: 0, minutes: 0 }); // suplente não utilizado
    });

    it("minutos jogados numa janela de datas (cansaço, RZ-177)", () => {
      const r = create();
      const j1 = syntheticMatch("j1", { home: "A", away: "B", homeGoals: 0, awayGoals: 0, date: "2026-08-10" }, {});
      const j2 = syntheticMatch("j2", { home: "B", away: "A", homeGoals: 0, awayGoals: 0, round: 2, date: "2026-08-17" }, { cards: true });
      r.recordMatch(j1.match, j1.facts, j1.part);
      r.recordMatch(j2.match, j2.facts, j2.part);
      const who = ["A-1", "A-5", "A-12", "Z-1"];
      expect(Object.fromEntries(r.playedMinutes(who, "2026-08-10", "2026-08-18"))).toEqual({ "A-1": 180, "A-5": 160 });
      expect(Object.fromEntries(r.playedMinutes(who, "2026-08-11", "2026-08-18"))).toEqual({ "A-1": 90, "A-5": 70 });
      expect(r.playedMinutes(who, "2026-08-10", "2026-08-17").get("A-1")).toBe(90);
      expect(r.playedMinutes([], "2026-08-01", "2026-09-01").size).toBe(0);
    });

    it("confrontos entre dois clubes: os mais recentes primeiro, em qualquer campo", () => {
      const r = create();
      const j1 = syntheticMatch("j1", { home: "A", away: "B", homeGoals: 2, awayGoals: 1 }, {});
      const j2 = syntheticMatch("j2", { home: "B", away: "A", homeGoals: 0, awayGoals: 1, round: 2 }, {});
      r.recordMatch(j1.match, j1.facts, j1.part);
      r.recordMatch(j2.match, j2.facts, j2.part);
      expect(r.meetings("A", "B", 5).map((j) => j.id)).toEqual(["j2", "j1"]);
      expect(r.meetings("B", "A", 1).map((j) => j.id)).toEqual(["j2"]);
      expect(r.meetings("A", "Z", 5)).toEqual([]);
    });

    it("estatísticas de uma competição: golos, cartões e nota média por jogador", () => {
      const r = create();
      const j1 = syntheticMatch("j1", { home: "A", away: "B", homeGoals: 2, awayGoals: 1 }, { cards: true });
      r.recordMatch(j1.match, j1.facts, j1.part.map((p) => (p.player === "A-9" ? { ...p, rating: 8 } : p)));
      const j2 = syntheticMatch("j2", { home: "B", away: "A", homeGoals: 0, awayGoals: 1, round: 2 }, {});
      r.recordMatch(j2.match, j2.facts, j2.part.map((p) => (p.player === "A-9" ? { ...p, rating: 6 } : p)));
      const all = r.playerStatsForCompetition("PL", 1);
      const a9 = all.find((x) => x.player === "A-9")!;
      expect(a9).toMatchObject({ matches: 2, ratedGames: 2, avgRating: 7 });
      expect(a9.goals).toBeGreaterThanOrEqual(1);
      expect(all.find((x) => x.player === "B-5")).toMatchObject({ reds: 1 });
      expect(all.find((x) => x.player === "A-4")?.avgRating).toBeUndefined();
      expect(r.playerStatsForCompetition("PL", 2)).toEqual([]);
      expect(r.playerStatsForCompetition("other", 1)).toEqual([]);
    });

    it("auto-golo conta para o resultado mas não para o marcador", () => {
      const r = create();
      const j = syntheticMatch("j1", { home: "A", away: "B", homeGoals: 0, awayGoals: 1 }, { goalAuto: true });
      r.recordMatch(j.match, j.facts, j.part);
      expect(r.standings("PL", 1)[0]?.club).toBe("B");
      expect(r.playerStats("A-3")[0]?.goals).toBe(0);
      expect(r.scorers("PL", 1, 1)).toEqual([{ player: "A-3", club: "B", minute: 15, match: "j1" }]);
    });

    it("desempata a classificação por pontos, diferença e golos marcados", () => {
      const r = create();
      const g = (id: string, home: string, away: string, a: number, b: number, round: number) => {
        const j = syntheticMatch(id, { home, away, homeGoals: a, awayGoals: b, round });
        r.recordMatch(j.match, j.facts, j.part);
      };
      g("1", "A", "B", 1, 0, 1); // A: 3 pts, dif +1, 1 golo
      g("2", "C", "D", 3, 2, 1); // C: 3 pts, dif +1, 3 golos → à frente do A
      g("3", "B", "D", 1, 1, 2); // B e D: 1 pt, dif -1; D marcou mais golos
      expect(r.standings("PL", 1).map((l) => l.club)).toEqual(["C", "A", "D", "B"]);
    });

    it("marcadores de uma jornada por data, jogo e minuto", () => {
      const r = create();
      const a = syntheticMatch("jb", { home: "C", away: "D", homeGoals: 1, awayGoals: 1, date: "2026-08-17" });
      const b = syntheticMatch("ja", { home: "A", away: "B", homeGoals: 2, awayGoals: 0, date: "2026-08-16" });
      r.recordMatch(a.match, a.facts, a.part);
      r.recordMatch(b.match, b.facts, b.part);
      expect(r.scorers("PL", 1, 1).map((m) => `${m.match}:${m.minute}`)).toEqual(["ja:10", "ja:30", "jb:10", "jb:15"]);
      expect(r.scorers("PL", 1, 2)).toEqual([]);
    });

    it("devolve cartões por jogador, competição e época, e as jornadas em que o clube jogou", () => {
      const r = create();
      const g = (id: string, home: string, away: string, round: number, extra: { competition?: string; season?: number } = {}) => {
        const j = syntheticMatch(id, { home, away, homeGoals: 0, awayGoals: 0, round, date: `2026-09-${10 + round}`, ...extra }, { cards: true });
        r.recordMatch(j.match, j.facts, j.part);
      };
      g("j2", "A", "B", 2);
      g("j1", "C", "A", 1);
      g("j3", "A", "D", 3, { competition: "TP" });
      g("j4", "A", "B", 1, { season: 2 });
      // A-4 viu amarelo em casa (j2); B-5 viu vermelho fora (j2); C-5 não é de A
      expect(r.cards("PL", 1, ["A-4", "B-5"])).toEqual([
        { player: "A-4", match: "j2", round: 2, minute: 33, type: "CA", extra: "" },
        { player: "B-5", match: "j2", round: 2, minute: 70, type: "CV", extra: "" },
      ]);
      expect(r.cards("PL", 1, ["A-5"])).toEqual([{ player: "A-5", match: "j1", round: 1, minute: 70, type: "CV", extra: "" }]);
      expect(r.cards("PL", 1, [])).toEqual([]);
      expect(r.cards("TP", 1, ["A-4"])).toHaveLength(1);
      expect(r.playedRounds("A", "PL", 1)).toEqual([1, 2]);
      expect(r.playedRounds("A", "TP", 1)).toEqual([3]);
      expect(r.playedRounds("B", "PL", 2)).toEqual([1]);
      expect(r.playedRounds("Z", "PL", 1)).toEqual([]);
    });

    it("lista os jogos de uma competição e época por jornada, data e id", () => {
      const r = create();
      const g = (id: string, home: string, away: string, round: number, extra: { competition?: string; season?: number; date?: string } = {}) => {
        const j = syntheticMatch(id, { home, away, homeGoals: 1, awayGoals: 0, round, ...extra });
        r.recordMatch(j.match, j.facts, j.part);
      };
      g("j3", "A", "B", 2, { date: "2026-09-20" });
      g("j2", "C", "D", 1, { date: "2026-09-13" });
      g("j1", "A", "D", 1, { date: "2026-09-12" });
      g("j4", "A", "B", 1, { competition: "TP" });
      g("j5", "A", "B", 1, { season: 2 });
      expect(r.competitionMatches("PL", 1).map((j) => j.id)).toEqual(["j1", "j2", "j3"]);
      expect(r.competitionMatches("PL", 1)[0]).toMatchObject({ home: "A", away: "D", homeGoals: 1, awayGoals: 0, round: 1 });
      expect(r.competitionMatches("TP", 1)).toHaveLength(1);
      expect(r.competitionMatches("PL", 3)).toEqual([]);
    });

    it("recusa jogos incoerentes ou repetidos sem deixar rasto", () => {
      const r = create();
      const j = syntheticMatch("j1", { home: "A", away: "B", homeGoals: 1, awayGoals: 0 });
      expect(() => r.recordMatch({ ...j.match, homeGoals: 2 }, j.facts, j.part)).toThrow(/não batem/);
      expect(() => r.recordMatch(j.match, j.facts, [...j.part, j.part[0] as Appearance])).toThrow(/repetido/);
      expect(r.match("j1")).toBeUndefined();
      expect(r.count("MATCH_PLAYED")).toBe(0);
      r.recordMatch(j.match, j.facts, j.part);
      expect(() => r.recordMatch(j.match, j.facts, j.part)).toThrow(/já existe/);
      expect(r.count("MATCH_PLAYED")).toBe(1);
      expect(r.standings("PL", 1).find((l) => l.club === "A")?.matches).toBe(1);
    });

    it("sanção retroativa ajusta a classificação passada sem reescrever jogos nem eventos", () => {
      const r = create();
      const j1 = syntheticMatch("j1", { home: "A", away: "B", homeGoals: 1, awayGoals: 0, season: 3 });
      r.recordMatch(j1.match, j1.facts, j1.part);
      const beforeMatches = JSON.stringify(r.match("j1"));
      const beforeEvents = r.exportNdjson();
      const sanction = r.appendEvent(ev("SANCTION_APPLIED", { season: 5, visibility: "exposed", entities: [{ k: "club", id: "A" }] }));
      r.adjustStandings({ competition: "PL", season: 3, club: "A", points: -6, event: sanction });
      r.adjustStandings({ competition: "PL", season: 3, club: "Z", points: -1, event: sanction }); // clube sem jogos
      const t = r.standings("PL", 3);
      expect(t.map((l) => [l.club, l.matchesPoints, l.adjustment, l.points])).toEqual([["B", 0, 0, 0], ["Z", 0, -1, -1], ["A", 3, -6, -3]]);
      expect(JSON.stringify(r.match("j1"))).toBe(beforeMatches);
      expect(r.exportNdjson().startsWith(beforeEvents)).toBe(true);
      r.rebuildDerived();
      expect(r.standings("PL", 3)).toEqual(t);
      expect(() => r.adjustStandings({ competition: "PL", season: 3, club: "A", points: 1, event: 999 })).toThrow();
    });

    it("reconstruir as derivadas dá exatamente o que o incremental calculou", () => {
      const r = create();
      let n = 0;
      for (let season = 1; season <= 3; season++)
        for (let round = 1; round <= 6; round++)
          for (const [home, away] of [["A", "B"], ["C", "D"]] as const) {
            n++;
            const j = syntheticMatch(`j${n}`, { home: round % 2 ? home : away, away: round % 2 ? away : home, homeGoals: n % 4, awayGoals: (n * 7) % 3, season, round, competition: season === 2 ? "SL" : "PL" }, { cards: n % 2 === 0, goalAuto: n % 5 === 0 });
            r.recordMatch(j.match, j.facts, j.part);
          }
      const before = [1, 2, 3].flatMap((e) => [r.standings("PL", e), r.standings("SL", e)]).concat(
        ["A", "B", "C", "D"].flatMap((c) => [1, 2, 3, 4, 5, 8, 9, 11, 12].map((p) => r.playerStats(`${c}-${p}`))) as never,
      );
      r.rebuildDerived();
      const after = [1, 2, 3].flatMap((e) => [r.standings("PL", e), r.standings("SL", e)]).concat(
        ["A", "B", "C", "D"].flatMap((c) => [1, 2, 3, 4, 5, 8, 9, 11, 12].map((p) => r.playerStats(`${c}-${p}`))) as never,
      );
      expect(after).toEqual(before);
      expect(before.flat().length).toBeGreaterThan(50);
    });

    it("respeita os pontos por resultado configurados", () => {
      // o adaptador criado por `criar` usa 3/1; aqui só confirmamos o valor por omissão
      const r = create();
      const j = syntheticMatch("e", { home: "A", away: "B", homeGoals: 0, awayGoals: 0 });
      r.recordMatch(j.match, j.facts, j.part);
      expect(r.standings("PL", 1).map((l) => l.points)).toEqual([1, 1]);
    });
  });

  describe(`Repositorio (${name}): observações`, () => {
    it("guarda observações e devolve as mais recentes primeiro", () => {
      const r = create();
      const base = { observer: "c1", targetK: "person" as const, targetId: "p1", source: "scout", date: "2026-09-01", season: 1, quality: 0.6 };
      r.appendObservation({ ...base, group: "attributes", values: { finishing: [10, 14] } });
      r.appendObservation({ ...base, group: "personality", values: { labels: ["Leal"] } });
      r.appendObservation({ ...base, group: "attributes", values: { finishing: [12, 13] }, date: "2026-10-01" });
      r.appendObservation({ ...base, observer: "c2", group: "attributes", values: {} });
      expect(r.observations("c1", { k: "person", id: "p1" }).map((o) => o.id)).toEqual([3, 2, 1]);
      expect(r.observations("c1", { k: "person", id: "p1" }, "attributes")[0]?.values).toEqual({ finishing: [12, 13] });
      expect(r.observations("c3", { k: "person", id: "p1" })).toEqual([]);
    });
  });

  describe(`Repositorio (${name}): calendário`, () => {
    const j = (id: string, round: number, date: string, home: string, away: string) => ({ id, competition: "SL", season: 1, round, date, home, away });
    const matches = [j("a", 1, "2026-08-22", "X", "Y"), j("b", 1, "2026-08-23", "Z", "W"), j("c", 2, "2026-08-29", "Y", "Z")];

    it("guarda e consulta por liga, por clube e próximo jogo", () => {
      const r = create();
      r.saveCalendar(matches, [{ competition: "SL", season: 1, round: 2, club: "X" }]);
      const c = r.calendar("SL", 1);
      expect(c.matches.map((x) => x.id)).toEqual(["a", "b", "c"]);
      expect(c.byes).toEqual([{ competition: "SL", season: 1, round: 2, club: "X" }]);
      expect(r.clubCalendar("Y", 1).map((x) => x.id)).toEqual(["a", "c"]);
      expect(r.dayMatches("2026-08-24").map((x) => x.id)).toEqual(r.calendar("SL", 1).matches.filter((x) => x.date === "2026-08-24").map((x) => x.id));
      expect(r.dayMatches("2030-01-01")).toEqual([]);
      expect(r.nextMatch("Y", "2026-08-24")?.id).toBe("c");
      expect(r.nextMatch("Y", "2026-09-30")).toBeUndefined();
      expect(r.calendar("SL", 2)).toEqual({ matches: [], byes: [] });
    });
    it("recusa um segundo calendário da mesma liga e época, sem deixar lixo", () => {
      const r = create();
      r.saveCalendar(matches, []);
      expect(() => r.saveCalendar([j("d", 1, "2026-08-22", "X", "Y")], [])).toThrow();
      expect(r.calendar("SL", 1).matches).toHaveLength(3);
    });
    it("é atómico: um id repetido desfaz tudo", () => {
      const r = create();
      expect(() => r.saveCalendar([j("q", 1, "2026-08-22", "X", "Y"), j("q", 2, "2026-08-29", "Y", "X")], [])).toThrow();
      expect(r.calendar("SL", 1).matches).toEqual([]);
    });
  });

  describe(`Repositorio (${name}): reiniciar`, () => {
    it("deixa o save como novo e utilizável", () => {
      const r = create();
      r.setMeta("seed", "abc");
      r.saveLocalities([{ id: "a@a", name: "A", city: "a", population: 10, status: "village", since: "2026-07-01" }]);
      r.appendEvent({ type: "T", date: "2026-07-01", season: 1, visibility: "exposed", entities: [{ k: "club", id: "X" }], data: {} });
      r.restart();
      expect(r.meta("seed")).toBeUndefined();
      expect(r.eventsTotal()).toBe(0);
      expect(r.localities()).toEqual([]);
      expect(r.peopleTotal()).toBe(0);
      expect(r.eventsOf({ k: "club", id: "X" })).toEqual([]);
      // volta a aceitar o que só aceita uma vez
      r.saveLocalities([{ id: "a@a", name: "A", city: "a", population: 10, status: "village", since: "2026-07-01" }]);
      const id = r.appendEvent({ type: "T", date: "2026-07-01", season: 1, visibility: "exposed", entities: [], data: {} });
      expect(id).toBeGreaterThan(0);
    });
    it("recusa-se dentro de uma transação", () => {
      const r = create();
      expect(() => r.transaction(() => r.restart())).toThrow();
    });
  });

  describe(`Repositorio (${name}): localidades`, () => {
    const base = (): LocalityRecord[] => [
      { id: "matela@vimioso", name: "Matela", city: "vimioso", population: 150, status: "village", since: "2026-07-01" },
      { id: "vimioso@vimioso", name: "Vimioso", city: "vimioso", population: 2700, status: "town", since: "2026-07-01" },
      { id: "porto@porto", name: "Porto", city: "porto", population: 200000, status: "city", since: "2026-07-01" },
    ];
    it("guarda, lê e filtra por concelho", () => {
      const r = create();
      r.saveLocalities(base());
      expect(r.locality("matela@vimioso")).toEqual(base()[0]);
      expect(r.locality("nada")).toBeUndefined();
      expect(r.localities().map((l) => l.id)).toEqual(["matela@vimioso", "porto@porto", "vimioso@vimioso"]);
      expect(r.localities({ city: "vimioso" }).map((l) => l.name)).toEqual(["Matela", "Vimioso"]);
      expect(() => r.saveLocalities(base())).toThrow();
    });
    it("é atómico: um id repetido desfaz tudo", () => {
      const r = create();
      const [a] = base();
      expect(() => r.saveLocalities([a!, { ...a! }])).toThrow();
      expect(r.localities()).toEqual([]);
    });
    it("mudar de população sem mudar de estatuto não acrescenta história", () => {
      const r = create();
      r.saveLocalities(base());
      const before = r.eventsTotal();
      expect(r.updateLocality("matela@vimioso", { population: 160, status: "village", date: "2027-06-30", season: 1 })).toEqual({});
      expect(r.locality("matela@vimioso")).toMatchObject({ population: 160, status: "village", since: "2026-07-01" });
      expect(r.eventsTotal()).toBe(before);
    });
    it("mudar de estatuto regista um evento público e atualiza 'desde'", () => {
      const r = create();
      r.saveLocalities(base());
      const { event } = r.updateLocality("matela@vimioso", { population: 1700, status: "town", date: "2031-06-30", season: 5 });
      expect(event).toBeDefined();
      expect(r.locality("matela@vimioso")).toMatchObject({ population: 1700, status: "town", since: "2031-06-30" });
      const e = r.event(event!)!;
      expect(e).toMatchObject({ type: "LOCALITY_STATUS", visibility: "exposed", season: 5, data: { de: "village", para: "town", population: 1700 } });
      expect(r.eventsOf({ k: "locality", id: "matela@vimioso" }).map((x) => x.id)).toEqual([event]);
      expect(r.eventsOf({ k: "city", id: "vimioso" }, { publicOnly: true }).map((x) => x.id)).toEqual([event]);
    });
    it("recusa localidades inexistentes e desfaz o evento se a transação falhar", () => {
      const r = create();
      r.saveLocalities(base());
      expect(() => r.updateLocality("nada", { population: 1, status: "village", date: "2027-06-30", season: 1 })).toThrow();
      expect(() => r.transaction(() => {
        r.updateLocality("matela@vimioso", { population: 1700, status: "town", date: "2031-06-30", season: 5 });
        throw new Error("falha");
      })).toThrow("falha");
      expect(r.locality("matela@vimioso")?.status).toBe("village");
      expect(r.eventsTotal()).toBe(0);
    });
  });

  describe(`Repositorio (${name}): pessoas`, () => {
    const batch = (): WorldBatchRecord => ({
      people: [
        { id: "p1", name: "João Pedro Silva", sportingName: "João Silva", birth: "2000-03-01", nationality: "pt", naturalDe: "porto", roles: ["player"], personality: { loyalty: 15, ambition: 9 }, archetype: "leader", lod: 1 },
        { id: "p2", name: "Ana Costa", sportingName: "Ana Costa", birth: "1975-05-05", nationality: "pt", roles: ["president"], personality: { loyalty: 10 }, archetype: "common", lod: 2 },
        { id: "p3", name: "Luca Rossi", sportingName: "Luca Rossi", birth: "1998-01-01", nationality: "it", roles: ["player"], personality: { loyalty: 5 }, archetype: "mercenary", lod: 2 },
      ],
      players: [
        { person: "p1", positions: [{ pos: "CM", aptitude: 20 }, { pos: "DM", aptitude: 12 }], attributes: { pass: 14 }, potential: 15.5, heightCm: 180, weightKg: 75, pe: "D", club: "X", state: "active" },
        { person: "p3", positions: [{ pos: "PL", aptitude: 20 }], attributes: { finishing: 12 }, potential: 12, heightCm: 184, weightKg: 80, pe: "E", state: "free" },
      ],
      contracts: [{ person: "p1", club: "X", monthlyWage: 1200, start: "2025-07-01", end: "2028-06-30" }],
      roles: [{ person: "p2", fn: "president", club: "X", city: "porto" }],
    });

    it("guarda e devolve a verdade e os factos públicos", () => {
      const r = create();
      r.saveWorld(batch());
      expect(r.peopleTotal()).toBe(3);
      expect(r.person("p1")?.personality).toEqual({ loyalty: 15, ambition: 9 });
      expect(r.player("p1")?.potential).toBe(15.5);
      expect(r.contract("p1")?.monthlyWage).toBe(1200);
      expect(r.role("p2")?.fn).toBe("president");
      expect(r.clubPlayers("X").map((j) => j.person)).toEqual(["p1"]);
      expect(r.person("nada")).toBeUndefined();
    });
    it("a ficha pública não contém atributos, potencial nem personalidade", () => {
      const r = create();
      r.saveWorld(batch());
      const f = r.publicPerson("p1")!;
      expect(f).toMatchObject({ sportingName: "João Silva", club: "X", naturalDe: "porto", player: { position: "CM", heightCm: 180, pe: "D", state: "active" } });
      const text = JSON.stringify(f);
      for (const banned of ["potential", "attributes", "personality", "loyalty", "aptitude", "archetype", "wage"]) expect(text).not.toContain(banned);
      expect(r.publicPerson("p3")?.player?.state).toBe("free");
      expect(r.publicPerson("p2")).toMatchObject({ fn: "president", club: "X" });
    });
    it("índice de pesquisa só com factos públicos", () => {
      const r = create();
      r.saveWorld(batch());
      expect(r.peopleIndex()).toEqual([
        { id: "p1", name: "João Pedro Silva", sportingName: "João Silva", club: "X", position: "CM" },
        { id: "p2", name: "Ana Costa", sportingName: "Ana Costa", club: "X", fn: "president" },
        { id: "p3", name: "Luca Rossi", sportingName: "Luca Rossi", position: "PL" },
      ]);
    });
    it("plantel e cargos públicos", () => {
      const r = create();
      r.saveWorld(batch());
      expect(r.publicSquad("X").map((p) => p.id)).toEqual(["p1"]);
      expect(r.publicRoles({ club: "X" }).map((p) => p.id)).toEqual(["p2"]);
      expect(r.publicRoles({ city: "porto" }).map((p) => p.id)).toEqual(["p2"]);
      expect(r.publicRoles({})).toEqual([]);
    });
    it("recusa um segundo mundo e desfaz tudo se algo falhar", () => {
      const r = create();
      r.saveWorld(batch());
      expect(() => r.saveWorld(batch())).toThrow();
      const r2 = create();
      const bad = batch();
      bad.players.push({ ...bad.players[0]!, person: "fantasma" });
      expect(() => r2.saveWorld(bad)).toThrow();
      expect(r2.peopleTotal()).toBe(0);
    });
  });
}
