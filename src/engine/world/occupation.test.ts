import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS as P } from "../config/parameters";
import { data, fresh } from "../squad/testWorld.testlib";
import { hasOutsideLife, occupationOf } from "./occupation";

describe("profissão fora do futebol (RZ-318)", { timeout: 120000 }, () => {
  it("é estável para o mesmo jogador e muda de estudante para emprego com a idade", () => {
    const a = occupationOf("s", "p1", "2008-03-01", "2026-07-01", "IND", P);
    expect(occupationOf("s", "p1", "2008-03-01", "2026-07-01", "IND", P)).toBe(a);
    const young = Array.from({ length: 200 }, (_, i) => occupationOf("s", `p${i}`, "2009-01-01", "2026-07-01", undefined, P));
    expect(young.filter((x) => x === "student").length / 200).toBeGreaterThan(0.7);
    const adult = Array.from({ length: 200 }, (_, i) => occupationOf("s", `p${i}`, "1995-01-01", "2026-07-01", undefined, P));
    expect(adult).not.toContain("student");
  });

  it("o setor da cidade pesa: mais agricultores nas agrícolas, mais operários nas industriais, pescadores no mar", () => {
    const share = (sector: string, code: string) => Array.from({ length: 600 }, (_, i) => occupationOf("s", `q${i}`, "1994-01-01", "2026-07-01", sector, P)).filter((x) => x === code).length / 600;
    expect(share("AGR", "farmer")).toBeGreaterThan(share("TUR", "farmer") * 3);
    expect(share("IND", "factory_worker")).toBeGreaterThan(share("SER", "factory_worker") * 3);
    expect(share("MAR", "fisher")).toBeGreaterThan(share("SER", "fisher") * 10);
  });

  it("só tem outra profissão quem o futebol não paga: quase todos nos distritais, ninguém na 1.ª Liga", () => {
    const repo = fresh("occ");
    const share = (tier: string) => {
      const players = data.clubs.filter((c) => c.tier === tier).flatMap((c) => repo.clubPlayers(c.id));
      const out = players.filter((p) => hasOutsideLife(repo.contract(p.person)?.monthlyWage, P)).length;
      return out / players.length;
    };
    expect(share("district")).toBeGreaterThan(0.9);
    expect(share("cp")).toBeGreaterThan(0.6);
    expect(share("firstLeague")).toBeLessThan(0.1);
    const t3 = share("thirdLeague");
    expect(t3).toBeGreaterThan(0.1); // «parte da 3.ª Liga»
    expect(t3).toBeLessThan(0.9);
    console.log("OCUPAÇÃO", Object.fromEntries(["firstLeague", "secondLeague", "thirdLeague", "cp", "district"].map((t) => [t, +share(t).toFixed(2)])));
  });
});
