import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS as P } from "../config/parameters";
import { data, fresh } from "../squad/testWorld.testlib";
import { gamerOffers, isUnemployed, startUnemployed, acceptOffer } from "./coachMarket";

describe("começar sem clube (RZ-501)", { timeout: 120000 }, () => {
  it("define a casa na cidade maior da região e dá ofertas modestas da zona", () => {
    const repo = fresh("unemployed-a");
    const region = "Douro";
    const r = startUnemployed(repo, data, P, region);
    expect(isUnemployed(repo)).toBe(true);
    const biggest = data.cities.filter((c) => c.hub === region).sort((a, b) => b.population - a.population)[0]!;
    expect(r.home).toBe(biggest.id);
    const offers = gamerOffers(repo);
    expect(offers.length).toBeGreaterThanOrEqual(P.coach.offers);
    const byId = new Map(data.clubs.map((c) => [c.id, c] as const));
    for (const o of offers) expect(byId.get(o.club)!.reputation).toBeLessThanOrEqual(P.coach.unemployedStartReputation + P.coach.surpriseMargin);
    expect(offers.every((o) => data.cities.find((c) => c.id === byId.get(o.club)!.city)?.hub === region)).toBe(true);
  });

  it("não deixa recomeçar com clube nem aceita clubes sem oferta; aceitar uma oferta emprega o gamer", () => {
    const repo = fresh("unemployed-b");
    expect(() => startUnemployed(repo, data, P, "Região que não existe")).toThrow();
    startUnemployed(repo, data, P, "Oeste");
    expect(() => acceptOffer(repo, "sc-cascais")).toThrow();
    const first = gamerOffers(repo)[0]!.club;
    acceptOffer(repo, first);
    expect(isUnemployed(repo)).toBe(false);
    expect(repo.meta("gamer.club")).toBe(first);
    expect(() => startUnemployed(repo, data, P, "Oeste")).toThrow();
  });
});
