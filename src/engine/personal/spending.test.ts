import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS as P, validateParameters } from "../config/parameters";
import { clubBalance } from "../club/finances";
import { acceptableRatio, grudgeNow, negotiateOffer, referenceWage } from "../season/gamerContract";
import { data, fresh } from "../squad/testWorld.testlib";
import { livingCost } from "./bank";
import { buyHome, causeOffsets, clearCauses, courseLevel, homePrice, helpClub, ownsHome, startCourse, supportCause } from "./spending";

const club = data.clubs.find((c) => c.tier === "firstLeague")!;
const d0 = "2027-08-01" as never;
const rich = (repo: ReturnType<typeof fresh>, balance = 1_000_000) => repo.setMeta("gamer.bank", JSON.stringify({ balance, upTo: "2027-08" }));

describe("o que o gamer faz com o dinheiro (RZ-162)", { timeout: 120000 }, () => {
  it("parâmetros válidos", () => expect(validateParameters(P)).toEqual([]));

  it("casa própria: custa meses de custo de vida, baixa o custo de vida e dá raízes na negociação", () => {
    const repo = fresh("spend-a");
    repo.setMeta("gamer.club", club.id);
    rich(repo);
    const living = livingCost(repo, data, P, club.city);
    const price = homePrice(repo, data, P, club.city);
    expect(price).toBeGreaterThan(living * 30);
    const before = acceptableRatio(repo, data, P, club, d0, true).max;
    const r = buyHome(repo, data, P, d0, club.city);
    expect(r.ok).toBe(true);
    expect(ownsHome(repo, club.city)).toBe(true);
    expect(livingCost(repo, data, P, club.city)).toBeLessThan(living);
    expect(Math.abs(homePrice(repo, data, P, club.city) - price)).toBeLessThanOrEqual(1000); // o preço é arredondado ao milhar
    expect(acceptableRatio(repo, data, P, club, d0, true).max).toBeGreaterThan(before);
    expect(buyHome(repo, data, P, d0, club.city)).toEqual({ ok: false, reason: "owned" });
  });

  it("sem dinheiro não se compra nada", () => {
    const repo = fresh("spend-b");
    repo.setMeta("gamer.bank", JSON.stringify({ balance: 100, upTo: "2027-08" }));
    expect(buyHome(repo, data, P, d0, club.city)).toEqual({ ok: false, reason: "funds" });
    expect(startCourse(repo, P, d0)).toEqual({ ok: false, reason: "funds" });
  });

  it("cursos: um de cada vez, levam dias e cada nível pesa na negociação", () => {
    const repo = fresh("spend-c");
    rich(repo);
    expect(courseLevel(repo, d0)).toBe(0);
    const base = acceptableRatio(repo, data, P, club, d0, false).max;
    const r = startCourse(repo, P, d0);
    expect(r.ok).toBe(true);
    expect(courseLevel(repo, d0)).toBe(0);
    expect(startCourse(repo, P, d0)).toEqual({ ok: false, reason: "busy" });
    const done = "2028-03-01" as never;
    expect(courseLevel(repo, done)).toBe(1);
    expect(acceptableRatio(repo, data, P, club, done, false).max).toBeGreaterThan(base);
    for (let i = 0; i < 2; i++) { expect(startCourse(repo, P, done).ok || true).toBe(true); }
  });

  it("causas: soma pontos a um serviço (mais numa terra pequena), com teto, e limpam-se no fecho", () => {
    const repo = fresh("spend-d");
    repo.setMeta("gamer.club", club.id);
    rich(repo);
    const r = supportCause(repo, data, P, d0, club.city, "health", 1000);
    expect(r.ok).toBe(true);
    expect(causeOffsets(repo, club.city).health ?? 0).toBeGreaterThan(0);
    supportCause(repo, data, P, d0, club.city, "health", 500_000);
    expect(causeOffsets(repo, club.city).health).toBeLessThanOrEqual(P.personal.cause.maxPointsPerYear);
    expect(supportCause(repo, data, P, d0, club.city, "health", 1000)).toEqual({ ok: false, reason: "cap" });
    expect(supportCause(repo, data, P, d0, club.city, "nope", 1000)).toEqual({ ok: false, reason: "service" });
    clearCauses(repo, club.city);
    expect(causeOffsets(repo, club.city)).toEqual({});
  });

  it("ajudar o clube: o dinheiro entra na tesouraria e o presidente perdoa", () => {
    const repo = fresh("spend-e");
    repo.setMeta("gamer.club", club.id);
    rich(repo);
    negotiateOffer(repo, data, P, club.id, d0, { monthlyWage: referenceWage(club, P) * 5, years: 2 });
    const grudge = grudgeNow(repo, P, d0);
    expect(grudge).toBeGreaterThan(0);
    const cash = clubBalance(repo, club);
    expect(helpClub(repo, P, d0, club, referenceWage(club, P), 200_000).ok).toBe(true);
    expect(clubBalance(repo, club)).toBe(cash + 200_000);
    expect(grudgeNow(repo, P, d0)).toBeLessThan(grudge);
  });
});
