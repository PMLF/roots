import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS as P } from "../config/parameters";
import { importData } from "../data/importData";
import { MemoryRepository } from "../persistence/repositoryMemory";
import { generateWorld } from "../world/generateWorld";
import { importCountries } from "../world/countries";
import { annualFixedRevenues, clubBalance, monthlyBroadcast } from "../club/finances";
import { startCompanies, rolloverCompanies } from "../company/cycle";
import { isBroadcaster } from "../company/sectors";
import { broadcastFee, matchInterest, postBroadcast } from "./featured";
import { readRights } from "./rights";

const read = (f: string) => readFileSync(`data/${f}`, "utf8");
const d = importData({ clubs: read("clubs.csv"), cities: read("cities.csv"), localities: read("localities.csv"), rivalries: read("rivalries.csv"), districts: read("districts.csv") });
const pr = importCountries(read("countries.csv"));
if (!d.ok || !pr.ok) throw new Error("invalid data");
const data = d.data;
const tiers = new Map(data.clubs.map((c) => [c.id, c.tier] as const));

const fresh = (seed: string) => {
  const repo = new MemoryRepository();
  repo.setMeta("seed", seed);
  repo.saveWorld(generateWorld({ seed, data, countries: pr.countries, params: P }));
  startCompanies(repo, data, P, { seasonStart: "2026-07-01", year: 2026, tiers });
  return repo;
};

describe("direitos de transmissão", () => {
  const repo = fresh("direitos");
  it("há emissoras nacionais e locais, que também podem patrocinar", () => {
    const b = repo.companies().filter((c) => isBroadcaster(c.sector));
    expect(b.filter((c) => c.scale === "national" || c.scale === "international").length).toBe(P.broadcast.national.length);
    expect(b.filter((c) => c.scale === "local").length).toBeGreaterThan(20);
    expect(new Set(b.map((c) => c.sector))).toEqual(new Set(["television", "radio", "streaming"]));
  });
  it("cada escalão tem um pacote vendido a uma emissora adequada, repartido por todos os clubes", () => {
    for (const tier of ["firstLeague", "secondLeague", "thirdLeague"] as const) {
      const deal = readRights(repo, 1, tier);
      expect(deal, tier).toBeDefined();
      const company = repo.company(deal!.company)!;
      expect(isBroadcaster(company.sector)).toBe(true);
      const rows = repo.activeSponsorships("2026-08-01").filter((s) => s.kind === "broadcast" && s.company === company.id);
      const clubs = data.clubs.filter((c) => c.tier === tier);
      expect(rows.length).toBeGreaterThanOrEqual(clubs.length);
      expect(Math.abs(rows.filter((r) => clubs.some((c) => c.id === r.club)).reduce((t, r) => t + r.annualValue, 0) - deal!.total)).toBeLessThan(deal!.total * 0.02);
    }
    expect(["national", "international"]).toContain(repo.company(readRights(repo, 1, "firstLeague")!.company)!.scale);
    expect(repo.count("RIGHTS_SIGNED")).toBeGreaterThanOrEqual(5 + 2);
  });
  it("as distritais vendem-se a rádios e plataformas locais (algumas ficam por vender)", () => {
    const sold = data.districts.map((x) => readRights(repo, 1, `district:${x.name}`)).filter(Boolean);
    expect(sold.length).toBeGreaterThan(3);
    expect(sold.length).toBeLessThanOrEqual(data.districts.length);
    for (const s of sold) expect(["local", "regional", "national"]).toContain(repo.company(s!.company)!.scale);
  });
  it("os clubes recebem dos direitos e do comercial perto do que o comercial valia", () => {
    const out: Record<string, { got: number; before: number }> = {};
    for (const c of data.clubs) {
      const o = (out[c.tier] ??= { got: 0, before: 0 });
      const f = annualFixedRevenues(c, P).commercial;
      o.before += f;
      o.got += f * (1 - P.broadcast.packageShareOfCommercial[c.tier]) + monthlyBroadcast(repo, c, "2026-08-01") * 12;
    }
    for (const [tier, v] of Object.entries(out)) {
      expect(v.got / v.before, tier).toBeGreaterThan(0.85);
      expect(v.got / v.before, tier).toBeLessThan(1.1);
    }
  });
  it("determinismo", () => {
    const other = fresh("direitos");
    expect(readRights(other, 1, "firstLeague")).toEqual(readRights(repo, 1, "firstLeague"));
  });
});

