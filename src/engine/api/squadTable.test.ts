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

  it("a ficha mostra o agente a todos e as cláusulas só no teu clube", async () => {
    const clubs = await handle({ id: 10, type: "clubs", input: null }, s);
    repository.setMeta("gamer.club", clubs[0]!.id);
    const mine = repository.clubPlayers(clubs[0]!.id)[0]!.person;
    const theirs = repository.clubPlayers(clubs[1]!.id)[0]!.person;
    for (const p of [mine, theirs]) repository.saveContract({ ...repository.contract(p)!, clauses: { release: 1234567, resale: { club: clubs[2]!.id, pct: 0.2 } } });
    const own = (await handle({ id: 11, type: "personProfile", input: { id: mine } }, s))!;
    const other = (await handle({ id: 12, type: "personProfile", input: { id: theirs } }, s))!;
    expect(own.clauses).toMatchObject({ release: 1234567, resale: { pct: 0.2, club: { id: clubs[2]!.id } } });
    expect(other.clauses).toBeUndefined();
    const withAgent = repository.clubPlayers(clubs[1]!.id).find((j) => j.agent);
    if (withAgent) expect((await handle({ id: 13, type: "personProfile", input: { id: withAgent.person } }, s))!.agent?.id).toBe(withAgent.agent);
  });
});
