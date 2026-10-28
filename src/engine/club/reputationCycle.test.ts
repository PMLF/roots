import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS as P } from "../config/parameters";
import { MemoryRepository } from "../persistence/repositoryMemory";
import type { BaseClub } from "../data/types";
import { reputationsOf, updateReputations, withReputation } from "./reputationCycle";

const club = (id: string, tier: BaseClub["tier"], reputation: number) => ({ id, tier, reputation }) as BaseClub;

describe("reputação dinâmica (RZ-270)", () => {
  const clubs = [club("a", "district", 1200), club("b", "district", 1200), club("c", "firstLeague", 6000), club("d", "firstLeague", 6000)];
  const tier = new Map(clubs.map((c) => [c.id, c.tier] as const));
  it("campeão que sobe ganha, descido perde, e a seguinte época usa os valores novos", () => {
    const repo = new MemoryRepository();
    const out = updateReputations(repo, clubs, P, {
      season: 1, tier, nextTier: new Map([["a", "cp"], ["b", "district"], ["c", "firstLeague"], ["d", "secondLeague"]]),
      finish: [{ club: "a", tier: "district", position: 1, size: 14 }, { club: "b", tier: "district", position: 14, size: 14 }, { club: "c", tier: "firstLeague", position: 1, size: 20 }, { club: "d", tier: "firstLeague", position: 20, size: 20 }],
      champions: ["a", "c"],
    });
    expect(out.a!).toBeGreaterThan(1200 + 200);
    expect(out.b!).toBeLessThan(1200);
    expect(out.c!).toBeGreaterThan(6000);
    expect(out.d!).toBeLessThan(6000 - 200);
    expect(reputationsOf(repo, 2)).toEqual(out);
    expect(withReputation(repo, clubs, 2).find((c) => c.id === "a")!.reputation).toBe(out.a);
    expect(withReputation(repo, clubs, 1)).toBe(clubs);
  });
  it("uma subida puxa a reputação para o intervalo do novo escalão", () => {
    const repo = new MemoryRepository();
    const out = updateReputations(repo, [club("x", "district", 900)], P, {
      season: 1, tier: new Map([["x", "district"]]), nextTier: new Map([["x", "thirdLeague"]]), finish: [{ club: "x", tier: "district", position: 1, size: 14 }], champions: ["x"],
    });
    expect(out.x!).toBeGreaterThan(P.reputation.dynamics.bands.cp[0] - 400);
  });
});
