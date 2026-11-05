import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS } from "../config/parameters";
import type { BaseClub } from "../data/types";
import { MemoryRepository } from "../persistence/repositoryMemory";
import { roundPrize } from "../season/competitionPrizes";
import { matchAttendance } from "./attendance";
import { setBudget, clubBudget, defaultBudget } from "./budget";
import { factorReputation, closeUntilMonths, post, settle, clubMonth, clubBalance } from "./finances";

const p = DEFAULT_PARAMETERS;
const club = (id: string, tier: BaseClub["tier"], reputation: number, capacity: number, rival = ""): BaseClub => ({ id, name: id, tier, reputation, finances: 100_000, rival, stadium: { capacity } } as unknown as BaseClub);

describe("livro de finanças", () => {
  it("o saldo arranca no capital inicial e os lançamentos somam ao saldo e ao mês", () => {
    const repo = new MemoryRepository();
    const c = club("a", "cp", 2590, 3000);
    expect(clubBalance(repo, c)).toBe(100_000);
    post(repo, c, "ticketing", 5_000);
    post(repo, c, "wages", -2_000);
    post(repo, c, "ticketing", 1_000);
    expect(clubBalance(repo, c)).toBe(104_000);
    expect(clubMonth(repo, "a")).toEqual({ ticketing: 6_000, wages: -2_000 });
  });
  it("o fecho mensal corre uma vez por mês em atraso e zera o mês", () => {
    const repo = new MemoryRepository();
    const c = club("a", "cp", 2590, 3000);
    const data = { clubs: [c] } as never;
    closeUntilMonths(repo, data, p, "2026-07-01", 1, () => true); // arranque: só marca o mês
    expect(repo.count("FINANCIAL_CLOSE")).toBe(0);
    closeUntilMonths(repo, data, p, "2026-10-01", 1, () => true);
    expect(repo.count("FINANCIAL_CLOSE", { k: "club", id: "a" })).toBe(3);
    closeUntilMonths(repo, data, p, "2026-10-01", 1, () => true);
    expect(repo.count("FINANCIAL_CLOSE")).toBe(3);
    expect(clubMonth(repo, "a")).toEqual({});
  });
  it("um clube de maior reputação vale mais, dentro de limites", () => {
    expect(factorReputation(club("a", "cp", 2590 * 2, 1), p)).toBeGreaterThan(factorReputation(club("b", "cp", 2590, 1), p));
    expect(factorReputation(club("c", "cp", 1, 1), p)).toBeCloseTo(0.5 ** p.finances.model.exponentReputation);
  });
});

describe("assistência v1", () => {
  const home = club("home", "district", 1295, 2000, "away");
  it("dérbi e final enchem mais o estádio; nunca passa da capacidade", () => {
    const normal = matchAttendance({ home, away: club("x", "district", 1295, 1), footballCulture: 50 }, p);
    const derby = matchAttendance({ home, away: club("away", "district", 1295, 1, "home"), footballCulture: 50 }, p);
    const final = matchAttendance({ home, away: club("x", "district", 1295, 1), footballCulture: 50, final: true }, p);
    expect(derby.attendance).toBeGreaterThan(normal.attendance);
    expect(final.attendance).toBeGreaterThan(normal.attendance);
    expect(final.attendance).toBeLessThanOrEqual(2000);
    expect(normal.revenue).toBe(Math.round(normal.attendance * p.finances.model.ticketPrice.district));
  });
  it("a cultura de futebol da cidade pesa", () => {
    const f = club("x", "district", 1295, 1);
    expect(matchAttendance({ home, away: f, footballCulture: 90 }, p).attendance).toBeGreaterThan(matchAttendance({ home, away: f, footballCulture: 10 }, p).attendance);
  });
});

describe("prémio por ronda da Taça", () => {
  it("meias 500 k€ e metade em cada ronda para trás, com mínimo", () => {
    expect(roundPrize(0, p)).toBe(500_000);
    expect(roundPrize(1, p)).toBe(250_000);
    expect(roundPrize(2, p)).toBe(125_000);
    expect(roundPrize(30, p)).toBe(5_000);
  });
});

describe("transferências e orçamento", () => {
  it("o pagamento entre clubes é soma zero e vai para a categoria certa; recebe e paga no mesmo mês somam-se", () => {
    const repo = new MemoryRepository();
    const a = club("a", "secondLeague", 4650, 7000);
    const b = club("b", "thirdLeague", 3000, 3900);
    settle(repo, a, b, 300_000, "transfers");
    settle(repo, b, a, 50_000, "compensations");
    expect(clubBalance(repo, a) + clubBalance(repo, b)).toBe(200_000);
    expect(clubBalance(repo, a)).toBe(100_000 - 300_000 + 50_000);
    expect(clubMonth(repo, "a")).toEqual({ transfers: -300_000, compensations: 50_000 });
    settle(repo, a, b, 0, "transfers");
    expect(clubBalance(repo, a)).toBe(-150_000);
  });
  it("sem contratos a massa por defeito vem das receitas; o gamer redefine-a e a verba não passa da caixa", () => {
    const repo = new MemoryRepository();
    const a = { ...club("a", "secondLeague", 4650, 7000), finances: 2_000_000 };
    const o = defaultBudget(repo, a, p, 1);
    expect(o.wageBillMax).toBeGreaterThan(0);
    expect(o.transfers).toBeGreaterThan(0);
    expect(o.transfers).toBeLessThan(2_000_000);
    expect(clubBudget(repo, a, p, 1)).toEqual(o);
    expect(setBudget(repo, a, p, 1, { wageBillMax: 900_000, transfers: 100_000 })).toMatchObject({ wageBillMax: 900_000, transfers: 100_000 });
    expect(clubBudget(repo, a, p, 1).wageBillMax).toBe(900_000);
    expect(clubBudget(repo, a, p, 2).wageBillMax).not.toBe(900_000); // nova época: volta ao defeito
    expect(() => setBudget(repo, a, p, 1, { wageBillMax: 1, transfers: 3_000_000 })).toThrow();
    expect(() => setBudget(repo, a, p, 1, { wageBillMax: -1, transfers: 0 })).toThrow();
  });
});
