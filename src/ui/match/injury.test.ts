import { describe, expect, it } from "vitest";
import { pendingInjuries } from "./injury";

const team = [{ id: "a", name: "Rui" }, { id: "b", name: "Davi" }] as never;
const base = { gamerSide: "home" as const, teams: { home: team, away: [] } as never };

describe("lesionados à espera de troca", () => {
  it("sem lesão pendente o jogo corre", () => {
    expect(pendingInjuries({ ...base, subs: { used: 0, max: 5 } as never })).toEqual({ names: [], mustReplace: false });
  });
  it("com lesão e substituições, tem de se substituir", () => {
    expect(pendingInjuries({ ...base, pendingInjury: ["a"], subs: { used: 4, max: 5 } as never })).toEqual({ names: ["Rui"], mustReplace: true });
  });
  it("sem substituições já não bloqueia", () => {
    expect(pendingInjuries({ ...base, pendingInjury: ["a", "b"], subs: { used: 5, max: 5 } as never })).toEqual({ names: ["Rui", "Davi"], mustReplace: false });
  });
});
