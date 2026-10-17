import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { handle, type Servicos } from "./handler";
import { MemoryRepository } from "../persistence/repositoryMemory";

describe("tabela do plantel", { timeout: 120000 }, () => {
  const repository = new MemoryRepository();
  const read = (f: string) => readFileSync(`data/${f}.csv`, "utf8");
  const s: Servicos = {
    now: () => new Date(2026, 9, 15),
    openRepository: async () => ({ repository, backend: "memory", sqliteVersion: "test" }),
    loadData: async () => ({ clubs: read("clubs"), cities: read("cities"), localities: read("localities"), rivalries: read("rivalries"), districts: read("districts"), countries: read("countries") }),
  };

  it("mostra o salário só no teu clube e marca os lesionados", async () => {
    await handle({ id: 1, type: "createWorld", input: { seed: "squad-table" } }, s);
    const clubs = await handle({ id: 2, type: "clubs", input: null }, s);
    repository.setMeta("gamer.club", clubs[0]!.id);
    repository.setMeta("date.today", "2026-10-15");
    const own = (await handle({ id: 3, type: "clubProfile", input: { id: clubs[0]!.id } }, s))!;
    const other = (await handle({ id: 4, type: "clubProfile", input: { id: clubs[1]!.id } }, s))!;
    expect(Object.values(own.extraSquad).every((x) => typeof x.wage === "number")).toBe(true);
    expect(Object.values(other.extraSquad).some((x) => x.wage !== undefined)).toBe(false);
    const hurt = own.squad[0]!.id;
    repository.appendEvent({ type: "INJURY", date: "2026-10-01", season: 1, entities: [{ k: "club", id: own.id }, { k: "person", id: hurt, roleKind: "injured" }], data: { until: "2026-11-01" }, visibility: "public" } as never);
    const again = (await handle({ id: 5, type: "clubProfile", input: { id: own.id } }, s))!;
    expect(again.extraSquad[hurt]?.injured).toBe(true);
    expect(Object.values(again.extraSquad).filter((x) => x.injured)).toHaveLength(1);
  });
});
