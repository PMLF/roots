import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { handle, type Servicos } from "../api/handler";
import { MemoryRepository } from "../persistence/repositoryMemory";
import { DEFAULT_PARAMETERS as P } from "../config/parameters";
import { lockedPlayers } from "./bids";

describe("propostas do gamer", { timeout: 180000 }, () => {
  const repository = new MemoryRepository();
  const read = (f: string) => readFileSync(`data/${f}.csv`, "utf8");
  const s: Servicos = {
    now: () => new Date(2026, 11, 20),
    openRepository: async () => ({ repository, backend: "memory", sqliteVersion: "test" }),
    loadData: async () => ({ clubs: read("clubs"), cities: read("cities"), localities: read("localities"), rivalries: read("rivalries"), districts: read("districts"), countries: read("countries") }),
  };
  const until = async (date: string) => {
    for (let i = 0; i < 40; i++) {
      const r = await handle({ id: 500 + i, type: "advance", input: { mode: "day" } }, s);
      if (r.pause) await handle({ id: 600 + i, type: "confirmMatch", input: { match: r.pause.match } }, s);
      if (r.state.today >= date) return;
    }
  };
  let me = "";
  /** A resposta só chega daqui a um ou dois dias: avança até deixar de haver proposta pendente. */
  const settle = async (person: string) => {
    for (let i = 0; i < 4; i++) {
      const v = await handle({ id: 700 + i, type: "bid", input: { person, action: "open" } }, s);
      if (v.ok && !v.bid.pending) return v.bid;
      const r = await handle({ id: 800 + i, type: "advance", input: { mode: "day" } }, s);
      if (r.pause) await handle({ id: 900 + i, type: "confirmMatch", input: { match: r.pause.match } }, s);
    }
    throw new Error("a resposta não chegou");
  };

  it("um livre fecha contrato fora da janela e muda-se quando ela abre", async () => {
    await handle({ id: 1, type: "createWorld", input: { seed: "bids" } }, s);
    const clubs = await handle({ id: 2, type: "clubs", input: null }, s);
    me = clubs.find((c) => c.league === "Primeira Liga")!.id;
    repository.setMeta("gamer.club", me);
    repository.setMeta("date.today", "2026-12-28");
    repository.setMeta("balance." + me, "50000000");
    const free = repository.playersByState("free").find((j) => j.positions[0]?.pos !== "GK")!;
    const opened = await handle({ id: 3, type: "bid", input: { person: free.person, action: "open" } }, s);
    expect(opened.ok && opened.bid.stage).toBe("agent");
    expect(opened.ok && opened.bid.terms?.wages.length).toBeGreaterThan(2);
    const ask = opened.ok ? opened.bid.terms!.ask : undefined;
    const r = await handle({ id: 4, type: "bid", input: { person: free.person, action: "terms", wage: Math.round(ask!.wage * 3), years: 2, release: null } }, s);
    expect(r.ok && r.bid.pending?.kind).toBe("terms");
    const agreed = await settle(free.person);
    expect(agreed.stage).toBe("agreed");
    expect(agreed.needsConfirm).toBeTruthy();
    const inbox = repository.eventsOf({ k: "person", id: free.person }).filter((e) => e.type === "BID_REPLY");
    expect(inbox.length).toBeGreaterThan(0);
    const c = await handle({ id: 41, type: "bid", input: { person: free.person, action: "confirm" } }, s);
    expect(c.ok && c.bid.moving?.date).toBe("2027-01-01");
    expect(repository.player(free.person)!.club).toBeUndefined();
    expect(lockedPlayers(repository).has(free.person)).toBe(true);
    await until("2027-01-02");
    expect(repository.player(free.person)!.club).toBe(me);
    expect(repository.contract(free.person)!.monthlyWage).toBe(Math.round(ask!.wage * 3));
    expect(repository.player(free.person)!.state).toBe("active");
    const list = await handle({ id: 5, type: "bids", input: null }, s);
    expect(list.some((b) => b.person === free.person)).toBe(false);
  });

  it("proposta ridícula fecha a porta; valor alto é aceite e o dinheiro muda de mãos com o contrato", async () => {
    const clubs = await handle({ id: 10, type: "clubs", input: null }, s);
    const seller = clubs.find((c) => c.league.startsWith("Distrital") && repository.clubPlayers(c.id).length > 12)!;
    const target = repository.clubPlayers(seller.id).find((j) => j.positions[0]?.pos !== "GK")!;
    await handle({ id: 11, type: "bid", input: { person: target.person, action: "fee", fee: 1000 } }, s);
    const low = await settle(target.person);
    expect(low.stage).toBe("closed");
    expect(low.reopens).toBeTruthy();
    const other = repository.clubPlayers(seller.id).filter((j) => j.positions[0]?.pos !== "GK")[1]!;
    const balance = Number(repository.meta("balance." + me));
    await handle({ id: 12, type: "bid", input: { person: other.person, action: "fee", fee: 3000000 } }, s);
    const fee = await settle(other.person);
    expect(fee.stage).toBe("agent");
    const ask = fee.terms!.ask;
    expect(ask.release).toBeGreaterThan(0);
    await handle({ id: 13, type: "bid", input: { person: other.person, action: "terms", wage: ask.wage, years: 3, release: ask.release } }, s);
    const agreed = await settle(other.person);
    expect(agreed.stage).toBe("agreed");
    const done = await handle({ id: 14, type: "bid", input: { person: other.person, action: "confirm" } }, s);
    expect(done.ok && done.bid.stage).toBe("done");
    expect(repository.player(other.person)!.club).toBe(me);
    expect(repository.contract(other.person)!.clauses?.release).toBe(ask.release);
    expect(Number(repository.meta("balance." + me))).toBeLessThan(balance);
    const hist = repository.eventsOf({ k: "person", id: other.person }).filter((e) => e.type === "TRANSFER");
    expect(hist.length).toBe(1);
    void P;
  });

  it("aceitar a contraproposta do clube fecha o valor, sem nova contraproposta", async () => {
    const clubs = await handle({ id: 20, type: "clubs", input: null }, s);
    const seller = clubs.find((c) => c.league.startsWith("Distrital") && repository.clubPlayers(c.id).length > 12 && c.id !== me)!;
    const target = repository.clubPlayers(seller.id).filter((j) => j.positions[0]?.pos !== "GK")[2]!;
    const opened = await handle({ id: 21, type: "bid", input: { person: target.person, action: "open" } }, s);
    const low = opened.ok ? opened.bid.feeSuggestions[1]! : 0;
    await handle({ id: 22, type: "bid", input: { person: target.person, action: "fee", fee: low } }, s);
    let view = await settle(target.person);
    if (view.stage === "club" && view.ask !== undefined) {
      await handle({ id: 23, type: "bid", input: { person: target.person, action: "fee", fee: view.ask } }, s);
      view = await settle(target.person);
    }
    expect(["agent", "closed"]).toContain(view.stage);
    expect(view.lastReply?.status).not.toBe("counter");
  });
});
