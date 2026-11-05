import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS as P } from "../config/parameters";
import type { Repository } from "../persistence/repository";
import { data, fresh } from "../squad/testWorld.testlib";
import { askingPrice, valueView } from "./bids";

const today = "2027-01-15" as never;
const withRatings = (repo: Repository, ratings: number[]): Repository => new Proxy(repo, { get: (t, k) => (k === "playerRecentRatings" ? () => ratings : (t as never)[k]) });

describe("valor de mercado e preço pedido (RZ-239)", { timeout: 120000 }, () => {
  const repo = fresh("value-view");
  const person = data.clubs.slice(0, 40).flatMap((c) => repo.clubPlayers(c.id)).find((j) => repo.contract(j.person) && j.club)!;

  it("o plantel do gamer vê o valor exato; os outros veem uma estimativa com o preço que o clube deverá pedir", () => {
    const own = valueView(repo, data, P, person.person, today, true)!;
    expect(own.exact).toBe(true);
    expect(own.asking).toBeUndefined();
    const other = valueView(repo, data, P, person.person, today, false)!;
    expect(other.exact).toBe(false);
    expect(other.asking!.value).toBeGreaterThan(0);
    expect(valueView(repo, data, P, person.person, today, false)).toEqual(other);
  });

  it("boa forma encarece o jogador; má forma não o baixa", () => {
    const club = person.club!;
    const base = askingPrice(repo, data, P, club, person.person, today);
    const hot = askingPrice(withRatings(repo, [8.2, 8.0, 8.4, 7.9, 8.1]), data, P, club, person.person, today);
    const cold = askingPrice(withRatings(repo, [5.0, 5.2, 5.1]), data, P, club, person.person, today);
    expect(hot.price).toBeGreaterThan(base.price);
    expect(hot.reasons).toContain("form");
    expect(cold.price).toBeLessThanOrEqual(base.price);
    expect(cold.reasons).not.toContain("form");
    // limite do prémio
    expect(hot.price).toBeLessThanOrEqual(Math.round(base.price * (1 + P.market.bids.form.max)) + 2000);
  });

  it("jogadores sem clube não têm valor", () => {
    const free = repo.playersByState("free")[0];
    if (free) expect(valueView(repo, data, P, free.person, today, false)).toBeUndefined();
  });
});
