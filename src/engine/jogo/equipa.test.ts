import { describe, expect, it } from "vitest";
import { ATTRIBUTES, type Attributes } from "../mundo/tipos";
import { teamStrength, automaticLineup, type LineupCandidate } from "./equipa";
import { syntheticTeam } from "./teste-util";

const attr = (n: number, extra: Partial<Attributes> = {}): Attributes => {
  const a = {} as Attributes;
  for (const k of ATTRIBUTES) a[k] = n;
  return Object.assign(a, extra);
};
const cand = (person: string, pos: string, level: number, extra: Partial<Attributes> = {}): LineupCandidate => ({ person, positions: [{ pos, aptitude: 20 }], attributes: attr(level, extra), heightCm: 180 });

describe("team", () => {
  it("a força sobe com a qualidade, linha a linha", () => {
    const weak = teamStrength(syntheticTeam("A", 6).lineup);
    const strong = teamStrength(syntheticTeam("B", 14).lineup);
    for (const k of ["attack", "control", "defence", "goalkeeper"] as const) expect(strong[k]).toBeGreaterThan(weak[k]);
    const attackOnly = teamStrength(syntheticTeam("C", 10, { finishing: 20, dribble: 20, unmarking: 20, speed: 20, technical: 20 }).lineup);
    expect(attackOnly.attack).toBeGreaterThan(15);
    expect(attackOnly.defence).toBeCloseTo(10, 5);
  });

  it("o onze automático põe cada um onde rende mais e usa 11 jogadores diferentes", () => {
    const squad: LineupCandidate[] = [
      cand("gr1", "GK", 8), cand("gr2", "GK", 14),
      ...["rb", "cb1", "cb2", "cb3", "lb", "dm", "cm1", "cm2", "am", "rw", "lw", "st1", "st2"].map((id, i) => cand(id, id.replace(/\d/g, "").toUpperCase(), 9 + (i % 4))),
    ];
    const lineup = automaticLineup(squad);
    expect(lineup).toHaveLength(11);
    expect(new Set(lineup.map((j) => j.id)).size).toBe(11);
    expect(lineup.find((j) => j.position === "GK")?.id).toBe("gr2");
    expect(automaticLineup(squad)).toEqual(lineup);
  });

  it("sem guarda-redes à vista, ainda assim monta onze (pior)", () => {
    const without = Array.from({ length: 14 }, (_, i) => cand(`p${i}`, "CM", 10));
    expect(automaticLineup(without)).toHaveLength(11);
  });
});