describe("jogos de interesse", () => {
  const repo = fresh("jogos");
  const first = data.clubs.filter((c) => c.tier === "firstLeague").sort((a, b) => b.reputation - a.reputation);
  const matches = Array.from({ length: 10 }, (_, i) => ({ id: `t-${i}`, competition: "Liga Teste", season: 1, round: 1, date: "2026-08-15", home: first[i]!.id, away: first[19 - i]!.id }));
  repo.saveCalendar(matches, []);
  const fees = matches.map((m) => broadcastFee(repo, data, P, 1, m));
  it("só os jogos de maior interesse são transmitidos e pagam mais", () => {
    const aired = fees.filter(Boolean);
    expect(aired.length).toBe(P.broadcast.featuredPerRound.firstLeague);
    const ids = fees.map((f, i) => (f ? i : -1)).filter((i) => i >= 0);
    const interest = matches.map((m) => matchInterest(first.find((c) => c.id === m.home)!, first.find((c) => c.id === m.away)!, "firstLeague", P));
    const top = [...interest.keys()].sort((a, b) => interest[b]! - interest[a]!).slice(0, aired.length);
    expect(new Set(ids)).toEqual(new Set(top));
    for (const f of aired) expect(f!.company).toBe(readRights(repo, 1, "firstLeague")!.company);
  });
  it("um dérbi vale mais do que o mesmo jogo sem dérbi", () => {
    const a = first[0]!;
    const b = first[1]!;
    const plain = matchInterest({ ...a, rival: "x", city: "c1" }, { ...b, rival: "y", city: "c2" }, "firstLeague", P);
    const derby = matchInterest({ ...a, rival: b.id, city: "c1" }, { ...b, rival: "y", city: "c2" }, "firstLeague", P);
    expect(derby - plain).toBeCloseTo(P.broadcast.derbyBonus);
  });
  it("o pagamento chega aos dois clubes, em partes iguais", () => {
    const i = fees.findIndex(Boolean);
    const m = matches[i]!;
    const h = data.clubs.find((c) => c.id === m.home)!;
    const a = data.clubs.find((c) => c.id === m.away)!;
    const hb = clubBalance(repo, h);
    const ab = clubBalance(repo, a);
    postBroadcast(repo, data, P, 1, m);
    const fee = fees[i]!.fee;
    expect(clubBalance(repo, h) - hb + (clubBalance(repo, a) - ab)).toBe(fee);
    expect(Math.abs(clubBalance(repo, h) - hb - (clubBalance(repo, a) - ab))).toBeLessThanOrEqual(1);
    const not = matches.findIndex((_, k) => !fees[k]);
    const before = clubBalance(repo, data.clubs.find((c) => c.id === matches[not]!.home)!);
    postBroadcast(repo, data, P, 1, matches[not]!);
    expect(clubBalance(repo, data.clubs.find((c) => c.id === matches[not]!.home)!)).toBe(before);
  });
  it("sem empresas no mundo ninguém paga", () => {
    expect(broadcastFee(new MemoryRepository(), data, P, 1, matches[0]!)).toBeUndefined();
  });
});

describe("leilões em várias épocas", { timeout: 120000 }, () => {
  const repo = fresh("leiloes");
  const winners = [readRights(repo, 1, "firstLeague")!.company];
  for (let s = 1; s <= 5; s++) {
    rolloverCompanies(repo, data, P, { season: s, seasonStart: `${2026 + s}-07-01`, year: 2026 + s, tiers, previousTiers: tiers });
    winners.push(readRights(repo, s + 1, "firstLeague")!.company);
  }
  it("cada época tem novo leilão; as emissoras podem repetir ou ser trocadas", () => {
    expect(winners).toHaveLength(6);
    const repeats = winners.filter((w, i) => i > 0 && w === winners[i - 1]).length;
    expect(repeats).toBeLessThan(5);
    expect(repo.count("RIGHTS_SIGNED")).toBeGreaterThanOrEqual(6 * 7);
  });
  it("os contratos de patrocínio normais não se misturam com os de transmissão", () => {
    for (const c of data.clubs) {
      const rows = repo.clubSponsorships(c.id, "2031-08-01");
      expect(rows.filter((r) => r.kind === "broadcast").length).toBeLessThanOrEqual(1);
      expect(rows.filter((r) => r.kind !== "broadcast").map((r) => r.kind).sort()).toEqual([...P.companies.sponsorship.slots[c.tier]].sort());
    }
  });
});
