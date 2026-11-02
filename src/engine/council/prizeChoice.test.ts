import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS as P } from "../config/parameters";
import { clubBalance } from "../club/finances";
import { data, fresh } from "../squad/testWorld.testlib";
import { mayorOf } from "./agenda";
import { applyPrize, choosePrize, stadiumCredit } from "./prizeChoice";
import { dailyCouncil, makeStadiumRequest, requestsOf } from "./requests";

const clubs = data.clubs.filter((c) => mayorOf(fresh("probe"), data, c.city)).slice(0, 60);

describe("o que a Câmara faz com o prémio do Estado", { timeout: 120000 }, () => {
  it("o prémio do clube é de 5 M€ e o da Câmara de 1 M€", () => expect([P.prizes.club, P.prizes.city]).toEqual([5_000_000, 1_000_000]));

  it("as três escolhas acontecem conforme os autarcas; fora do clube do gamer nunca há reserva para o estádio", () => {
    const repo = fresh("prize-a");
    const mine = new Map<string, number>(), others = new Map<string, number>();
    for (const c of clubs) {
      for (const [isGamer, tally] of [[true, mine], [false, others]] as const) {
        const k = choosePrize(repo, data, P, c, isGamer, 1);
        tally.set(k, (tally.get(k) ?? 0) + 1);
      }
    }
    expect(mine.size).toBe(3);
    expect(others.get("stadium")).toBeUndefined();
    expect([...others.keys()].sort()).toEqual(["club", "vanish"]);
    // a escolha é determinística
    expect(choosePrize(repo, data, P, clubs[0]!, true, 1)).toBe(choosePrize(repo, data, P, clubs[0]!, true, 1));
  });

  it("cada escolha tem o seu efeito: dinheiro no clube, crédito para o estádio ou nada", () => {
    const repo = fresh("prize-b");
    const seen = new Set<string>();
    for (const c of clubs) {
      const before = clubBalance(repo, c), creditBefore = stadiumCredit(repo, c.id);
      const { choice, amount } = applyPrize(repo, data, P, c, true, 1);
      seen.add(choice);
      expect(amount).toBe(1_000_000);
      expect(clubBalance(repo, c) - before).toBe(choice === "club" ? 1_000_000 : 0);
      expect(stadiumCredit(repo, c.id) - creditBefore).toBe(choice === "stadium" ? 1_000_000 : 0);
    }
    expect(seen.size).toBe(3);
  });

  it("a obra no estádio pedida com crédito reservado é aprovada e gasta o crédito", () => {
    const repo = fresh("prize-c");
    const c = clubs.find((x) => applyPrize(fresh("x"), data, P, x, true, 1).choice === "stadium")!;
    const { choice } = applyPrize(repo, data, P, c, true, 1);
    expect(choice).toBe("stadium");
    const before = clubBalance(repo, c);
    expect(makeStadiumRequest(repo, data, P, c, "2027-08-01", 1, 400_000).ok).toBe(true);
    for (let d = 2; d <= 25; d++) dailyCouncil(repo, data, P, c, `2027-08-${String(d).padStart(2, "0")}` as never, 1);
    expect(requestsOf(repo)[0]).toMatchObject({ status: "approved", cost: 400_000 });
    expect(clubBalance(repo, c) - before).toBe(400_000);
    expect(stadiumCredit(repo, c.id)).toBe(600_000);
  });
});
