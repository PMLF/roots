import { readFileSync } from "node:fs";
import { DEFAULT_PARAMETERS as P } from "../config/parameters";
import { importData } from "../data/importData";
import { MemoryRepository } from "../persistence/repositoryMemory";
import { generateWorld } from "../world/generateWorld";
import { importCountries } from "../world/countries";
import { currentQuality } from "../world/player";
import type { Attributes, Position } from "../world/types";
import { rolloverSquads } from "./rollover";

const read = (f: string) => readFileSync(`data/${f}`, "utf8");
const d = importData({ clubs: read("clubs.csv"), cities: read("cities.csv"), localities: read("localities.csv"), rivalries: read("rivalries.csv"), districts: read("districts.csv") });
export const pr = importCountries(read("countries.csv"));
if (!d.ok || !pr.ok) throw new Error("invalid data");
export const data = d.data;
export const tiers = new Map(data.clubs.map((c) => [c.id, c.tier] as const));

export const fresh = (seed: string) => {
  const repo = new MemoryRepository();
  repo.setMeta("seed", seed);
  repo.saveWorld(generateWorld({ seed, data, countries: pr.countries, params: P }));
  return repo;
};
export const run = (repo: MemoryRepository, seasons: number, gamerClub?: string) => {
  const out = [];
  for (let s = 1; s <= seasons; s++) out.push(rolloverSquads(repo, data, P, { season: s, seasonStart: `${2026 + s}-07-01`, tiers, ...(gamerClub ? { gamerClub } : {}) }));
  return out;
};
export const meanQuality = (repo: MemoryRepository, tier: string) => {
  let sum = 0, n = 0;
  for (const c of data.clubs.filter((x) => x.tier === tier)) for (const j of repo.clubPlayers(c.id)) { sum += currentQuality(j.attributes as Attributes, j.positions[0]!.pos as Position); n++; }
  return sum / n;
};
