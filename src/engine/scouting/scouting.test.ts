import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { handle, type Servicos } from "../api/handler";
import { MemoryRepository } from "../persistence/repositoryMemory";
import { DEFAULT_PARAMETERS as P } from "../config/parameters";
import { reach } from "./scouting";

describe("scouting", { timeout: 120000 }, () => {
  const repository = new MemoryRepository();
  const read = (f: string) => readFileSync(`data/${f}.csv`, "utf8");
  const s: Servicos = {
    now: () => new Date(2026, 9, 15),
    openRepository: async () => ({ repository, backend: "memory", sqliteVersion: "test" }),
    loadData: async () => ({ clubs: read("clubs"), cities: read("cities"), localities: read("localities"), rivalries: read("rivalries"), districts: read("districts"), countries: read("countries") }),
  };

  /** Avança dia a dia (confirmando os jogos do gamer) até à data. */
  const until = async (date: string) => {
    for (let i = 0; i < 80; i++) {
      const r = await handle({ id: 500 + i, type: "advance", input: { mode: "day" } }, s);
      if (r.pause) await handle({ id: 600 + i, type: "confirmMatch", input: { match: r.pause.match } }, s);
      if (r.state.today >= date) return;
    }
  };

  it("o alcance sobe com os olheiros e mostra bem menos estrangeiros", async () => {
    expect(reach(2, P)).toBeGreaterThan(reach(1, P));
    expect(reach(100, P)).toBe(P.scouting.reach.max);
    await handle({ id: 1, type: "createWorld", input: { seed: "scouting" } }, s);
    const clubs = await handle({ id: 2, type: "clubs", input: null }, s);
    repository.setMeta("gamer.club", clubs[0]!.id);
    repository.setMeta("date.today", "2026-10-15");
    repository.setMeta("balance." + clubs[0]!.id, "100000");
    const d = await handle({ id: 3, type: "scouting", input: null }, s);
    expect(d.scouts.count).toBe(1);
    expect(d.rows.length).toBeGreaterThan(200);
    const foreign = d.rows.filter((r) => r.club?.foreign).length;
    const domestic = d.rows.filter((r) => r.club && !r.club.foreign).length;
    expect(foreign).toBeGreaterThan(0);
    expect(foreign).toBeLessThan(domestic * 0.1);
    expect(d.rows.every((r) => r.knowledge === "none" && r.rating === undefined)).toBe(true);
    expect(d.rows.some((r) => r.club === undefined)).toBe(true);
  });

  it("uma semana dá estimativas, um mês dá tudo, a pesquisa traz uma lista e cada ordem custa dinheiro", async () => {
    const before = await handle({ id: 11, type: "scouting", input: null }, s);
    const target = before.rows.find((r) => r.club && !r.club.foreign)!;
    const cash0 = before.balance;
    expect(await handle({ id: 12, type: "scoutOrder", input: { kind: "week", person: target.id } }, s)).toEqual({ ok: true });
    const mid = await handle({ id: 13, type: "scouting", input: null }, s);
    expect(mid.balance).toBe(cash0 - before.cost.week);
    // só há um olheiro: não cabe outra ordem ao mesmo tempo
    expect(await handle({ id: 14, type: "scoutOrder", input: { kind: "month", person: target.id } }, s)).toEqual({ ok: false, reason: "busy" });
    await until("2026-10-24");
    const week = (await handle({ id: 20, type: "scouting", input: null }, s)).rows.find((r) => r.id === target.id)!;
    expect(week.knowledge).toBe("week");
    expect(week.rating?.stars).toBeGreaterThan(0);
    expect(await handle({ id: 21, type: "scoutOrder", input: { kind: "search", position: "GK", maxAge: 24 } }, s)).toEqual({ ok: true });
    await until("2026-11-12");
    const after = await handle({ id: 40, type: "scouting", input: null }, s);
    const found = after.rows.filter((r) => r.found);
    expect(found.length).toBeGreaterThan(0);
    expect(found.length).toBeLessThanOrEqual(P.scouting.search.results);
    expect(found.every((r) => r.position === "GK" && r.age <= 24 && r.rating !== undefined)).toBe(true);
    expect(after.orders.some((o) => o.kind === "search" && o.done && (o.results ?? 0) > 0)).toBe(true);
  });

  it("sem caixa não há observação", async () => {
    const clubs = await handle({ id: 50, type: "clubs", input: null }, s);
    repository.setMeta("balance." + clubs[0]!.id, "10");
    const d = await handle({ id: 51, type: "scouting", input: null }, s);
    expect(await handle({ id: 52, type: "scoutOrder", input: { kind: "month", person: d.rows[0]!.id } }, s)).toEqual({ ok: false, reason: "noCash" });
  });
});
