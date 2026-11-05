/**
 * Realismo do mercado (RZ-266/267/268), medido numa simulação a sério (duas épocas pelo `handle`, com passagem de época, contratos a
 * acabar e janelas de verão e inverno): volume de contratações por clube, saltos de escalão, empréstimos e chamadas de volta.
 * Os clubes nunca largam jogadores para os livres por causa de uma contratação: vendem ou emprestam.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { handle, type Servicos } from "../api/handler";
import { MemoryRepository } from "../persistence/repositoryMemory";
import { activeLoans } from "../loans/loans";

const read = (f: string) => readFileSync(`data/${f}.csv`, "utf8");
const servicos = (): Servicos => {
  const repository = new MemoryRepository();
  return {
    now: () => new Date(2026, 9, 15),
    openRepository: async () => ({ repository, backend: "memory" as const, sqliteVersion: "test" }),
    loadData: async () => ({ clubs: read("clubs"), cities: read("cities"), localities: read("localities"), rivalries: read("rivalries"), districts: read("districts"), countries: read("countries") }),
  };
};
const TIERS = ["Primeira", "Segunda", "Terceira", "CP", "Distrital"];

describe("realismo do mercado", { timeout: 1500000 }, () => {
  it("volume, escalões e empréstimos numa simulação de duas épocas", async () => {
    const s = servicos();
    await handle({ id: 1, type: "createWorld", input: { seed: "realismo" } }, s);
    const { repository: repo } = await s.openRepository();
    const clubs = await handle({ id: 2, type: "clubs", input: null }, s);
    const tier = (id: string) => { const l = clubs.find((c) => c.id === id)?.league ?? "Distrital"; const i = TIERS.findIndex((t) => l.startsWith(t) || l.includes(t)); return i < 0 ? 4 : i; };
    let seasonsEnded = 0, keeps = 0;
    while (seasonsEnded < 2 && keeps++ < 200) {
      const r = await handle({ id: 3, type: "advance", input: { mode: "week" } }, s);
      if (r.seasonEnd) seasonsEnded++;
    }
    // continua até ao fim das janelas da 2.ª época (verão e inverno)
    for (let i = 0; i < 24; i++) await handle({ id: 4, type: "advance", input: { mode: "week" } }, s);
    const evs = new Map<string, ReturnType<MemoryRepository["eventsOf"]>[number]>();
    for (const c of clubs) for (const e of repo.eventsOf({ k: "club", id: c.id }, {})) evs.set(String(e.id), e);
    const all = [...evs.values()];
    const incoming = (window: string) => {
      const perClub = new Map<string, number>(clubs.map((c) => [c.id, 0]));
      for (const e of all) {
        if ((e.data as { window?: string }).window !== window) continue;
        const buyer = e.type === "TRANSFER" ? e.entities.find((x) => x.roleKind === "buyer") : e.type === "PLAYER_SIGNED" ? e.entities.find((x) => x.k === "club" && x.roleKind === undefined) : undefined;
        if (buyer) perClub.set(buyer.id, (perClub.get(buyer.id) ?? 0) + 1);
      }
      const xs = [...perClub.values()];
      return { mean: +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2), twoPlus: +(xs.filter((x) => x >= 2).length / xs.length).toFixed(2) };
    };
    const windows = [...new Set(all.map((e) => (e.data as { window?: string }).window).filter(Boolean))].sort() as string[];
    const volume = Object.fromEntries(windows.map((w) => [w, incoming(w)]));
    const transfers = all.filter((e) => e.type === "TRANSFER");
    const diffs = transfers.map((e) => tier(e.entities.find((x) => x.roleKind === "seller")!.id) - tier(e.entities.find((x) => x.roleKind === "buyer")!.id));
    const loans = all.filter((e) => e.type === "LOAN_STARTED");
    const ended = all.filter((e) => e.type === "LOAN_ENDED");
    const recalled = ended.filter((e) => (e.data as { reason?: string }).reason === "recalled").length;
    const released = all.filter((e) => e.type === "CONTRACT_EXPIRED" && (e.data as { reason?: string }).reason === "released").length;
    const fromTop = loans.filter((e) => tier(e.entities.find((x) => x.roleKind === "lender")!.id) <= tier(e.entities.find((x) => x.roleKind === "borrower")!.id)).length;
    process.stdout.write(`REALISMO ${JSON.stringify({ volume, transfers: transfers.length, up2: diffs.filter((d) => d >= 2).length, down: diffs.filter((d) => d < 0).length, loans: loans.length, recalled, ended: ended.length, active: activeLoans(repo).length, released, loansDownOrSame: fromTop })}\n`);
    // volume realista: cada clube muda vários jogadores no verão e alguns no inverno
    const summers = windows.filter((w) => w.endsWith("w0")), winters = windows.filter((w) => w.endsWith("w1"));
    expect(summers.length).toBeGreaterThan(0);
    for (const w of summers.slice(1)) { expect(volume[w]!.mean, w).toBeGreaterThan(2.5); expect(volume[w]!.twoPlus, w).toBeGreaterThan(0.6); }
    for (const w of winters) expect(volume[w]!.mean, w).toBeGreaterThan(0.5);
    // nunca largam para os livres; saltos de escalão controlados
    expect(released).toBe(0);
    expect(diffs.filter((d) => d >= 2).length / Math.max(1, diffs.length)).toBeLessThan(0.2);
    expect(diffs.filter((d) => d < 0).length / Math.max(1, diffs.length)).toBeLessThan(0.25);
    // empréstimos: só para o mesmo escalão ou inferior, acabam com a época e há chamadas de volta
    expect(loans.length).toBeGreaterThan(30);
    expect(fromTop / loans.length).toBeGreaterThan(0.95); // (o escalão lido é o de hoje: promoções e descidas a meio da época explicam o resto)
    expect(ended.length).toBeGreaterThan(0);
    expect(recalled).toBeGreaterThan(0);
  });
});
