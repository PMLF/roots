import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS as P } from "../config/parameters";
import { importData } from "../data/importData";
import { MemoryRepository } from "../persistence/repositoryMemory";
import { generateWorld } from "../world/generateWorld";
import { importCountries } from "../world/countries";
import { makeAppeal } from "./appeal";

const read = (f: string) => readFileSync(`data/${f}`, "utf8");
const d = importData({ clubs: read("clubs.csv"), cities: read("cities.csv"), localities: read("localities.csv"), rivalries: read("rivalries.csv"), districts: read("districts.csv") });
const pr = importCountries(read("countries.csv"));
if (!d.ok || !pr.ok) throw new Error("invalid data");
const data = d.data;

describe("atração e decisão do jogador (RZ-266)", { timeout: 120000 }, () => {
  const repo = new MemoryRepository();
  repo.setMeta("seed", "appeal");
  repo.saveWorld(generateWorld({ seed: "appeal", data, countries: pr.countries, params: P }));
  const appeal = makeAppeal(repo, data, P);
  const byRep = (tier: string) => data.clubs.filter((c) => c.tier === tier).sort((a, b) => b.reputation - a.reputation);
  const top = byRep("firstLeague")[0]!;
  const low = byRep("cp").at(-1)!;
  const mid = byRep("secondLeague")[0]!;
  const player = repo.clubPlayers(top.id).find((j) => j.state === "active")!.person;
  const wage = 5000;

  it("um grande atrai mais do que um clube pequeno; a cidade também conta", () => {
    expect(appeal.club(top)).toBeGreaterThan(appeal.club(low));
    expect(appeal.club(top)).toBeGreaterThan(appeal.club(mid));
    expect(appeal.city(top.city)).toBeGreaterThanOrEqual(0);
    expect(appeal.city(top.city)).toBeLessThanOrEqual(1);
  });

  it("subir de escalão convence; descer com o mesmo ordenado dificilmente", () => {
    const up = appeal.decide({ person: player, from: low, to: top, currentWage: wage, newWage: wage, starter: true });
    const down = appeal.decide({ person: player, from: top, to: low, currentWage: wage, newWage: wage, starter: true });
    expect(up.p).toBeGreaterThan(down.p + 0.3);
    expect(up.delta).toBeGreaterThan(0);
    expect(down.delta).toBeLessThan(0);
  });

  it("muito dinheiro compensa parte da descida; o lugar no onze também pesa", () => {
    const base = { person: player, from: top, to: mid, currentWage: wage, starter: true } as const;
    const same = appeal.decide({ ...base, newWage: wage }).p;
    const rich = appeal.decide({ ...base, newWage: wage * 2.5 }).p;
    expect(rich).toBeGreaterThan(same);
    expect(appeal.decide({ ...base, newWage: wage, starter: false }).p).toBeLessThan(same);
  });

  it("um livre aceita mais depressa do que quem tem clube", () => {
    const free = appeal.decide({ person: player, to: mid, currentWage: 0, newWage: wage, starter: true });
    const employed = appeal.decide({ person: player, from: top, to: mid, currentWage: wage, newWage: wage, starter: true });
    expect(free.p).toBeGreaterThan(employed.p);
  });

  it("ser da terra ajuda: voltar à cidade natal aumenta a vontade", () => {
    const person = repo.person(player)!;
    const home = data.clubs.find((c) => c.city === person.birthCity && c.id !== top.id);
    if (!home) return; // cidade sem outro clube neste mundo
    const away = data.clubs.find((c) => c.tier === home.tier && c.city !== home.city)!;
    const a = appeal.decide({ person: player, from: top, to: home, currentWage: wage, newWage: wage, starter: true }).p;
    const b = appeal.decide({ person: player, from: top, to: away, currentWage: wage, newWage: wage, starter: true }).p;
    expect(a).toBeGreaterThan(b - 0.2);
  });
});
