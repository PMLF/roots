import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS as P, validateParameters } from "../config/parameters";
import { data, fresh } from "../squad/testWorld.testlib";
import { signInitial } from "../season/gamerContract";
import { accrueBank, bankOf, donate, livingCost, monthlySavings } from "./bank";

const club = data.clubs.find((c) => c.tier === "firstLeague")!;
const small = data.clubs.find((c) => c.tier === "district")!;
const d0 = "2027-07-01" as never;

describe("finanças pessoais do gamer (RZ-162)", { timeout: 120000 }, () => {
  it("parâmetros válidos", () => expect(validateParameters(P)).toEqual([]));

  it("o custo de vida sobe com a cidade grande e a habitação difícil", () => {
    const repo = fresh("bank-a");
    const big = [...data.cities].sort((a, b) => b.population - a.population)[0]!;
    const tiny = [...data.cities].sort((a, b) => a.population - b.population)[0]!;
    expect(livingCost(repo, data, P, big.id)).toBeGreaterThan(livingCost(repo, data, P, tiny.id));
  });

  it("a poupança nunca é negativa e cresce com o ordenado", () => {
    expect(monthlySavings(100, 1000, P)).toBe(0);
    expect(monthlySavings(2000, 1000, P)).toBeGreaterThan(0);
    expect(monthlySavings(8000, 1000, P)).toBeGreaterThan(monthlySavings(2000, 1000, P));
  });

  it("a conta cresce mês a mês com a sobra do ordenado; sem clube desce até zero e para", () => {
    const repo = fresh("bank-b");
    repo.setMeta("gamer.club", club.id);
    signInitial(repo, P, club, d0);
    accrueBank(repo, data, P, d0);
    const start = bankOf(repo, P, d0).balance;
    accrueBank(repo, data, P, "2027-10-01" as never);
    const after = bankOf(repo, P, d0).balance;
    expect(after).toBeGreaterThan(start);
    // despedido: o custo de vida come a conta, mas nunca fica negativa
    repo.setMeta("gamer.club", "");
    repo.setMeta("gamer.previous", club.id);
    accrueBank(repo, data, P, "2040-01-01" as never);
    expect(bankOf(repo, P, d0).balance).toBe(0);
  });

  it("clube pequeno: ordenado que não cobre o custo de vida não rende nada, mas a conta não desce", () => {
    const repo = fresh("bank-c");
    repo.setMeta("gamer.club", small.id);
    signInitial(repo, P, small, d0);
    accrueBank(repo, data, P, d0);
    const start = bankOf(repo, P, d0).balance;
    accrueBank(repo, data, P, "2028-07-01" as never);
    expect(bankOf(repo, P, d0).balance).toBeGreaterThanOrEqual(start);
  });

  it("donativo: sai da conta pessoal; o efeito é relativo ao tamanho da empresa", () => {
    const repo = fresh("bank-d");
    repo.setMeta("gamer.club", club.id);
    repo.saveCompanies([
      { id: "co00001", name: "Pequena", sector: "retail", scale: "local", city: club.city, capital: 20_000, founded: 2010, state: "active" },
      { id: "co00002", name: "Gigante", sector: "banking", scale: "international", city: club.city, capital: 400_000_000, founded: 1950, state: "active" },
    ]);
    repo.setMeta("gamer.bank", JSON.stringify({ balance: 200_000, upTo: "2027-07" }));
    const a = donate(repo, P, d0, "co00001", 5_000);
    const b = donate(repo, P, d0, "co00002", 100_000);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) { expect(a.boost).toBeGreaterThan(0.1); expect(b.boost).toBeLessThan(0.001); }
    expect(bankOf(repo, P, d0).balance).toBe(95_000);
    expect(repo.companies({ state: "active" }).find((c) => c.id === "co00001")!.capital).toBe(24_000);
    // intervalo entre donativos à mesma empresa, fundos e valor mínimo
    expect(donate(repo, P, d0, "co00001", 1_000)).toEqual({ ok: false, reason: "cooldown" });
    expect(donate(repo, P, d0, "co00002", 10_000_000)).toEqual({ ok: false, reason: "funds" });
    expect(donate(repo, P, d0, "co00002", 10)).toEqual({ ok: false, reason: "amount" });
  });
});
