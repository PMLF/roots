import { describe, expect, it } from "vitest";
import { Rng } from "../random/rng";
import { observeFields, observePersonality, qualitySigma } from "../knowledge/observe";
import { DEFAULT_PARAMETERS } from "../config/parameters";
import { ev } from "../persistence/repository.contract";
import { MemoryRepository } from "../persistence/repositoryMemory";
import { View } from "./view";

const K = DEFAULT_PARAMETERS.knowledge;
const SCALE: [number, number] = [1, 20];
const target = (id: string) => ({ k: "person" as const, id });
const viewOf = (repo: MemoryRepository, season = 1, participants: string[] = ["club:mine"]) =>
  new View(repo, { observer: "mine", participants: new Set(participants), date: `${2026 + season}-09-01`, season }, K);
const pendingRequest = (id: string, season = 1, extra: Partial<Parameters<typeof observeFields>[1]> = {}) => ({
  observer: "mine", target: target(id), group: "attributes", source: "scout" as const, date: `${2026 + season}-09-01`, season, ...extra,
});

describe("Vista: conhecimento", () => {
  it("sem observação não devolve nada (nem atributos, nem personalidade)", () => {
    const repo = new MemoryRepository();
    const v = viewOf(repo);
    expect(v.knowledge(target("p1"), "attributes")).toBeUndefined();
    expect(v.knowledge(target("p1"), "personality")).toBeUndefined();
    expect(v.estimate(target("p1"), "attributes", "finishing")).toBeUndefined();
  });

  it("com observação devolve intervalo, margem = z·σ e dentro da escala", () => {
    const repo = new MemoryRepository();
    observeFields(repo, pendingRequest("p1"), { finishing: 19, pass: 2 }, SCALE, new Rng("t"), K);
    const c = viewOf(repo).knowledge(target("p1"), "attributes");
    expect(c?.observations).toBe(1);
    const f = c?.fields.finishing;
    expect(f?.margin).toBeCloseTo(K.z * qualitySigma(K.qualityPerSource.scout, K), 1);
    expect(f?.halfTime[1]).toBeLessThanOrEqual(20);
    expect(c?.fields.pass?.halfTime[0]).toBeGreaterThanOrEqual(1);
    expect(f?.halfTime[0]).toBeLessThanOrEqual(f?.value ?? 0);
  });

  it("o intervalo cobre o valor verdadeiro cerca de 80 % das vezes (z = 1,28)", () => {
    const repo = new MemoryRepository();
    const rng = new Rng("cobertura");
    const truths: number[] = [];
    for (let i = 0; i < 3000; i++) {
      const truth = 6 + rng.float() * 8; // longe dos limites, para o corte da escala não enviesar
      truths.push(truth);
      observeFields(repo, pendingRequest(`p${i}`), { x: truth }, SCALE, rng, K);
    }
    const v = viewOf(repo);
    const inside = truths.filter((t, i) => {
      const [lo, hi] = v.estimate(target(`p${i}`), "attributes", "x")?.halfTime ?? [NaN, NaN];
      return t >= lo - 0.05 && t <= hi + 0.05; // arredondamento a 1 casa
    }).length;
    expect(inside / truths.length).toBeGreaterThan(0.76);
    expect(inside / truths.length).toBeLessThan(0.86);
  });

  it("melhor qualidade → erro e margem menores", () => {
    const repo = new MemoryRepository();
    const rng = new Rng("quality");
    const error = { 0.1: 0, 0.9: 0 } as Record<number, number>;
    const margin = { 0.1: 0, 0.9: 0 } as Record<number, number>;
    for (const q of [0.1, 0.9])
      for (let i = 0; i < 500; i++) {
        observeFields(repo, pendingRequest(`q${q}-${i}`, 1, { quality: q }), { x: 10 }, SCALE, rng, K);
        const e = viewOf(repo).estimate(target(`q${q}-${i}`), "attributes", "x");
        error[q] = (error[q] ?? 0) + Math.abs((e?.value ?? 0) - 10) / 500;
        margin[q] = (margin[q] ?? 0) + (e?.margin ?? 0) / 500;
      }
    expect(error[0.9]).toBeLessThan((error[0.1] ?? 0) / 3);
    expect(margin[0.9]).toBeLessThan((margin[0.1] ?? 0) / 3);
  });

  it("a fonte 'proprioClube' sabe mais do que a 'imprensa'", () => {
    expect(qualitySigma(K.qualityPerSource.clubOwn, K)).toBeLessThan(qualitySigma(K.qualityPerSource.press, K) / 3);
  });

  it("várias observações juntas estreitam a margem", () => {
    const repo = new MemoryRepository();
    const rng = new Rng("join");
    observeFields(repo, pendingRequest("p1"), { x: 12 }, SCALE, rng, K);
    const uma = viewOf(repo).estimate(target("p1"), "attributes", "x")?.margin ?? 0;
    observeFields(repo, pendingRequest("p1"), { x: 12 }, SCALE, rng, K);
    observeFields(repo, pendingRequest("p1"), { x: 12 }, SCALE, rng, K);
    observeFields(repo, pendingRequest("p1"), { x: 12 }, SCALE, rng, K);
    const c = viewOf(repo).knowledge(target("p1"), "attributes");
    expect(c?.observations).toBe(4);
    expect(c?.fields.x?.margin).toBeLessThan(uma * 0.6);
  });

  it("a observação envelhece: 'visto há N épocas', desatualizado e margem a crescer", () => {
    const repo = new MemoryRepository();
    observeFields(repo, pendingRequest("p1", 1), { x: 12 }, SCALE, new Rng("e"), K);
    const margins: number[] = [];
    for (const season of [1, 2, 3, 5]) {
      const c = viewOf(repo, season).knowledge(target("p1"), "attributes");
      margins.push(c?.fields.x?.margin ?? 0);
      expect(c?.sinceSeasons).toBe(season - 1);
      expect(c?.outdated).toBe(season - 1 >= K.seasonsAfterOutdated);
      expect(c?.fields.x?.seenIn).toBe("2027-09-01");
    }
    expect(margins).toEqual([...margins].sort((a, b) => a - b));
    expect(margins[3]).toBeGreaterThan((margins[0] ?? 0) * 1.5);
  });

  it("observações de outro observador ou de outro grupo não contam", () => {
    const repo = new MemoryRepository();
    observeFields(repo, pendingRequest("p1", 1, { observer: "rival" }), { x: 12 }, SCALE, new Rng("o"), K);
    observeFields(repo, pendingRequest("p1", 1, { group: "potential" }), { x: 12 }, SCALE, new Rng("o"), K);
    expect(viewOf(repo).knowledge(target("p1"), "attributes")).toBeUndefined();
    expect(viewOf(repo).knowledge(target("p1"), "potential")).toBeDefined();
  });

  it("não deixa escapar o valor verdadeiro nem campos nunca observados", () => {
    const repo = new MemoryRepository();
    const truth = { finishing: 13.123456, realPotential: 17.654321, hidden: 3.141592 };
    observeFields(repo, pendingRequest("p1"), { finishing: truth.finishing }, SCALE, new Rng("leak"), K);
    const v = viewOf(repo);
    const all = JSON.stringify([v.knowledge(target("p1"), "attributes"), v.knowledge(target("p1"), "potential"), v.events(target("p1"))]);
    expect(all).not.toContain("13.123456");
    expect(all).not.toContain("17.654321");
    expect(all).not.toContain("3.141592");
    expect(all).not.toContain("realPotential");
    expect(Object.keys(v.knowledge(target("p1"), "attributes")?.fields ?? {})).toEqual(["finishing"]);
  });
});

