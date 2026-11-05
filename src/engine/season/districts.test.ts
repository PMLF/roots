import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { handle, type Servicos } from "../api/handler";
import { MemoryRepository } from "../persistence/repositoryMemory";
import type { Pyramid } from "./movements";
import { sackByRelegation } from "./coachMarket";
import { seasonData, savePyramid } from "./seasonPyramid";
import { DEFAULT_PARAMETERS, DEFAULT_PARAMETERS as P } from "../config/parameters";
import { adjustDistricts, isInSecondDistrict, secondDistrictLeague } from "./districts";

const ids = (p: string, n: number) => Array.from({ length: n }, (_, i) => `${p}${String(i + 1).padStart(2, "0")}`);
const none = new Set<string>();

describe("distritais de tamanho variável (RZ-113)", () => {
  it("p=r ou p=r=0: nada muda", () => {
    const l = ids("a", 10);
    const r = adjustDistricts({ Braga: l }, { final: { Braga: l }, protected: none, second: {}, season: 1 }, P);
    expect(r.districtLeagues.Braga).toEqual(l);
    expect(r.adjustments).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it("r > p: a liga cresce até DIST_MAX; o excedente, os piores, vai para a SegundaDistrital, e os recém-chegados ficam protegidos", () => {
    const old = ids("a", 10);
    const arrivals = ["c1", "c2", "c3", "c4", "c5", "c6"]; // seis despromovidos do CP: 16 clubes
    const r = adjustDistricts({ Faro: [...old, ...arrivals] }, { final: { Faro: old }, protected: new Set(arrivals), second: {}, season: 3 }, P);
    expect(r.districtLeagues.Faro).toHaveLength(14);
    expect(arrivals.every((c) => r.districtLeagues.Faro!.includes(c))).toBe(true);
    // saem os dois piores da classificação (a09 e a10)
    expect(r.second.Faro!.map((e) => e.club).sort()).toEqual(["a09", "a10"]);
    expect(r.second.Faro!.every((e) => e.since === 3)).toBe(true);
    expect(r.adjustments.filter((a) => a.type === "relegation")).toHaveLength(2);
  });

  it("abaixo de DIST_MIN: completa com a SegundaDistrital, primeiro quem desceu há menos tempo", () => {
    const l = ids("a", 7);
    const second = { Beja: [{ club: "velho", since: 1 }, { club: "recent", since: 5 }, { club: "average", since: 3 }] };
    const r = adjustDistricts({ Beja: l }, { final: { Beja: l }, protected: none, second, season: 6 }, P);
    expect(r.districtLeagues.Beja).toEqual([...l, "recent"]);
    expect(r.second.Beja!.map((e) => e.club).sort()).toEqual(["average", "velho"]);
    expect(r.adjustments).toEqual([{ club: "recent", district: "Beja", type: "ret" }]);
    expect(r.warnings).toEqual([]);
  });

  it("completa até DIST_MIN e não mais, mesmo com a SegundaDistrital cheia", () => {
    const l = ids("a", 6);
    const second = { Beja: ids("b", 5).map((club, i) => ({ club, since: i })) };
    const r = adjustDistricts({ Beja: l }, { final: { Beja: l }, protected: none, second, season: 9 }, P);
    expect(r.districtLeagues.Beja).toHaveLength(P.districtLeagues.min);
    expect(r.second.Beja).toHaveLength(3);
  });

  it("segunda distrital vazia: a liga joga com menos clubes e avisa; abaixo do mínimo duro, avisa também", () => {
    const r = adjustDistricts({ Corvo: ids("a", 7), Evora: ids("e", 5) }, { final: {}, protected: none, second: {}, season: 2 }, P);
    expect(r.districtLeagues.Corvo).toHaveLength(7);
    expect(r.warnings.some((a) => a.startsWith("Corvo") && /segunda distrital está vazia/.test(a))).toBe(true);
    expect(r.warnings.some((a) => a.startsWith("Evora") && /mínimo duro/.test(a))).toBe(true);
  });

  it("quem desce à SegundaDistrital e quem regressa na mesma passagem não se cruza, e o resultado é determinístico", () => {
    const input = { Braga: [...ids("a", 12), "c1", "c2", "c3"], Beja: ids("b", 6) };
    const ctx = { final: { Braga: ids("a", 12) }, protected: new Set(["c1", "c2", "c3"]), second: { Beja: [{ club: "x", since: 1 }, { club: "y", since: 2 }] }, season: 4 };
    const um = adjustDistricts(input, ctx, P);
    expect(adjustDistricts(input, ctx, P)).toEqual(um);
    expect(um.districtLeagues.Braga).toHaveLength(14);
    expect(um.districtLeagues.Beja).toEqual([...ids("b", 6), "y", "x"]);
  });

  it("a liga da SegundaDistrital reconhece-se pelo nome", () => {
    expect(isInSecondDistrict(secondDistrictLeague("Braga"))).toBe(true);
    expect(isInSecondDistrict("Distrital Braga")).toBe(false);
  });
});

describe("clubes na SegundaDistrital nos dados da época", () => {
  it("quem não está na pirâmide fica com a liga «SegundaDistrital …» e não aparece nas competições", async () => {
    const read = (f: string) => readFileSync(`data/${f}.csv`, "utf8");
    const repository = new MemoryRepository();
    const s: Servicos = {
      now: () => new Date(2026, 9, 15),
      openRepository: async () => ({ repository, backend: "memory" as const, sqliteVersion: "test" }),
      loadData: async () => ({ clubs: read("clubs"), cities: read("cities"), localities: read("localities"), rivalries: read("rivalries"), districts: read("districts"), countries: read("countries") }),
    };
    await handle({ id: 1, type: "createWorld", input: { seed: "second" } }, s);
    await handle({ id: 2, type: "timeState", input: null }, s); // grava a pirâmide da época 1
    const pyramid = JSON.parse(repository.meta("pyramid.1") as string) as Pyramid;
    const [district, list] = Object.entries(pyramid.districtLeagues)[0]!;
    const away = list[list.length - 1]!;
    savePyramid(repository, 1, { ...pyramid, districtLeagues: { ...pyramid.districtLeagues, [district]: list.slice(0, -1) } });
    const profile = await handle({ id: 3, type: "clubProfile", input: { id: away } }, s);
    expect(profile?.league).toBe(secondDistrictLeague(district));
    const comp = await handle({ id: 4, type: "competitions", input: null }, s);
    expect(comp.some((c) => isInSecondDistrict(c.league))).toBe(false);
    expect(comp.filter((c) => c.tier === "district").every((c) => c.clubs >= 2)).toBe(true);

    // o clube do gamer cai para lá: é despedido, deixa de ser jogável e nenhuma oferta o inclui
    await expect(handle({ id: 5, type: "chooseClub", input: { id: away } }, s)).rejects.toThrow(/segunda distrital/);
    const other = (await handle({ id: 6, type: "clubs", input: null }, s)).find((c) => c.id !== away && !isInSecondDistrict(c.league))!;
    await handle({ id: 7, type: "chooseClub", input: { id: other.id } }, s);
    savePyramid(repository, 1, { ...pyramid, districtLeagues: Object.fromEntries(Object.entries(pyramid.districtLeagues).map(([d, l]) => [d, l.filter((c) => c !== other.id)])), first: pyramid.first.filter((c) => c !== other.id), second: pyramid.second.filter((c) => c !== other.id), third: pyramid.third.filter((c) => c !== other.id), cp: Object.fromEntries(Object.entries(pyramid.cp).map(([k, l]) => [k, l.filter((c) => c !== other.id)])) as Pyramid["cp"] });
    const { importData } = await import("../data/importData");
    const data = seasonData(repository, (importData(await s.loadData()) as unknown as { data: never }).data);
    sackByRelegation(repository, data, DEFAULT_PARAMETERS, other.id, "2027-06-01", 1);
    expect(repository.meta("gamer.club")).toBe("");
    expect(repository.meta("gamer.previous")).toBe(other.id);
    const offers = JSON.parse(repository.meta("gamer.offers") as string) as { club: string }[];
    expect(offers.length).toBeGreaterThan(0);
    expect(offers.some((o) => o.club === other.id || data.clubs.find((c) => c.id === o.club)!.league.startsWith("Segunda Distrital"))).toBe(false);
  }, 60000);
});
