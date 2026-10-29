import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { handle, type Servicos } from "../api/handler";
import { MemoryRepository } from "../persistence/repositoryMemory";
import { VARIANTS } from "./news";

const read = (f: string) => readFileSync(`data/${f}.csv`, "utf8");
const servicos = (): Servicos => {
  const repository = new MemoryRepository();
  return {
    now: () => new Date(2026, 9, 15),
    openRepository: async () => ({ repository, backend: "memory" as const, sqliteVersion: "test" }),
    loadData: async () => ({ clubs: read("clubs"), cities: read("cities"), localities: read("localities"), rivalries: read("rivalries"), districts: read("districts"), countries: read("countries") }),
  };
};

describe("notícias e caixa de entrada", () => {
  it("saem dos eventos: mundo ⊇ liga ⊇ clube; a caixa tem os resultados e sabe o que está por ler", async () => {
    const s = servicos();
    await handle({ id: 1, type: "createWorld", input: { seed: "news" } }, s);
    expect(await handle({ id: 2, type: "inbox", input: {} }, s)).toEqual({ messages: [], unread: 0 });
    const club = (await handle({ id: 3, type: "clubs", input: null }, s))[10]!;
    await handle({ id: 4, type: "chooseClub", input: { id: club.id } }, s);
    // só os resultados contra rivais vão para a caixa: joga-se até haver mensagens suficientes
    for (let i = 0; i < 40 && (await handle({ id: 9, type: "inbox", input: {} }, s)).messages.length < 3; i++) {
      const r = await handle({ id: 10 + i, type: "advance", input: { mode: "nextMatch" } }, s);
      if (r.pause) { await handle({ id: 30, type: "confirmMatch", input: { match: r.pause.match } }, s); await handle({ id: 31, type: "advance", input: { mode: "day" } }, s); }
    }
    const world = await handle({ id: 40, type: "news", input: { scope: "world", limit: 500 } }, s);
    const league = await handle({ id: 41, type: "news", input: { scope: "league", limit: 500 } }, s);
    const mine = await handle({ id: 42, type: "news", input: { scope: "club", limit: 500 } }, s);
    expect(world.length).toBeGreaterThan(5);
    const ids = (l: typeof world) => new Set(l.map((n) => n.id));
    for (const n of league) expect(ids(world).has(n.id)).toBe(true);
    for (const n of mine) expect(ids(league).has(n.id)).toBe(true);
    expect(league.length).toBeLessThanOrEqual(world.length);
    // ordem, variantes válidas e ligações com nome
    expect(world.every((n, i, a) => i === 0 || a[i - 1]!.id > n.id)).toBe(true);
    for (const n of world) {
      expect(n.variant).toBeGreaterThanOrEqual(1);
      expect(n.variant).toBeLessThanOrEqual(VARIANTS[n.type]);
      expect(n.links.length).toBeGreaterThan(0);
      expect(["outcome", "injury", "resignation", "signed"]).not.toContain(n.type);
    }
    // paginação
    const page = await handle({ id: 43, type: "news", input: { scope: "world", limit: 3 } }, s);
    const next = await handle({ id: 44, type: "news", input: { scope: "world", limit: 3, beforeOf: page.at(-1)!.id } }, s);
    expect(next.every((n) => n.id < page.at(-1)!.id)).toBe(true);
    // caixa: há mensagens e todas são do teu clube
    const cx = await handle({ id: 50, type: "inbox", input: {} }, s);
    expect(cx.messages.length).toBeGreaterThanOrEqual(3);
    expect(cx.messages.every((m) => m.ofClubYour)).toBe(true);
    expect(cx.unread).toBe(cx.messages.length);
    // «Avançar» vai à mensagem por ler mais antiga (RZ-257)
    const attention = await handle({ id: 49, type: "attention", input: null }, s);
    expect(attention.unread).toBe(Math.min(...cx.messages.map((m) => m.id)));
    await handle({ id: 51, type: "markInboxRead", input: null }, s);
    const isRead = await handle({ id: 52, type: "inbox", input: {} }, s);
    expect(isRead.unread).toBe(0);
    expect(isRead.messages.every((m) => m.isRead)).toBe(true);
    // marcar à mão: uma mensagem lida volta a por ler e uma nova passa a lida, sem mexer nas outras
    const target = isRead.messages[0]!;
    await handle({ id: 57, type: "markMessage", input: { id: target.id, isRead: false } }, s);
    const um = await handle({ id: 58, type: "inbox", input: {} }, s);
    expect(um.unread).toBe(1);
    expect(um.messages.filter((m) => !m.isRead).map((m) => m.id)).toEqual([target.id]);
    await handle({ id: 59, type: "markMessage", input: { id: target.id, isRead: true } }, s);
    expect((await handle({ id: 60, type: "inbox", input: {} }, s)).unread).toBe(0);
    // novos jogos voltam a trazer mensagens por ler
    // (só os jogos contra rivais, lesões e propostas dão mensagem: avança-se até haver uma)
    let unread = 0;
    for (let i = 0; i < 12 && unread === 0; i++) {
      const r = await handle({ id: 100 + i * 3, type: "advance", input: { mode: "nextMatch" } }, s);
      if (r.pause) { await handle({ id: 101 + i * 3, type: "confirmMatch", input: { match: r.pause.match } }, s); await handle({ id: 102 + i * 3, type: "advance", input: { mode: "day" } }, s); }
      unread = (await handle({ id: 56, type: "inbox", input: {} }, s)).unread;
    }
    expect(unread).toBeGreaterThan(0);
  }, 180000);

  it("o gamer demitido continua a ver a sua carreira na caixa", async () => {
    const s = servicos();
    await handle({ id: 1, type: "createWorld", input: { seed: "demitido" } }, s);
    const club = (await handle({ id: 3, type: "clubs", input: null }, s))[5]!;
    await handle({ id: 4, type: "chooseClub", input: { id: club.id } }, s);
    await handle({ id: 5, type: "resign", input: null }, s);
    const cx = await handle({ id: 6, type: "inbox", input: {} }, s);
    expect(cx.messages.map((m) => m.type)).toContain("resignation");
    // a demissão está por ler (se o clube estiver nas europeias, o sorteio e o apuramento também)
    expect(cx.messages.find((m) => m.type === "resignation")?.isRead).toBe(false);
    expect(cx.messages.filter((m) => m.type !== "resignation" && m.type !== "club_offer" && !m.type.startsWith("europe_"))).toEqual([]);
  }, 60000);

  it("depois de demitido, a caixa só traz imprensa: nada de resultados nem lesões internas", async () => {
    const s = servicos();
    await handle({ id: 1, type: "createWorld", input: { seed: "demitido-imprensa" } }, s);
    const club = (await handle({ id: 3, type: "clubs", input: null }, s))[5]!;
    await handle({ id: 4, type: "chooseClub", input: { id: club.id } }, s);
    for (let i = 0; i < 3; i++) {
      const r = await handle({ id: 10 + i * 3, type: "advance", input: { mode: "nextMatch" } }, s);
      if (r.pause) { await handle({ id: 11 + i * 3, type: "confirmMatch", input: { match: r.pause.match } }, s); await handle({ id: 12 + i * 3, type: "advance", input: { mode: "day" } }, s); }
    }
    await handle({ id: 41, type: "resign", input: null }, s);
    const after = await handle({ id: 42, type: "inbox", input: {} }, s);
    expect(after.messages.map((m) => m.type)).toContain("resignation");
    expect(after.messages.some((m) => m.type === "outcome" || m.type === "injury")).toBe(false);
  }, 180000);

  it("despedimentos, contratações e reformas de treinadores só são notícia nas duas primeiras divisões", async () => {
    const repository = new MemoryRepository();
    const s: Servicos = { ...servicos(), openRepository: async () => ({ repository, backend: "memory" as const, sqliteVersion: "test" }) };
    await handle({ id: 1, type: "createWorld", input: { seed: "mexidas" } }, s);
    const clubs = await handle({ id: 2, type: "clubCatalog", input: null }, s);
    const big = clubs.find((c) => c.tier === "firstLeague")!;
    const small = clubs.find((c) => c.tier === "district")!;
    const coach = (club: string) => repository.roleHolders("coach").find((id) => repository.role(id)?.club === club)!;
    const emit = (type: "COACH_SACKED" | "COACH_HIRED", club: string) => repository.appendEvent({ type, date: "2026-10-20", season: 1, visibility: "exposed", origin: "generated", entities: [{ k: "person", id: coach(club), roleKind: "coach" }, { k: "club", id: club, roleKind: type === "COACH_SACKED" ? "sacked" : "hirer" }], data: type === "COACH_SACKED" ? { reason: "results" } : { from: "free" } });
    emit("COACH_SACKED", big.id); emit("COACH_HIRED", big.id); emit("COACH_SACKED", small.id);
    const world = await handle({ id: 3, type: "news", input: { scope: "world", limit: 500 } }, s);
    expect(world.filter((n) => n.type === "coach_sacked").map((n) => n.links.find((l) => l.k === "club")?.id)).toEqual([big.id]);
    expect(world.filter((n) => n.type === "coach_hired")).toHaveLength(1);
  }, 60000);

  it("as notícias relevantes vêm por ordem: o teu clube, os rivais, a tua divisão e os melhores do país", async () => {
    const repository = new MemoryRepository();
    const s: Servicos = { ...servicos(), openRepository: async () => ({ repository, backend: "memory" as const, sqliteVersion: "test" }) };
    await handle({ id: 1, type: "createWorld", input: { seed: "relevantes" } }, s);
    const cat = await handle({ id: 2, type: "clubCatalog", input: null }, s);
    const mine = cat.find((c) => c.tier === "secondLeague")!;
    await handle({ id: 3, type: "chooseClub", input: { id: mine.id } }, s);
    const rivalId = (await handle({ id: 4, type: "clubProfile", input: { id: mine.id } }, s))!.rival!.id;
    const division = cat.find((c) => c.league === mine.league && c.id !== mine.id && c.id !== rivalId)!;
    const top = cat.find((c) => c.tier === "firstLeague")!;
    const other = cat.find((c) => c.tier === "district")!;
    const coach = (club: string) => repository.roleHolders("coach").find((id) => repository.role(id)?.club === club)!;
    const emit = (club: string) => repository.appendEvent({ type: "COACH_SACKED", date: "2026-10-20", season: 1, visibility: "exposed", origin: "generated", entities: [{ k: "person", id: coach(club), roleKind: "coach" }, { k: "club", id: club, roleKind: "sacked" }], data: { reason: "results" } });
    // por ordem inversa de relevância, para o id não ajudar
    for (const club of [other.id, top.id, division.id, rivalId, mine.id]) emit(club);
    const list = await handle({ id: 5, type: "news", input: { scope: "relevant", limit: 10 } }, s);
    const clubs = list.filter((n) => n.type === "coach_sacked").map((n) => n.links.find((l) => l.k === "club")?.id);
    expect(clubs).toEqual([mine.id, rivalId, division.id, top.id]);
  }, 60000);
});
