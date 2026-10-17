import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS as P } from "../config/parameters";
import { youthFocus } from "./youthFocus";
import { data, fresh, meanQuality, run } from "./testWorld.testlib";

describe("ciclo anual dos plantéis (várias épocas)", () => {
  const repo = fresh("squads");
  const free0 = repo.playersByState("free").length;
  const total0 = repo.peopleTotal();
  const q0 = Object.fromEntries(["firstLeague", "secondLeague", "thirdLeague", "cp", "district"].map((t) => [t, meanQuality(repo, t)]));
  const summaries = run(repo, 10);

  it("os plantéis mantêm o tamanho: entre o alvo e o alvo + folga", () => {
    for (const c of data.clubs) {
      const n = repo.clubPlayers(c.id).length;
      const target = P.world.squad[c.tier];
      expect(n).toBeGreaterThanOrEqual(target);
      expect(n).toBeLessThanOrEqual(target + P.squadCycle.squad.slack + P.squadCycle.youth.perClub[c.tier]);
    }
  });
  it("todos os jogadores de um clube têm contrato vigente no clube", () => {
    for (const c of data.clubs) for (const j of repo.clubPlayers(c.id)) {
      const ct = repo.contract(j.person)!;
      expect(ct.club).toBe(c.id);
      expect(ct.end >= "2036-07-01").toBe(true);
      expect(j.state).toBe("active");
    }
  });
  it("reformam-se, renovam, contratam livres e a formação traz gente nova", () => {
    const sum = (k: keyof (typeof summaries)[number]) => summaries.reduce((a, s) => a + s[k], 0);
    expect(sum("retired")).toBeGreaterThan(300);
    expect(sum("renewed")).toBeGreaterThan(1000);
    expect(sum("released")).toBeGreaterThan(300);
    expect(sum("signedFree")).toBeGreaterThan(300);
    expect(sum("youth")).toBeGreaterThan(1500);
    expect(repo.peopleTotal()).toBeGreaterThan(total0);
    expect(repo.count("PLAYER_RETIRED")).toBe(sum("retired"));
    expect(repo.count("CONTRACT_RENEWED")).toBe(sum("renewed"));
  });
  it("a idade média dos plantéis e a bolsa de livres ficam estáveis", () => {
    const born = (id: string) => repo.person(id)!.birth;
    const ages = data.clubs.flatMap((c) => repo.clubPlayers(c.id).map((j) => 2036.5 - Number(born(j.person).slice(0, 4))));
    const mean = ages.reduce((a, b) => a + b, 0) / ages.length;
    expect(mean).toBeGreaterThan(P.world.age.mean - 3);
    expect(mean).toBeLessThan(P.world.age.mean + 2);
    expect(Math.max(...ages)).toBeLessThanOrEqual(P.squadCycle.retirement.maxAge + 1); // idade aproximada pelo ano de nascimento
    const free = repo.playersByState("free").length;
    expect(free).toBeGreaterThan(free0 * 0.3);
    expect(free).toBeLessThan(free0 * 3);
  });
  it("a qualidade média por escalão não deriva mais de 1 ponto", () => {
    // folga: clubes que apostam mais produzem mais jovens e melhores (covariância positiva), deriva ligeira por desenho
    for (const [tier, q] of Object.entries(q0)) expect(Math.abs(meanQuality(repo, tier) - q), tier).toBeLessThan(1.25);
  });
});

describe("aposta nos jovens (várias épocas)", () => {
  it("os clubes diferem na aposta e quem aposta mais tem plantéis mais jovens", { timeout: 120000 }, () => {
    const repo = fresh("focus");
    run(repo, 8);
    const focus = new Map(data.clubs.map((c) => [c.id, youthFocus(repo, c, c.tier, P)] as const));
    const values = [...focus.values()];
    expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(1);
    expect(Math.min(...values)).toBeGreaterThanOrEqual(P.squadCycle.youth.focus.min);
    expect(Math.max(...values)).toBeLessThanOrEqual(P.squadCycle.youth.focus.max);
    expect(youthFocus(repo, data.clubs[0]!, data.clubs[0]!.tier, P)).toBe(focus.get(data.clubs[0]!.id));
    const meanAge = (clubs: string[]) => {
      const ages = clubs.flatMap((c) => repo.clubPlayers(c).map((j) => 2034 - Number(repo.person(j.person)!.birth.slice(0, 4))));
      return ages.reduce((a, b) => a + b, 0) / ages.length;
    };
    let diff = 0;
    for (const tier of ["firstLeague", "secondLeague", "thirdLeague", "cp", "district"]) {
      const sorted = data.clubs.filter((c) => c.tier === tier).map((c) => c.id).sort((a, b) => (focus.get(a) as number) - (focus.get(b) as number));
      const third = Math.floor(sorted.length / 3);
      diff += meanAge(sorted.slice(0, third)) - meanAge(sorted.slice(-third));
    }
    expect(diff / 5).toBeGreaterThan(0.4);
  });
});

