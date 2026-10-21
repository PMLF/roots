import { describe, expect, it } from "vitest";
import { standingIn } from "./standing";

const peers = [{ reputation: 8000, finances: 30_000_000 }, { reputation: 4000, finances: 1_000_000 }, { reputation: 6000, finances: 5_000_000 }];

describe("posição do clube no escalão", () => {
  it("0 para o mais pequeno e 1 para o maior em tudo", () => {
    expect(standingIn(peers[0]!, peers, 0.6)).toBeCloseTo(1, 5);
    expect(standingIn(peers[1]!, peers, 0.6)).toBeCloseTo(0, 5);
  });
  it("o dinheiro separa clubes com a mesma reputação", () => {
    const flat = [{ reputation: 3000, finances: 8_000_000 }, { reputation: 3000, finances: 200_000 }, { reputation: 3000, finances: 1_000_000 }];
    const [rich, poor, mid] = flat.map((c) => standingIn(c, flat, 0.6)) as [number, number, number];
    expect(rich).toBeCloseTo(1, 5);
    expect(poor).toBeCloseTo(0, 5);
    expect(mid).toBeGreaterThan(poor);
    expect(mid).toBeLessThan(rich);
  });
  it("tudo igual: posição a meio", () => {
    const same = [{ reputation: 1, finances: 100 }, { reputation: 1, finances: 100 }];
    expect(standingIn(same[0]!, same, 0.6)).toBe(0.5);
  });
});
