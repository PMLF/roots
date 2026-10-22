import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS as P, validateParameters } from "../config/parameters";
import { makeAppeal } from "../market/appeal";
import { dailyOffers, offers } from "../market/offers";
import { data, fresh } from "./testWorld.testlib";
import { updateYouthLevels, yieldOf, youthLevelOf, youthTarget } from "./youthLevel";

const dev = P.squadCycle.youth.development;

describe("formação do clube (RZ-234)", { timeout: 120000 }, () => {
  it("os parâmetros são válidos", () => {
    expect(validateParameters(P)).toEqual([]);
  });

  it("o alvo fica entre 5 e 95 e o aproveitamento entre o mínimo e o máximo", () => {
    const repo = fresh("youth-a");
    for (const c of data.clubs.slice(0, 40)) {
      const t = youthTarget(repo, data, P, c).target;
      expect(t).toBeGreaterThanOrEqual(5);
      expect(t).toBeLessThanOrEqual(95);
    }
    expect(yieldOf(0, P)).toBeCloseTo(dev.yieldMin);
    expect(yieldOf(100, P)).toBeCloseTo(dev.yieldMax);
  });

  it("o nível move-se devagar em direção ao alvo e guarda a causa", () => {
    const repo = fresh("youth-b");
    const c = data.clubs[0]!;
    const before = youthLevelOf(repo, data, P, c);
    // empurra o nível guardado para longe do alvo: o passo é limitado
    repo.setMeta(`youth.level.${c.id}`, JSON.stringify({ v: 5, prev: 5 }));
    const target = youthTarget(repo, data, P, c).target;
    updateYouthLevels(repo, data, P);
    const after = youthLevelOf(repo, data, P, c);
    expect(after.previous).toBe(5);
    expect(Math.abs(after.value - 5)).toBeLessThanOrEqual(dev.maxStep + 1e-9);
    expect(Math.sign(after.value - 5)).toBe(Math.sign(target - 5));
    expect(before.value).toBeGreaterThan(0);
  });

  it("clubes ricos e com presidente paciente têm alvo mais alto que pobres", () => {
    const repo = fresh("youth-c");
    const same = data.clubs.filter((c) => c.tier === "thirdLeague");
    const sorted = [...same].sort((a, b) => a.finances - b.finances);
    const poor = youthTarget(repo, data, P, sorted[0]!).terms.finances;
    const rich = youthTarget(repo, data, P, sorted.at(-1)!).terms.finances;
    expect(rich).toBeGreaterThan(poor);
  });

  it("o orgulho da cidade reforça o apelo da terra natal e os veteranos sentem mais o regresso", () => {
    const repo = fresh("youth-d");
    repo.setMeta("date.today", "2027-01-05");
    const appeal = makeAppeal(repo, data, P);
    const club = data.clubs[0]!;
    const person = repo.clubPlayers(club.id)[0]!.person;
    const base = appeal.homePull(club.city, person, false);
    expect(base).toBeGreaterThan(P.market.decision.home * (1 - P.market.decision.prideHome) - 1e-9);
    expect(base).toBeLessThan(P.market.decision.home * (1 + P.market.decision.prideHome) + 1e-9);
    const age = (id: string) => (Date.parse("2027-01-05") - Date.parse(repo.person(id)!.birth)) / (365.25 * 86400000);
    const ids = data.clubs.slice(0, 20).flatMap((c) => repo.clubPlayers(c.id).map((j) => j.person));
    const old = ids.find((id) => age(id) >= P.market.decision.returnHome.age)!;
    const young = ids.find((id) => age(id) < P.market.decision.returnHome.age)!;
    expect(appeal.homePull(club.city, old, true) - appeal.homePull(club.city, old, false)).toBeCloseTo(P.market.decision.returnHome.bonus);
    expect(appeal.homePull(club.city, young, true)).toBeCloseTo(appeal.homePull(club.city, young, false));
  });

  it("clubes de escalão acima propõem pelos jovens formados no clube, com compensação de formação", () => {
    const repo = fresh("youth-e");
    const gamer = data.clubs.find((c) => c.tier === "secondLeague")!;
    repo.setMeta("gamer.club", gamer.id);
    for (const c of data.clubs) repo.setMeta("balance." + c.id, "500000000");
    const youths = repo.clubPlayers(gamer.id).slice(0, 6);
    for (const j of youths) repo.updatePlayer(j.person, { trainedAt: gamer.id, potential: 19 });
    let made = 0;
    for (let d = 0; d < 80 && made === 0; d++) {
      const day = new Date(Date.UTC(2027, 0, 2 + d)).toISOString().slice(0, 10) as `${number}-${number}-${number}`;
      repo.setMeta("date.today", day);
      dailyOffers(repo, data, P, gamer, day, 1);
      made = offers(repo).filter((o) => o.kind === "youth").length;
    }
    const youthOffers = offers(repo).filter((o) => o.kind === "youth");
    expect(youthOffers.length).toBeGreaterThan(0);
    for (const o of youthOffers) {
      expect(data.clubs.find((c) => c.id === o.buyer)!.tier).toBe("firstLeague");
      expect(repo.player(o.person)?.trainedAt).toBe(gamer.id);
    }
  });
});
