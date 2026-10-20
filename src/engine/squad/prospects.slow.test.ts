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

describe("talento local ao longo das épocas (RZ-234)", () => {
  it("a geração inicial existe; os clubes contratam da terra na passagem de época e a seguinte nasce", async () => {
    const s = servicos();
    await handle({ id: 1, type: "createWorld", input: { seed: "prospects" } }, s);
    const { repository: repo } = await s.openRepository();
    const first = repo.playersByState("prospect");
    expect(first.length).toBeGreaterThan(800);
    expect(first.every((j) => j.club === undefined)).toBe(true);
    const ids = new Set(first.map((j) => j.person));
    let end = false, keeps = 0;
    while (!end && keeps++ < 90) end = (await handle({ id: 2, type: "advance", input: { mode: "week" } }, s)).seasonEnd;
    expect(end).toBe(true);
    // quem foi contratado passou a jogador de um clube e mantém a cidade natal; quem sobrou saiu do futebol
    const states = new Map<string, number>();
    for (const id of ids) { const st = repo.player(id)!.state; states.set(st, (states.get(st) ?? 0) + 1); }
    expect(states.get("active") ?? 0).toBeGreaterThan(200);
    expect(states.get("prospect") ?? 0).toBe(0);
    const signed = [...ids].filter((id) => repo.player(id)!.state === "active");
    expect(signed.every((id) => repo.player(id)!.club !== undefined && repo.contract(id) !== undefined)).toBe(true);
    // nova geração, e a API devolve os dois grupos
    const next = repo.playersByState("prospect");
    expect(next.length).toBeGreaterThan(800);
    expect(next.some((j) => ids.has(j.person))).toBe(false);
    const bornIn = repo.person(next[0]!.person)!.birthCity!;
    const talent = await handle({ id: 3, type: "localTalent", input: { city: bornIn } }, s) as { unsigned: { id: string }[]; atClubs: { club?: { id: string } }[] };
    expect(talent.unsigned.length).toBeGreaterThan(0);
    expect(talent.atClubs.every((r) => r.club !== undefined)).toBe(true);
  }, 600_000);
});
