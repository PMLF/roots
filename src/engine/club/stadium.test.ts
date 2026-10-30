import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS as P } from "../config/parameters";
import type { Tier } from "../config/parameters";
import { data, fresh } from "../squad/testWorld.testlib";
import { clubBalance } from "./finances";
import { dailyCouncil, makeStadiumRequest, requestsOf } from "../council/requests";
import { matchAttendance } from "./attendance";
import { aiStadiums, dailyStadium, defaultSectors, quoteWorks, sellingSectors, setSectorPrice, ringSeats, ringsOf, sectorMax, stadiumCapacity, stadiumState, startWorks, summerTurf, treatTurf, turfOf, wearTurf } from "./stadium";

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
  it("por setor, a preço normal e sem coberturas, vende-se o mesmo que no modelo simples", () => {
    const repo = fresh("estadio-setores");
    const away = data.clubs.find((c) => c.id !== club.id && c.tier === club.tier)!;
    const simple = matchAttendance({ home: club, away, footballCulture: 50 }, P);
    const sectors = matchAttendance({ home: club, away, footballCulture: 50, sectors: sellingSectors(repo, club, P), month: 4 }, P);
    expect(Math.abs(sectors.attendance - simple.attendance) / simple.attendance).toBeLessThan(0.03);
    expect(Math.abs(sectors.revenue - simple.revenue) / simple.revenue).toBeLessThan(0.03);
  }, 60000);
  it("preço mais alto afasta gente; o coberto aguenta mais e enche mais no inverno", () => {
    const repo = fresh("estadio-precos");
    const away = data.clubs.find((c) => c.id !== club.id && c.tier === club.tier)!;
    const base = sellingSectors(repo, club, P);
    const at = (sectors: typeof base, month = 4) => matchAttendance({ home: club, away, footballCulture: 50, sectors, month }, P);
    const dear = base.map((x) => ({ ...x, price: 1.8 }));
    expect(at(dear).attendance).toBeLessThan(at(base).attendance);
    const roofed = base.map((x) => ({ ...x, covered: true }));
    expect(at(roofed, 12).attendance).toBeGreaterThan(at(base, 12).attendance);
    expect(at(roofed.map((x) => ({ ...x, price: 1.2 }))).attendance).toBeGreaterThanOrEqual(at(base.map((x) => ({ ...x, price: 1.2 }))).attendance);
    expect(setSectorPrice(repo, P, club, "north", 9)).toBe(P.stadium.pricing.max);
    expect(sellingSectors(repo, club, P).find((x) => x.id === "north")!.price).toBe(P.stadium.pricing.max);
  }, 60000);
  it("a cobertura é uma obra que não fecha lugares e no fim cobre o setor", () => {
    const repo = fresh("estadio-cobertura");
    const r = startWorks(repo, P, club, "central", 0, "2026-08-01", 1, { kind: "cover" });
    if (!r.ok) throw new Error(r.reason);
    expect(stadiumCapacity(repo, club, P)).toBe(club.stadium.capacity);
    expect(startWorks(repo, P, club, "side", 0, "2026-08-02", 1, { kind: "cover" })).toEqual({ ok: false, reason: "ongoing" });
    dailyStadium(repo, data, P, r.end, 1);
    expect(stadiumState(repo, club, P).covered?.central).toBe(true);
    expect(startWorks(repo, P, club, "central", 0, "2027-01-01", 1, { kind: "cover" })).toEqual({ ok: false, reason: "covered" });
  }, 60000);
  it("o relvado do gamer desgasta em casa (mais no inverno), trata-se com dinheiro e recupera no verão", () => {
    const repo = fresh("estadio-relvado");
    repo.setMeta("gamer.club", club.id);
    expect(turfOf(stadiumState(repo, club, P), P)).toBe(P.stadium.turf.start);
    wearTurf(repo, club, P, 4);
    const spring = turfOf(stadiumState(repo, club, P), P);
    wearTurf(repo, club, P, 12);
    const winter = turfOf(stadiumState(repo, club, P), P);
    expect(spring).toBeLessThan(P.stadium.turf.start);
    expect(spring - winter).toBeGreaterThan(P.stadium.turf.wearPerMatch);
    const cash = clubBalance(repo, club);
    const t = treatTurf(repo, P, club, "treat");
    if (!t.ok) throw new Error(t.reason);
    expect(turfOf(stadiumState(repo, club, P), P)).toBeGreaterThan(winter);
    expect(clubBalance(repo, club)).toBe(cash - t.cost);
    const r = treatTurf(repo, P, club, "replace");
    if (!r.ok) throw new Error(r.reason);
    expect(turfOf(stadiumState(repo, club, P), P)).toBe(P.stadium.turf.replaceTo);
    expect(treatTurf(repo, P, club, "replace")).toEqual({ ok: false, reason: "perfect" });
    repo.setMeta(`stadium.${club.id}`, JSON.stringify({ ...stadiumState(repo, club, P), turf: 0.1 }));
    summerTurf(repo, data, P, club.id);
    expect(turfOf(stadiumState(repo, club, P), P)).toBe(P.stadium.turf.start);
    // outros clubes não gastam o relvado
    const other = data.clubs.find((c) => c.id !== club.id)!;
    wearTurf(repo, other, P, 12);
    expect(turfOf(stadiumState(repo, other, P), P)).toBe(P.stadium.turf.start);
  }, 60000);
  it("os anéis e o máximo de cada bancada limitam as obras", () => {
    const repo = fresh("estadio-aneis");
    const s = stadiumState(repo, club, P);
    expect(ringsOf(P, club, "central", 1)).toBe(1);
    expect(ringsOf(P, club, "central", ringSeats(P, club, "central") + 1)).toBe(2);
    const max = sectorMax(P, club, "north", s.sectors.north);
    expect(max).toBeGreaterThanOrEqual(s.sectors.north);
    const room = max - s.sectors.north;
    if (room >= P.stadium.works.minSeats) expect(startWorks(repo, P, club, "north", room + 1000, "2026-08-01", 1)).toEqual({ ok: false, reason: "tooBig" });
    const tight = { ...club, stadium: { ...club.stadium, location: { ...club.stadium.location, expansionTerrain: 0 } } };
    const roomy = { ...club, stadium: { ...club.stadium, location: { ...club.stadium.location, expansionTerrain: 100 } } };
    expect(sectorMax(P, tight, "side", 0)).toBeLessThan(sectorMax(P, roomy, "side", 0));
  }, 60000);
  it("o relvado sintético não desgasta nem se trata, e volta-se ao natural a pagar", () => {
    const repo = fresh("estadio-sintetico");
    repo.setMeta("gamer.club", club.id);
    const r = treatTurf(repo, P, club, "synthetic");
    if (!r.ok) throw new Error(r.reason);
    expect(turfOf(stadiumState(repo, club, P), P)).toBe(P.stadium.turf.syntheticValue);
    wearTurf(repo, club, P, 12);
    expect(turfOf(stadiumState(repo, club, P), P)).toBe(P.stadium.turf.syntheticValue);
    expect(treatTurf(repo, P, club, "treat")).toEqual({ ok: false, reason: "synthetic" });
    expect(treatTurf(repo, P, club, "synthetic")).toEqual({ ok: false, reason: "synthetic" });
    const back = treatTurf(repo, P, club, "replace");
    if (!back.ok) throw new Error(back.reason);
    expect(stadiumState(repo, club, P).turfType).toBe("natural");
  }, 60000);
});