describe("Vista: personalidade em rótulos", () => {
  const traits = { ambition: 18, loyalty: 3, vanity: 10, patience: 11, integrity: 6, greed: 16, temperament: 12, professionalism: 20 };

  it("mostra só os extremos, os mais marcados primeiro, no máximo 3", () => {
    const repo = new MemoryRepository();
    observePersonality(repo, pendingRequest("p1", 1, { group: "personality", quality: 1 }), traits, new Rng("r"), K);
    const r = viewOf(repo).knowledge(target("p1"), "personality")?.labels;
    expect(r).toEqual([
      { trait: "professionalism", strip: "high" },
      { trait: "ambition", strip: "high" },
      { trait: "loyalty", strip: "low" },
    ]);
  });

  it("com qualidade máxima nunca troca a faixa; com qualidade nula troca cerca de 35 %", () => {
    const rng = new Rng("substitution");
    const count = (q: number) => {
      let substitutions = 0;
      const n = 3000;
      for (let i = 0; i < n; i++) {
        const repo = new MemoryRepository();
        observePersonality(repo, pendingRequest("p1", 1, { group: "personality", quality: q }), { ambition: 19 }, rng, K);
        if (viewOf(repo).knowledge(target("p1"), "personality")?.labels[0]?.strip === "low") substitutions++;
      }
      return substitutions / n;
    };
    expect(count(1)).toBe(0);
    expect(count(0)).toBeGreaterThan(0.3);
    expect(count(0)).toBeLessThan(0.4);
  });

  it("uma pessoa sem traços extremos não gera rótulos", () => {
    const repo = new MemoryRepository();
    observePersonality(repo, pendingRequest("p1", 1, { group: "personality" }), { ambition: 9, loyalty: 11 }, new Rng("m"), K);
    expect(viewOf(repo).knowledge(target("p1"), "personality")?.labels).toEqual([]);
  });
});

