import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { handle, type Servicos } from "../api/handler";
import { MemoryRepository } from "../persistence/repositoryMemory";

const read = (f: string) => readFileSync(`data/${f}.csv`, "utf8");
const servicos = (): Servicos => {
  const repository = new MemoryRepository();
  return {
    now: () => new Date(2026, 9, 15),
    openRepository: async () => ({ repository, backend: "memory" as const, sqliteVersion: "test" }),
    loadData: async () => ({ clubs: read("clubs"), cities: read("cities"), localities: read("localities"), rivalries: read("rivalries"), districts: read("districts"), countries: read("countries") }),
  };
};

describe("aviso da janela de transferências", () => {
  it("avisa na caixa quando a janela de transferências abre e fecha", async () => {
    const s = servicos();
    await handle({ id: 1, type: "createWorld", input: { seed: "janela" } }, s);
    const club = (await handle({ id: 3, type: "clubs", input: null }, s))[5]!;
    await handle({ id: 4, type: "chooseClub", input: { id: club.id } }, s);
    let types: string[] = [];
    for (let i = 0; i < 80 && !(types.includes("market_open") && types.includes("market_close")); i++) {
      const r = await handle({ id: 100 + i * 3, type: "advance", input: { mode: "nextMatch" } }, s);
      if (r.pause) { await handle({ id: 101 + i * 3, type: "confirmMatch", input: { match: r.pause.match } }, s); await handle({ id: 102 + i * 3, type: "advance", input: { mode: "day" } }, s); }
      types = (await handle({ id: 5000 + i, type: "inbox", input: {} }, s)).messages.map((m) => m.type);
    }
    expect(types).toContain("market_open");
    expect(types).toContain("market_close");
  }, 240000);
});
