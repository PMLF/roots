import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { importData } from "../data/importData";
import { seatOf } from "./profile";

const read = (f: string) => readFileSync(new URL(`../../../data/${f}.csv`, import.meta.url), "utf-8");
const r = importData({ clubs: read("clubs"), cities: read("cities"), localities: read("localities"), rivalries: read("rivalries"), districts: read("districts") });
if (!r.ok) throw new Error(r.errors.slice(0, 5).join("\n"));
const data = r.data;

describe("sede do concelho (RZ-238)", () => {
  it("todo o concelho com localidades tem uma sede que lhe pertence", () => {
    for (const c of data.cities) {
      const seat = seatOf(data, c.id);
      const own = data.localities.filter((l) => l.city === c.id);
      if (own.length > 0) expect(own.map((l) => l.id)).toContain(seat.id);
    }
  });
  it("a sede é a localidade marcada como sede; sem marca, a mais populosa", () => {
    expect(seatOf(data, "odemira").id).toBe("odemira@odemira");
    const noHost = data.cities.find((c) => data.localities.filter((l) => l.city === c.id).every((l) => !l.host) && data.localities.some((l) => l.city === c.id));
    if (noHost) {
      const own = data.localities.filter((l) => l.city === noHost.id).sort((a, b) => b.population - a.population);
      expect(seatOf(data, noHost.id).id).toBe(own[0]!.id);
    }
  });
});
