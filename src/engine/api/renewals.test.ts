import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { handle, type Servicos } from "./handler";
import { MemoryRepository } from "../persistence/repositoryMemory";

describe("API de renovações (RZ-165)", { timeout: 120000 }, () => {
  const repository = new MemoryRepository();
  const read = (f: string) => readFileSync(`data/${f}.csv`, "utf8");
  const s: Servicos = {
    now: () => new Date(2026, 9, 15),
    openRepository: async () => ({ repository, backend: "memory", sqliteVersion: "test" }),
    loadData: async () => ({ clubs: read("clubs"), cities: read("cities"), localities: read("localities"), rivalries: read("rivalries"), districts: read("districts"), countries: read("countries") }),
  };

  it("sem clube do gamer não há renovações; com clube lista, negoceia e regista decisões", async () => {
    await handle({ id: 1, type: "createWorld", input: { seed: "ren" } }, s);
    expect((await handle({ id: 2, type: "renewals", input: null }, s)).lines).toEqual([]);
    const clubs = await handle({ id: 3, type: "clubs", input: null }, s);
    const club = clubs[5]!;
    repository.setMeta("gamer.club", club.id);
    const first = (await handle({ id: 4, type: "renewals", input: null }, s)).lines;
    // contratos que só acabam em anos futuros não aparecem; forçamos dois a expirar
    const ids = repository.clubPlayers(club.id).slice(0, 2).map((j) => j.person);
    for (const p of ids) repository.saveContract({ ...repository.contract(p)!, end: "2027-06-30" });
    const lines = (await handle({ id: 5, type: "renewals", input: null }, s)).lines;
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines.length).toBeGreaterThanOrEqual(first.length);
    const l = lines.find((x) => x.id === ids[0])!;
    expect(l.ask.wage).toBeGreaterThan(0);
    const mid = await handle({ id: 6, type: "negotiateRenewal", input: { person: l.id, wage: Math.floor(l.ask.wage * 0.7), years: 2, release: l.ask.release } }, s);
    expect(["counter", "closed"]).toContain(mid.status);
    if (mid.status === "closed") return; // jogador sem interesse: não há mais a negociar
    const ok = await handle({ id: 7, type: "negotiateRenewal", input: { person: l.id, wage: mid.terms.wage, years: mid.terms.years, release: mid.terms.release } }, s);
    expect(ok.status).toBe("accepted");
    await handle({ id: 8, type: "releaseExpiring", input: { person: ids[1]! } }, s);
    const after = (await handle({ id: 9, type: "renewals", input: null }, s)).lines;
    expect(after.find((x) => x.id === ids[0])?.decision).toMatchObject({ kind: "renew" });
    expect(after.find((x) => x.id === ids[1])?.decision).toEqual({ kind: "release" });
    await expect(handle({ id: 10, type: "releaseExpiring", input: { person: "nao-existe" } }, s)).rejects.toThrow();
  });
});
