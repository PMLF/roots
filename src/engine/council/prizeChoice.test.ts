import { describe, expect, it } from "vitest";
import { COUNCIL_AREAS, DEFAULT_PARAMETERS as P } from "../config/parameters";
import { clubBalance } from "../club/finances";
import { data, fresh } from "../squad/testWorld.testlib";
import { mayorOf } from "./agenda";
import { prizeInvestment, stadiumCredit, usePrize } from "./prizeChoice";
import { evolveCities } from "../city/cities";
import { dailyCouncil, makeStadiumRequest, requestsOf } from "./requests";

const clubs = data.clubs.filter((c) => mayorOf(fresh("probe"), data, c.city)).slice(0, 80);

describe("o que a Câmara faz com o prémio do Estado", { timeout: 120000 }, () => {
  it("o prémio do clube é de 5 M€ e o da Câmara de 1 M€", () => expect([P.prizes.club, P.prizes.city]).toEqual([5_000_000, 1_000_000]));

  it("reparte-se pelas áreas: soma o milhão menos o que se perde, e cada autarca privilegia coisas diferentes", () => {
    const repo = fresh("prize-a");
    const tops = new Set<string>();
    for (const c of clubs) {
      const u = usePrize(repo, data, P, c, false, 1);
      const sum = COUNCIL_AREAS.reduce((s, a) => s + u.areas[a], 0);
      expect(Math.abs(sum + u.leaked - P.prizes.city)).toBeLessThanOrEqual(COUNCIL_AREAS.length);
      expect(u.leaked).toBeLessThanOrEqual(P.prizes.city * P.prizes.council.leak.max);
      tops.add(u.top);
    }
    // não é só para o clube: várias áreas aparecem como a principal
    expect(tops.size).toBeGreaterThanOrEqual(3);
  });

  it("o desporto vai em dinheiro para os clubes da IA; o resto vira pontos nos serviços da cidade", () => {
    const repo = fresh("prize-b");
    for (const c of clubs.slice(0, 20)) {
      const before = clubBalance(repo, c);
      const u = usePrize(repo, data, P, c, false, 1);
      expect(clubBalance(repo, c) - before).toBe(u.areas.sport);
      expect(stadiumCredit(repo, c.id)).toBe(0);
      const inv = prizeInvestment(repo, c.city);
      expect(Object.values(inv).every((v) => v > 0 && v <= P.prizes.council.invest.maxPoints)).toBe(true);
      expect(Object.keys(inv).length).toBeGreaterThan(0);
    }
  });

  it("no clube do gamer, a parte do desporto fica reservada para obras no estádio e aprova o pedido", () => {
    const repo = fresh("prize-c");
    const c = clubs[0]!;
    const before = clubBalance(repo, c);
    const u = usePrize(repo, data, P, c, true, 1);
    expect(clubBalance(repo, c)).toBe(before);
    expect(stadiumCredit(repo, c.id)).toBe(u.areas.sport);
    const cost = Math.max(1000, Math.round(u.areas.sport / 2));
    expect(makeStadiumRequest(repo, data, P, c, "2027-08-01", 1, cost).ok).toBe(true);
    for (let d = 2; d <= 25; d++) dailyCouncil(repo, data, P, c, `2027-08-${String(d).padStart(2, "0")}` as never, 1);
    expect(requestsOf(repo)[0]).toMatchObject({ status: "approved", cost });
    expect(clubBalance(repo, c) - before).toBe(cost);
    expect(stadiumCredit(repo, c.id)).toBe(u.areas.sport - cost);
  });

  it("o investimento conta no fecho da época e depois limpa-se", () => {
    const repo = fresh("prize-d");
    const c = clubs[0]!;
    usePrize(repo, data, P, c, false, 1);
    expect(Object.keys(prizeInvestment(repo, c.city)).length).toBeGreaterThan(0);
    evolveCities(repo, data, P, 1, "2027-06-30" as never, new Map());
    expect(prizeInvestment(repo, c.city)).toEqual({});
  });
});