describe("Vista: eventos e factos públicos", () => {
  const c = { k: "club" as const, id: "rival" };

  it("públicos de qualquer clube; privados e secretos só se participarmos", () => {
    const repo = new MemoryRepository();
    repo.appendEvent(ev("GOAL", { entities: [c] }));
    repo.appendEvent(ev("CONTRACT", { visibility: "private", entities: [c, { k: "club", id: "other" }] }));
    repo.appendEvent(ev("CONTRACT", { visibility: "private", entities: [c, { k: "club", id: "mine" }] }));
    repo.appendEvent(ev("ILLICIT_OFFER", { visibility: "secret", entities: [c] }));
    repo.appendEvent(ev("ILLICIT_OFFER", { visibility: "secret", entities: [c, { k: "person", id: "eu" }] }));
    expect(viewOf(repo).events(c).map((e) => e.id)).toEqual([3, 1]);
    expect(viewOf(repo, 1, ["club:mine", "person:eu"]).events(c).map((e) => e.id)).toEqual([5, 3, 1]);
  });

  it("o limite aplica-se depois de filtrar pela visibilidade", () => {
    const repo = new MemoryRepository();
    repo.appendEvent(ev("GOAL", { entities: [c] }));
    for (let i = 0; i < 5; i++) repo.appendEvent(ev("SECRET", { visibility: "secret", entities: [c] }));
    expect(viewOf(repo).events(c, { limit: 1 }).map((e) => e.id)).toEqual([1]);
  });

  it("resultados, marcadores, classificação e estatísticas de jogo são públicos", () => {
    const repo = new MemoryRepository();
    repo.recordMatch(
      { id: "j1", competition: "PL", season: 1, round: 1, date: "2026-08-16", home: "A", away: "B", homeGoals: 1, awayGoals: 0 },
      [{ minute: 10, type: "G", player: "A-9", club: "A" }],
      [{ player: "A-9", club: "A", starter: true, minutes: 90 }],
    );
    const v = viewOf(repo);
    expect(v.match("j1")?.homeGoals).toBe(1);
    expect(v.scorers("PL", 1, 1)).toHaveLength(1);
    expect(v.standings("PL", 1)[0]?.club).toBe("A");
    expect(v.playerStats("A-9")[0]?.goals).toBe(1);
  });
});
