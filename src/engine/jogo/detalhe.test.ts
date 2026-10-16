import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS as P } from "../config/parametros";
import { importData } from "../dados/importar";
import { generateWorld } from "../mundo/gerarMundo";
import { importCountries } from "../mundo/paises";
import { MemoryRepository } from "../persistencia/repositorioMemoria";
import { playMatch, matchLevel, type ResolvedMatch } from "./detalhe";
import { teamOf, type LineupCandidate } from "./equipa";
import { matchStories } from "./historias";
import { syntheticTeam } from "./teste-util";
import type { MatchInput, MatchTeam, Side } from "./tipos";

const meta = (id: string) => ({ id, competition: "PL", season: 1, round: 1, date: "2026-09-05" });
const input = (id: string): MatchInput => ({ seed: "det", id, home: syntheticTeam("A", 10), away: syntheticTeam("B", 10) });

describe("nível de detalhe", () => {
  it("0 para os jogos do clube do gamer, 1 para os outros", () => {
    expect(matchLevel("A", "B", "A")).toBe(0);
    expect(matchLevel("A", "B", "B")).toBe(0);
    expect(matchLevel("A", "B", "C")).toBe(1);
    expect(matchLevel("A", "B")).toBe(1);
  });

  it("o mesmo jogo dá o mesmo resultado, golos e cartões nos dois níveis; só muda o que se guarda", () => {
    for (let i = 0; i < 60; i++) {
      const e = input(`n${i}`);
      const a = playMatch(e, 0, meta(e.id), P) as Extract<ResolvedMatch, { level: 0 }>;
      const b = playMatch(e, 1, meta(e.id), P) as Extract<ResolvedMatch, { level: 1 }>;
      expect(b.summary).toEqual(a.summary);
      expect(b.record.match).toEqual(a.record.match);
      expect(b.record.facts).toEqual(a.record.facts);
      expect(b.record.injuries).toEqual(a.record.injuries);
      expect(b.stories).toEqual(a.stories);
      expect(b.report.goals).toEqual(a.report.goals);
      expect(b.report.cards).toEqual(a.report.cards);
      expect(b.report.injuries).toEqual(a.report.injuries);
      expect(b.report.matchMan.id).toBe(a.report.matchMan);
      expect(a.events.length).toBeGreaterThan(0);
      expect("events" in b).toBe(false);
      expect("players" in b.report).toBe(false);
      // notas: todas no nível 0, só a do homem do jogo no nível 1
      expect(a.record.appearances.every((p) => p.rating !== undefined)).toBe(true);
      const withRating = b.record.appearances.filter((p) => p.rating !== undefined);
      expect(withRating.map((p) => p.player)).toEqual([b.report.matchMan.id]);
      expect(withRating[0]?.rating).toBe(b.report.matchMan.rating);
      // o nível 1 só tem momentos públicos
      expect(b.report.moments.every((m) => ["goal", "expulsao", "injury"].includes(m.type))).toBe(true);
      // sobrevivem as mesmas participações (minutos incluídos)
      expect(b.record.appearances.map((p) => [p.player, p.minutes, p.starter])).toEqual(a.record.appearances.map((p) => [p.player, p.minutes, p.starter]));
    }
  });
});

