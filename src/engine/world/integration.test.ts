import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { openSqliteBetter } from "../../node/driverBetterSqlite";
import { Rng } from "../random/rng";
import { observeOwnSquad } from "../knowledge/observe";
import { DEFAULT_PARAMETERS as P } from "../config/parameters";
import { importData } from "../data/importData";
import { MemoryRepository } from "../persistence/repositoryMemory";
import { SqliteRepository } from "../persistence/repositorySqlite";
import { View } from "../view/view";
import { generateWorld } from "./generateWorld";
import { importCountries } from "./countries";

const read = (f: string) => readFileSync(`data/${f}`, "utf8");
const d = importData({ clubs: read("clubs.csv"), cities: read("cities.csv"), localities: read("localities.csv"), rivalries: read("rivalries.csv"), districts: read("districts.csv") });
const pr = importCountries(read("countries.csv"));
if (!d.ok || !pr.ok) throw new Error("dados inválidos");
const data = d.data;
const batch = generateWorld({ seed: "integracao", data, countries: pr.countries, params: P });
const mine = data.clubs.find((c) => c.tier === "thirdLeague")!.id;
const other = data.clubs.find((c) => c.tier === "secondLeague")!.id;

describe.each([
  ["memória", () => new MemoryRepository()],
  ["SQLite", () => new SqliteRepository(openSqliteBetter())],
])("mundo guardado e visto (%s)", (_n, create) => {
  const repo = create();
  const progress: number[] = [];
  repo.saveWorld(batch, (f, t) => progress.push(f / t));
  const date = "2026-07-01";
  const n = observeOwnSquad(repo, mine, { date, season: 1 }, new Rng("obs"), P.knowledge);
  const view = new View(repo, { observer: mine, participants: new Set([`clube:${mine}`]), date, season: 1 }, P.knowledge);

  it("guarda tudo e reporta progresso até 100 %", () => {
    expect(repo.peopleTotal()).toBe(batch.people.length);
    expect(progress.at(-1)).toBe(1);
    expect(n).toBe(P.world.squad.thirdLeague);
  });
  it("o plantel próprio mostra estimativas com margem; o de outro clube só factos públicos", () => {
    const ownSquad = view.squad(mine);
    expect(ownSquad).toHaveLength(n);
    const f = view.profile(ownSquad[0]!.id)!;
    expect(f.exposed.age).toBeGreaterThanOrEqual(16);
    expect(Object.keys(f.attributes!.fields).length).toBe(45);
    expect(f.potential!.fields.potential!.margin).toBeGreaterThan(0);
    expect(f.personality!.labels.length).toBeLessThanOrEqual(3);

    const foreignClub = view.squad(other)[0]!;
    const fa = view.profile(foreignClub.id)!;
    expect(fa.exposed.club).toBe(other);
    expect(fa.attributes).toBeUndefined();
    expect(fa.potential).toBeUndefined();
    expect(fa.personality).toBeUndefined();
  });
  it("a Vista não devolve nada da verdade nem por acidente", () => {
    const txt = JSON.stringify(view.profile(view.squad(other)[0]!.id));
    for (const banned of ["potential", "attributes", "loyalty", "archetype", "wage"]) expect(txt).not.toContain(`"${banned}"`);
  });
  it("presidente e autarca são públicos pela Vista", () => {
    expect(view.roles({ club: mine }).map((c) => c.fn)).toContain("president");
    const city = data.clubs.find((c) => c.id === mine)!.city;
    expect(view.roles({ city }).map((c) => c.fn)).toContain("mayor");
  });
});

describe("os dois repositórios guardam o mesmo mundo", () => {
  it("ficha pública igual em memória e em SQLite", () => {
    const a = new MemoryRepository();
    const b = new SqliteRepository(openSqliteBetter());
    a.saveWorld(batch);
    b.saveWorld(batch);
    for (const p of batch.people.filter((_, i) => i % 997 === 0)) {
      expect(b.publicPerson(p.id)).toEqual(a.publicPerson(p.id));
      expect(b.person(p.id)).toEqual(a.person(p.id));
    }
    expect(b.publicSquad(mine)).toEqual(a.publicSquad(mine));
  });
});
