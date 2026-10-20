import { describe, expect, it } from "vitest";
import type { LiveLine } from "@/engine/season/liveMatch";
import { alertOf, lineKey } from "./alerts";

const line = (over: Record<string, unknown>): LiveLine => ({ minute: 10, type: "shot", important: false, homeGoals: 0, awayGoals: 0, ...over }) as LiveLine;

describe("lances que param o tempo (RZ-254)", () => {
  it("golo, vermelho e lesão alertam; amarelo, remates e substituições não", () => {
    expect(alertOf(line({ type: "goal", side: "home" }))).toBe("goal");
    expect(alertOf(line({ type: "card", colour: "red" }))).toBe("red");
    expect(alertOf(line({ type: "card", colour: "red", secondYellow: true }))).toBe("red");
    expect(alertOf(line({ type: "injury", side: "away" }))).toBe("injury");
    expect(alertOf(line({ type: "card", colour: "yellow" }))).toBeUndefined();
    for (const type of ["shot", "corner", "penalty", "substitution", "halfTime", "start", "end"] as const) expect(alertOf(line({ type }))).toBeUndefined();
  });
  it("a chave distingue lances do mesmo minuto", () => {
    expect(lineKey(line({ type: "goal", side: "home", player: "a" }))).not.toBe(lineKey(line({ type: "goal", side: "away", player: "b" })));
    expect(lineKey(line({ type: "goal", side: "home", player: "a" }))).toBe(lineKey(line({ type: "goal", side: "home", player: "a" })));
  });
});
