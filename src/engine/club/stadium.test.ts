import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS as P } from "../config/parameters";
import type { Tier } from "../config/parameters";
import { data, fresh } from "../squad/testWorld.testlib";
import { clubBalance } from "./finances";
import { dailyCouncil, makeStadiumRequest, requestsOf } from "../council/requests";
import { aiStadiums, dailyStadium, defaultSectors, quoteWorks, stadiumCapacity, stadiumState, startWorks } from "./stadium";

const club = data.clubs.find((c) => c.stadium.ownership === "municipal" && c.tier === "firstLeague") ?? data.clubs.find((c) => c.stadium.ownership === "municipal")!;

describe("estádio (RZ-116)", () => {
  it("os setores somam a capacidade dos dados", () => {
    for (const c of data.clubs.slice(0, 50)) expect(Object.values(defaultSectors(c.stadium.capacity, P)).reduce((a, b) => a + b, 0)).toBe(c.stadium.capacity);
  });
  it("a obra custa, fecha parte do setor, e no fim abre os lugares novos", () => {
    const repo = fresh("estadio-obra");
    const base = stadiumCapacity(repo, club, P);
    expect(base).toBe(club.stadium.capacity);
    const cash = clubBalance(repo, club);
    const q = quoteWorks(P, club, "north", 1000);
    expect(q.councilShare).toBe(P.stadium.councilShare.municipal);
    const r = startWorks(repo, P, club, "north", 1000, "2026-08-01", 1);
    if (!r.ok) throw new Error(r.reason);
    expect(clubBalance(repo, club)).toBe(cash - q.cost);
    expect(stadiumCapacity(repo, club, P)).toBeLessThan(base);
    expect(startWorks(repo, P, club, "south", 1000, "2026-08-02", 1)).toEqual({ ok: false, reason: "ongoing" });
    dailyStadium(repo, data, P, "2026-09-01", 1);
    expect(stadiumState(repo, club, P).works).toBeDefined();
    dailyStadium(repo, data, P, r.end, 1);
    expect(stadiumState(repo, club, P).works).toBeUndefined();
    expect(stadiumCapacity(repo, club, P)).toBe(base + 1000);
    expect(repo.recentEvents({ types: ["STADIUM_WORKS_DONE"] })).toHaveLength(1);
  }, 60000);
  it("recusa obras pequenas, enormes ou sem caixa", () => {
    const repo = fresh("estadio-recusas");
    expect(startWorks(repo, P, club, "north", 10, "2026-08-01", 1)).toEqual({ ok: false, reason: "tooSmall" });
    expect(startWorks(repo, P, club, "north", club.stadium.capacity * 2, "2026-08-01", 1)).toEqual({ ok: false, reason: "tooBig" });
    repo.setMeta(`balance.${club.id}`, "0");
    expect(startWorks(repo, P, club, "north", 500, "2026-08-01", 1)).toEqual({ ok: false, reason: "cash" });
  }, 60000);
  it("alguns clubes do computador encomendam ampliações no fim da época", () => {
    const repo = fresh("estadio-ia");
    const rich = { ...P, stadium: { ...P.stadium, ai: { ...P.stadium.ai, occupancy: 0, probability: 1, cashCover: 0 } } };
    for (const c of data.clubs) repo.setMeta(`balance.${c.id}`, "100000000");
    aiStadiums(repo, data, rich, 1, "2027-06-30", new Map<string, Tier>(data.clubs.map((c) => [c.id, c.tier])));
    expect(repo.recentEvents({ types: ["STADIUM_WORKS_STARTED"] }).length).toBeGreaterThan(10);
  }, 60000);
  it("terreno apertado encarece a obra", () => {
    const tight = { ...club, stadium: { ...club.stadium, location: { ...club.stadium.location, expansionTerrain: 0 } } };
    const roomy = { ...club, stadium: { ...club.stadium, location: { ...club.stadium.location, expansionTerrain: 100 } } };
    expect(quoteWorks(P, tight, "north", 1000).cost).toBeGreaterThan(quoteWorks(P, roomy, "north", 1000).cost * 1.5);
  });
  it("a comparticipação da Câmara é um pedido que se decide e, se aprovado, devolve dinheiro ao clube", () => {
    const repo = fresh("estadio-camara");
    const r = startWorks(repo, P, club, "north", 1000, "2026-08-01", 1);
    if (!r.ok) throw new Error(r.reason);
    const asked = makeStadiumRequest(repo, data, P, club, "2026-08-01", 1, Math.round(r.cost * 0.5));
    if (!asked.ok) throw new Error(asked.reason);
    expect(makeStadiumRequest(repo, data, P, club, "2026-08-02", 1, 1000)).toEqual({ ok: false, reason: "open" });
    const cash = clubBalance(repo, club);
    dailyCouncil(repo, data, P, club, asked.request.due, 1);
    const done = requestsOf(repo).find((x) => x.id === asked.request.id)!;
    expect(done.status).not.toBe("pending");
    expect(clubBalance(repo, club)).toBe(done.status === "approved" ? cash + asked.request.cost : cash);
  }, 60000);
});
