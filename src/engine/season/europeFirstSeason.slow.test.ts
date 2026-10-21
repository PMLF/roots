import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { handle, type Servicos } from "../api/handler";
import { MemoryRepository } from "../persistence/repositoryMemory";
const read = (f: string) => readFileSync(`data/${f}.csv`, "utf8");
it("a Europa já existe na 1.ª época, com portugueses por reputação", async () => {
  const repository = new MemoryRepository();
  const s: Servicos = { now: () => new Date(2026, 9, 15), openRepository: async () => ({ repository, backend: "memory" as const, sqliteVersion: "t" }), loadData: async () => ({ clubs: read("clubs"), cities: read("cities"), localities: read("localities"), rivalries: read("rivalries"), districts: read("districts"), countries: read("countries") }) };
  await handle({ id: 1, type: "createWorld", input: { seed: "x" } }, s);
  await handle({ id: 2, type: "advance", input: { mode: "week" } }, s);
  const cups = await handle({ id: 3, type: "europeCups", input: null }, s);
  const portuguese = new Set(read("clubs").split("\n").slice(1).map((l) => l.split(",")[0]));
  const first = await handle({ id: 5, type: "competitions", input: null }, s);
  expect(first.length).toBeGreaterThan(0);
  const entrants = Object.fromEntries(cups.map((c) => [c.competition, (c as unknown as { table: { club: string; name: string }[] }).table]));
  // na 1.ª época já há competições europeias, com clubes portugueses (os de maior reputação) e nomes legíveis (nunca ids)
  for (const [competition, table] of Object.entries(entrants)) {
    expect(table.length, competition).toBe(36);
    expect(table.some((l) => l.name.startsWith("x-")), competition).toBe(false);
    expect(table.filter((l) => portuguese.has(l.club)).length, competition).toBeGreaterThan(0);
  }
  // sem campeões europeus anteriores ao arranque
  expect(repository.count("CHAMPION", { k: "competition", id: "Liga dos Campeões" })).toBe(0);
}, 300000);