describe("histórias do jogo", () => {
  const goal = (minute: number, side: Side, homeGoals: number, awayGoals: number, player = side === "home" ? "c1" : "f1") => ({ minute, side, player, origin: "jogada" as const, homeGoals, awayGoals });
  const history = (goals: ReturnType<typeof goal>[], cards: { minute: number; side: Side; player: string; colour: "yellow" | "red"; secondYellow?: true }[] = []) => {
    const ult = goals.at(-1);
    return matchStories(meta("j"), { home: "A", away: "B" }, { duration: 94, homeGoals: ult?.homeGoals ?? 0, awayGoals: ult?.awayGoals ?? 0, goals, cards }, P);
  };
  const types = (e: ReturnType<typeof history>) => e.map((x) => x.type);

  it("um 1-0 a meio do jogo não é notícia", () => {
    expect(history([goal(30, "home", 1, 0)])).toEqual([]);
    expect(history([])).toEqual([]);
  });
  it("hat-trick", () => {
    const e = history([goal(10, "home", 1, 0, "x"), goal(40, "home", 2, 0, "x"), goal(70, "home", 3, 0, "x")]);
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ type: "HATTRICK", visibility: "exposed", data: { goals: 3, minutes: [10, 40, 70] } });
    expect(e[0]?.entities).toEqual([{ k: "person", id: "x", roleKind: "scorer" }, { k: "club", id: "A" }, { k: "match", id: "j" }]);
    expect(types(history([goal(10, "home", 1, 0, "x"), goal(40, "home", 2, 0, "x")]))).toEqual([]);
  });
  it("goleada: 4 ou mais de diferença", () => {
    const g = [goal(5, "away", 0, 1), goal(20, "away", 0, 2), goal(50, "away", 0, 3, "f2"), goal(60, "away", 0, 4, "f3")];
    const e = history(g);
    expect(types(e)).toEqual(["GOLEADA"]);
    expect(e[0]?.entities.map((x) => `${x.roleKind}:${x.id}`).slice(0, 2)).toEqual(["vencedor:B", "vencido:A"]);
    expect(types(history(g.slice(0, 3)))).toEqual([]);
  });
  it("reviravolta: o vencedor chegou a perder por dois", () => {
    const e = history([goal(10, "away", 0, 1), goal(20, "away", 0, 2), goal(50, "home", 1, 2), goal(60, "home", 2, 2), goal(75, "home", 3, 2, "herói")]);
    expect(types(e)).toEqual(["GOLO_NOTAVEL"]);
    expect(e[0]).toMatchObject({ data: { reason: "turnaround", minute: 75, homeGoals: 3, awayGoals: 2 } });
    // perder por um e virar não chega
    expect(types(history([goal(10, "away", 0, 1), goal(50, "home", 1, 1), goal(60, "home", 2, 1)]))).toEqual([]);
  });
  it("golo nos descontos que decide ou salva o empate", () => {
    expect(history([goal(30, "away", 0, 1), goal(93, "home", 1, 1)])[0]).toMatchObject({ type: "GOLO_NOTAVEL", data: { reason: "discounts" } });
    expect(history([goal(92, "home", 1, 0)])[0]).toMatchObject({ data: { reason: "discounts" } });
    // já estava decidido
    expect(history([goal(10, "home", 1, 0, "a"), goal(40, "home", 2, 0, "b"), goal(93, "home", 3, 0, "c")])).toEqual([]);
    // fora dos últimos minutos
    expect(history([goal(85, "home", 1, 0)])).toEqual([]);
  });
  it("reds", () => {
    const e = history([], [{ minute: 20, side: "away", player: "p", colour: "yellow" }, { minute: 60, side: "away", player: "p", colour: "red", secondYellow: true }]);
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ type: "CARTAO_VERMELHO", data: { minute: 60, secondYellow: true } });
  });
  it("com muitos jogos, as histórias aparecem em frequências razoáveis", () => {
    const N = 4000;
    const c: Record<string, number> = {};
    for (let i = 0; i < N; i++) for (const h of playMatch(input(`h${i}`), 1, meta(`h${i}`), P).stories) c[h.type] = (c[h.type] ?? 0) + 1;
    console.log("histórias por jogo", Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Math.round((v / N) * 1000) / 1000])));
    expect((c.HATTRICK ?? 0) / N).toBeGreaterThan(0.002);
    expect((c.HATTRICK ?? 0) / N).toBeLessThan(0.05);
    expect((c.GOLEADA ?? 0) / N).toBeGreaterThan(0.005);
    expect((c.GOLEADA ?? 0) / N).toBeLessThan(0.08);
    expect((c.CARTAO_VERMELHO ?? 0) / N).toBeGreaterThan(0.08);
    expect((c.GOLO_NOTAVEL ?? 0) / N).toBeGreaterThan(0.01);
    expect((c.GOLO_NOTAVEL ?? 0) / N).toBeLessThan(0.2);
  });
});

// ---------- com o mundo gerado

const read = (f: string) => readFileSync(`data/${f}`, "utf8");

describe("época de jogos com o mundo gerado", () => {
  const d = importData({ clubs: read("clubes.csv"), cities: read("cidades.csv"), localities: read("localidades.csv"), rivalries: read("rivalidades.csv"), districts: read("distritos.csv") });
  const pr = importCountries(read("paises.csv"));
  if (!d.ok || !pr.ok) throw new Error("dados inválidos");
  const batch = generateWorld({ seed: "det-mundo", data: d.data, countries: pr.countries, params: P });
  const teams = new Map<string, MatchTeam>();
  const team = (club: string): MatchTeam => {
    let e = teams.get(club);
    if (!e) {
      const cs: LineupCandidate[] = batch.players.filter((j) => j.club === club && j.state === "active").map((j) => ({ person: j.person, positions: j.positions, attributes: j.attributes, heightCm: j.heightCm }));
      e = teamOf(club, cs);
      teams.set(club, e);
    }
    return e;
  };

  it("simula milhares de jogos, o repositório aceita-os e o custo por jogo é baixo", () => {
    const clubs = d.data.clubs.map((c) => c.id);
    const repo = new MemoryRepository();
    const N = 4500;
    const gamer = clubs[0] as string;
    let niv0 = 0;
    const t0 = performance.now();
    for (let i = 0; i < N; i++) {
      const home = clubs[i % clubs.length] as string;
      const away = clubs[(i * 7 + 1) % clubs.length] as string;
      if (home === away) continue;
      const level = matchLevel(home, away, gamer);
      if (level === 0) niv0++;
      const id = `m${i}`;
      const r = playMatch({ seed: "det-mundo", id, home: team(home), away: team(away) }, level, { id, competition: "X", season: 1, round: 1 + (i % 30), date: "2026-09-05" }, P);
      repo.recordMatch(r.record.match, r.record.facts, r.record.appearances);
      for (const ev of [...r.record.injuries, ...r.stories]) repo.appendEvent(ev);
    }
    const ms = performance.now() - t0;
    console.log(`jogos: ${N}, nível 0: ${niv0}, ${(ms / N).toFixed(2)} ms/jogo, ${(ms / 1000).toFixed(1)} s no total (com o repositório em memória)`);
    expect(ms / N).toBeLessThan(15);
    expect(repo.count("JOGO_JOGADO")).toBeGreaterThan(N - 20);
    expect(niv0).toBeGreaterThan(0);
  }, 120000);
});
