import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { handle, type Servicos } from "./handler";
import { MemoryRepository } from "../persistence/repositoryMemory";

describe("tabela do plantel", { timeout: 120000 }, () => {
  const repository = new MemoryRepository();
  const read = (f: string) => readFileSync(`data/${f}.csv`, "utf8");
  const s: Servicos = {
    now: () => new Date(2026, 9, 15),
    openRepository: async () => ({ repository, backend: "memory", sqliteVersion: "test" }),
    loadData: async () => ({ clubs: read("clubs"), cities: read("cities"), localities: read("localities"), rivalries: read("rivalries"), districts: read("districts"), countries: read("countries") }),
  };

  it("mostra o salário só no teu clube e marca os lesionados", async () => {
    await handle({ id: 1, type: "createWorld", input: { seed: "squad-table" } }, s);
    const clubs = await handle({ id: 2, type: "clubs", input: null }, s);
    repository.setMeta("gamer.club", clubs[0]!.id);
    repository.setMeta("date.today", "2026-10-15");
    const own = (await handle({ id: 3, type: "clubProfile", input: { id: clubs[0]!.id } }, s))!;
    const other = (await handle({ id: 4, type: "clubProfile", input: { id: clubs[1]!.id } }, s))!;
    expect(Object.values(own.extraSquad).every((x) => typeof x.wage === "number")).toBe(true);
    expect(Object.values(other.extraSquad).some((x) => x.wage !== undefined)).toBe(false);
    const hurt = own.squad[0]!.id;
    repository.appendEvent({ type: "INJURY", date: "2026-10-01", season: 1, entities: [{ k: "club", id: own.id }, { k: "person", id: hurt, roleKind: "injured" }], data: { until: "2026-11-01" }, visibility: "public" } as never);
    const again = (await handle({ id: 5, type: "clubProfile", input: { id: own.id } }, s))!;
    expect(again.extraSquad[hurt]?.injured).toBe(true);
    expect(Object.values(again.extraSquad).filter((x) => x.injured)).toHaveLength(1);
  });

  it("a ficha mostra o agente a todos e as cláusulas só no teu clube", async () => {
    const clubs = await handle({ id: 10, type: "clubs", input: null }, s);
    repository.setMeta("gamer.club", clubs[0]!.id);
    const mine = repository.clubPlayers(clubs[0]!.id)[0]!.person;
    const theirs = repository.clubPlayers(clubs[1]!.id)[0]!.person;
    for (const p of [mine, theirs]) repository.saveContract({ ...repository.contract(p)!, clauses: { release: 1234567 } });
    const own = (await handle({ id: 11, type: "personProfile", input: { id: mine } }, s))!;
    const other = (await handle({ id: 12, type: "personProfile", input: { id: theirs } }, s))!;
    expect(own.clauses).toMatchObject({ release: 1234567 });
    expect(other.clauses).toBeUndefined();
    const withAgent = repository.clubPlayers(clubs[1]!.id).find((j) => j.agent);
    if (withAgent) expect((await handle({ id: 13, type: "personProfile", input: { id: withAgent.person } }, s))!.agent?.id).toBe(withAgent.agent);
  });

  it("a tabela História traz uma linha por profissão com os dados de cada uma", async () => {
    const clubIds = (await handle({ id: 89, type: "clubs", input: null }, s)).map((c) => c.id);
    const cityIds = [...new Set(repository.companies().map((c) => c.city))];
    const roles = [...clubIds.flatMap((c) => repository.publicRoles({ club: c })), ...cityIds.flatMap((c) => repository.publicRoles({ city: c }))];
    const profile = async (id: string) => (await handle({ id: 90, type: "personProfile", input: { id } }, s))!;
    const mayor = roles.find((r) => r.fn === "mayor")!;
    const mayorRows = (await profile(mayor.id)).history!;
    expect(mayorRows.every((r) => r.profession === "mayor")).toBe(true);
    expect(mayorRows[0]).toMatchObject({ profession: "mayor", season: 1 });
    const boss = roles.find((r) => r.fn === "businessperson" && repository.companies().some((c) => c.owner === r.id))!;
    const bossRows = (await profile(boss.id)).history!;
    expect(bossRows.length).toBeGreaterThan(0);
    expect(bossRows[0]).toMatchObject({ profession: "businessperson" });
    expect((bossRows[0] as { employees: number }).employees).toBeGreaterThan(0);
    const coach = roles.find((r) => r.fn === "coach" && r.club)!;
    expect((await profile(coach.id)).history![0]).toMatchObject({ profession: "staff", fn: "coach", wins: 0, draws: 0, losses: 0 });
    const clubs = await handle({ id: 91, type: "clubs", input: null }, s);
    const keeper = repository.clubPlayers(clubs[2]!.id).find((j) => j.positions[0]?.pos === "GK")!;
    expect((await profile(keeper.person)).history![0]).toMatchObject({ profession: "goalkeeper", cleanSheets: 0 });
  });

  it("a ficha traz o percurso a partir dos eventos de contratos e transferências", async () => {
    const clubs = await handle({ id: 30, type: "clubs", input: null }, s);
    const who = repository.clubPlayers(clubs[3]!.id)[0]!.person;
    const add = (type: string, date: string, entities: object[], data: object) => repository.appendEvent({ type, date, season: 1, visibility: "exposed", origin: "generated", entities, data } as never);
    add("CONTRACT_RENEWED", "2026-06-30", [{ k: "person", id: who, roleKind: "player" }, { k: "club", id: clubs[3]!.id }], { wage: 1000, years: 2 });
    add("TRANSFER", "2026-08-01", [{ k: "person", id: who, roleKind: "player" }, { k: "club", id: clubs[3]!.id, roleKind: "seller" }, { k: "club", id: clubs[4]!.id, roleKind: "buyer" }], { fee: 250000 });
    const profile = (await handle({ id: 31, type: "personProfile", input: { id: who } }, s))!;
    expect(profile.career?.map((c) => c.kind)).toEqual(["renewed", "transfer"]);
    expect(profile.career?.[1]).toMatchObject({ fee: 250000, club: { id: clubs[4]!.id }, from: { id: clubs[3]!.id } });
  });

  it("os jogadores do teu clube conhecem-se por inteiro e o contrato a expirar pode renovar-se", async () => {
    const clubs = await handle({ id: 40, type: "clubs", input: null }, s);
    repository.setMeta("gamer.club", clubs[0]!.id);
    const mine = repository.clubPlayers(clubs[0]!.id)[0]!.person;
    repository.saveContract({ ...repository.contract(mine)!, end: "2027-06-30" });
    const own = (await handle({ id: 41, type: "personProfile", input: { id: mine } }, s))!;
    expect(own.profile.attributes && Object.values(own.profile.attributes.fields).every((f) => f.margin === 0)).toBe(true);
    expect(own.rating?.potential).toBeDefined();
    expect(own.wage).toBe(repository.contract(mine)!.monthlyWage);
    expect(own.renewable).toBe(true);
    const theirs = repository.clubPlayers(clubs[1]!.id)[0]!.person;
    const other = (await handle({ id: 42, type: "personProfile", input: { id: theirs } }, s))!;
    expect(other.wage).toBeUndefined();
    expect(other.renewable).toBeUndefined();
    const squad = (await handle({ id: 43, type: "clubProfile", input: { id: clubs[0]!.id } }, s))!;
    expect(squad.extraSquad[mine]?.renewable).toBe(true);
    expect(squad.extraSquad[mine]?.rating).toBeDefined();
  });

  it("uma pessoa sem movimentos fica com uma linha de percurso (a época atual)", async () => {
    const clubs = await handle({ id: 50, type: "clubs", input: null }, s);
    const coach = (await handle({ id: 51, type: "clubProfile", input: { id: clubs[7]!.id } }, s))!.roles.find((r) => r.fn === "coach")!;
    const p = (await handle({ id: 52, type: "personProfile", input: { id: coach.id } }, s))!;
    expect(p.career?.length).toBeGreaterThan(0);
  });
});
