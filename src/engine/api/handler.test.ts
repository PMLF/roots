import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION, ENGINE_VERSION, handle, type Servicos } from "./handler";
import { DEFAULT_PARAMETERS } from "../config/parameters";
import { MemoryRepository } from "../persistence/repositoryMemory";

function testServicos(): Servicos {
  const repository = new MemoryRepository();
  const read = (f: string) => readFileSync(`data/${f}.csv`, "utf8");
  return {
    now: () => new Date(2026, 9, 15),
    openRepository: async () => ({ repository, backend: "memory", sqliteVersion: "test" }),
    loadData: async () => ({ clubs: read("clubs"), cities: read("cities"), localities: read("localities"), rivalries: read("rivalries"), districts: read("districts"), countries: read("countries") }),
  };
}

describe("handler do motor", () => {
  const s = testServicos();
  it("responde ao ping com o mesmo eco", async () => {
    const r = await handle({ id: 1, type: "ping", input: { echo: "olá" } }, s);
    expect(r.echo).toBe("olá");
    expect(r.clockMs).toBeGreaterThan(0);
  });
  it("devolve versão e parâmetros", async () => {
    expect(await handle({ id: 2, type: "version", input: null }, s)).toEqual({ engine: ENGINE_VERSION, schema: SCHEMA_VERSION });
    expect(await handle({ id: 3, type: "parameters", input: null }, s)).toEqual(DEFAULT_PARAMETERS);
  });
  it("autodiagnóstico da base de dados: cada abertura acrescenta um evento", async () => {
    const a = await handle({ id: 4, type: "db", input: null }, s);
    const b = await handle({ id: 5, type: "db", input: null }, s);
    expect(a).toMatchObject({ backend: "memory", persistent: false, schema: SCHEMA_VERSION, openings: 1, events: 1 });
    expect(b).toMatchObject({ openings: 2, events: 2 });
  });

  it("cria o mundo com progresso, depois reabre sem gerar outra vez, e o plantel vem pela Vista", async () => {
    const s2 = testServicos();
    expect(await handle({ id: 5, type: "worldState", input: null }, s2)).toBeNull(); // ver o estado não gera nada
    const phases = new Set<string>();
    const r = await handle({ id: 6, type: "createWorld", input: { seed: "abc" } }, s2, (p) => phases.add(p.phase));
    expect(r).toMatchObject({ seed: "abc", clubs: 300, alreadyExisted: false });
    expect(r.people).toBeGreaterThan(12000);
    expect([...phases]).toEqual(expect.arrayContaining(["clubs", "free", "validate", "save"]));
    expect(await handle({ id: 10, type: "worldState", input: null }, s2)).toMatchObject({ seed: "abc", alreadyExisted: true, people: r.people });
    const other = await handle({ id: 7, type: "createWorld", input: { seed: "other" } }, s2);
    expect(other).toMatchObject({ seed: "abc", alreadyExisted: true, people: r.people, players: r.players });
    const clubs = await handle({ id: 8, type: "clubs", input: null }, s2);
    const squad = await handle({ id: 9, type: "squad", input: { club: clubs[0]!.id } }, s2);
    expect(squad.length).toBeGreaterThanOrEqual(20);
    expect(JSON.stringify(squad)).not.toMatch(/potencial|atributos|personalidade/);
  });

  it("pesquisa e fichas: clubes e cidades antes de haver mundo; pessoas depois", async () => {
    const s3 = testServicos();
    const before = await handle({ id: 11, type: "find", input: { q: "almada" } }, s3);
    expect(before.map((r) => r.k)).toEqual(expect.arrayContaining(["club", "city"]));
    expect(before.every((r) => r.k !== "person")).toBe(true);
    await handle({ id: 12, type: "createWorld", input: { seed: "pesq" } }, s3);
    const clubs = await handle({ id: 13, type: "clubs", input: null }, s3);
    const fc = (await handle({ id: 14, type: "clubProfile", input: { id: clubs[0]!.id } }, s3))!;
    expect(fc.squad.length).toBeGreaterThanOrEqual(20);
    expect(fc.roles.map((c) => c.fn)).toContain("president");
    expect(fc.city.k).toBe("city");
    expect(fc.sponsors.length).toBeGreaterThanOrEqual(1);
    expect(fc.sponsors.every((x) => x.name.length > 0 && x.annualValue === undefined)).toBe(true); // o valor só é visto no clube do gamer
    expect(fc.season?.season).toBeGreaterThan(0);
    const player = fc.squad[0]!;
    const found = await handle({ id: 15, type: "find", input: { q: player.sportingName } }, s3);
    expect(found.some((r) => r.k === "person" && r.id === player.id)).toBe(true);
    const fp = (await handle({ id: 16, type: "personProfile", input: { id: player.id } }, s3))!;
    expect(fp.club?.id).toBe(clubs[0]!.id);
    expect(fp.profile.attributes).toBeUndefined(); // ninguém o observou
    expect(JSON.stringify(fp)).not.toMatch(/"potencial"|"personalidade"/);
    expect(await handle({ id: 17, type: "personProfile", input: { id: "nao-existe" } }, s3)).toBeNull();
    expect(await handle({ id: 18, type: "clubProfile", input: { id: "nao-existe" } }, s3)).toBeNull();
  });

  it("localidades: o Matelense é de Matela (aldeia de Vimioso), com ficha e pesquisa próprias", async () => {
    const sl = testServicos();
    const club = (await handle({ id: 20, type: "clubProfile", input: { id: "cd-matelense" } }, sl))!;
    expect(club.locality).toMatchObject({ k: "locality", id: "matela@vimioso", name: "Matela", status: "village" });
    expect(club.city.name).toBe("Vimioso");
    const f = (await handle({ id: 21, type: "localityProfile", input: { id: "matela@vimioso" } }, sl))!;
    expect(f).toMatchObject({ name: "Matela", status: "village", population: 150, host: false, district: "Bragança", history: [] });
    expect(f.clubs.map((c) => c.name)).toEqual(["CD Matelense"]);
    const moita = (await handle({ id: 22, type: "localityProfile", input: { id: "moita-dos-ferreiros@lourinha" } }, sl))!;
    expect(moita).toMatchObject({ status: "village", city: { name: "Lourinhã" } });
    expect(await handle({ id: 23, type: "localityProfile", input: { id: "nada" } }, sl)).toBeNull();
    const r = await handle({ id: 24, type: "find", input: { q: "matela" } }, sl);
    expect(r.find((x) => x.k === "locality")).toMatchObject({ id: "matela@vimioso", title: "Matela" });
  });

  it("depois do mundo, o estatuto vem do save e as mudanças aparecem na história da localidade", async () => {
    const sl = testServicos();
    await handle({ id: 30, type: "createWorld", input: { seed: "locality" } }, sl);
    const { repository } = await sl.openRepository();
    expect(repository.localities().length).toBe(298);
    repository.updateLocality("matela@vimioso", { population: 1700, status: "town", date: "2031-06-30", season: 5 });
    const f = (await handle({ id: 31, type: "localityProfile", input: { id: "matela@vimioso" } }, sl))!;
    expect(f).toMatchObject({ status: "town", population: 1700, since: "2031-06-30", history: [{ from: "village", to: "town", population: 1700 }] });
    const c = (await handle({ id: 32, type: "clubProfile", input: { id: "cd-matelense" } }, sl))!;
    expect(c.locality.status).toBe("town");
  });

  it("reiniciarMundo apaga o save e gera outro mundo, com seed nova e pesquisa atualizada", async () => {
    const sl = testServicos();
    const a = await handle({ id: 40, type: "createWorld", input: { seed: "first" } }, sl);
    const before = await handle({ id: 41, type: "find", input: { q: "silva", limit: 50 } }, sl);
    const b = await handle({ id: 42, type: "restartWorld", input: { seed: "second" } }, sl);
    expect(b).toMatchObject({ seed: "second", alreadyExisted: false });
    expect(await handle({ id: 43, type: "worldState", input: null }, sl)).toMatchObject({ seed: "second", alreadyExisted: true });
    const after = await handle({ id: 44, type: "find", input: { q: "silva", limit: 50 } }, sl);
    // mesmos clubes e mesma quantidade de pessoas, mas pessoas diferentes: o índice não ficou preso ao mundo antigo
    expect(Math.abs(b.people - a.people)).toBeLessThan(a.people * 0.01); // os donos de empresas novos variam com a seed
    expect(after.filter((x) => x.k === "person").map((x) => x.id)).not.toEqual(before.filter((x) => x.k === "person").map((x) => x.id));
    const { repository } = await sl.openRepository();
    expect(repository.localities().length).toBe(298);
    expect(repository.meta("seed")).toBe("second");
  });

  it("um save de antes das localidades (migração 4) recebe-as ao ser aberto", async () => {
    const sl = testServicos();
    const { repository } = await sl.openRepository();
    // simula um save antigo: tem pessoas mas nenhuma localidade
    repository.saveWorld({ people: [{ id: "p1", name: "A B", sportingName: "A B", birth: "2000-01-01", nationality: "pt", roles: ["player"], personality: {}, archetype: "common", lod: 2 }], players: [], contracts: [], roles: [] });
    expect(repository.localities()).toEqual([]);
    expect(await handle({ id: 50, type: "worldState", input: null }, sl)).toMatchObject({ alreadyExisted: true });
    expect(repository.localities().length).toBe(298);
    expect(await handle({ id: 51, type: "worldState", input: null }, sl)).toMatchObject({ alreadyExisted: true }); // idempotente
    expect(repository.localities().length).toBe(298);
  });
});

describe("fichas ricas e «ver tudo»", () => {
  it("o gamer vê estimativas ou nada; o developer vê a verdade; a reputação vem em palavra", async () => {
    const s = testServicos();
    await handle({ id: 60, type: "createWorld", input: { seed: "ricas" } }, s);
    const club = (await handle({ id: 61, type: "clubProfile", input: { id: "sc-cascais" } }, s))!;
    expect(club.levelReputation).toBe("continental");
    expect(club.tier).toBe("firstLeague");
    expect(club.divisionsHistory).toEqual([{ season: 1, label: "2026/27", tier: "firstLeague", league: "Primeira Liga" }]);
    expect(club.truth).toBeUndefined();
    expect(club.detailStadium.transport).toBeGreaterThanOrEqual(0);
    const player = club.squad[0]!;
    expect(club.extraSquad[player.id]?.endContract).toBeTruthy();
    expect(club.extraSquad[player.id]?.level).toBeUndefined(); // ninguém o observou
    expect(club.extraSquad[player.id]?.rating).toBeUndefined();

    const profile = (await handle({ id: 62, type: "personProfile", input: { id: player.id } }, s))!;
    expect(profile.level).toBeUndefined();
    expect(profile.truth).toBeUndefined();
    expect(profile.stats).toEqual([]);
    expect(profile.contract?.end).toBeTruthy();

    const dev = (await handle({ id: 63, type: "personProfile", input: { id: player.id, seeAll: true } }, s))!;
    expect(Object.keys(dev.truth?.attributes ?? {}).length).toBeGreaterThan(30);
    expect(dev.truth?.potential).toBeGreaterThan(0);
    expect(dev.truth?.monthlyWage).toBeGreaterThan(0);
    expect(dev.level).toMatchObject({ exact: true });
    expect(dev.level!.value).toBeGreaterThan(1);
    expect(dev.level!.value).toBeLessThanOrEqual(20);
    expect(dev.rating!.stars).toBeGreaterThanOrEqual(0.5);
    expect(dev.rating!.stars).toBeLessThanOrEqual(5);
    expect(dev.rating!.potential!.high).toBeGreaterThanOrEqual(dev.rating!.stars);
    expect(profile.rating).toBeUndefined();

    const devClub = (await handle({ id: 64, type: "clubProfile", input: { id: "sc-cascais", seeAll: true } }, s))!;
    expect(devClub.truth?.reputation).toBe(8300);
    expect(devClub.truth?.squadLevel).toBeGreaterThan(5);
    expect(Object.keys(devClub.truth?.staffQuality ?? {}).length).toBeGreaterThan(0);
    expect(devClub.extraSquad[player.id]?.level?.exact).toBe(true);
    expect(devClub.extraSquad[player.id]?.rating?.stars).toBe(dev.rating!.stars);

    const president = club.roles.find((c) => c.fn === "president")!;
    const devPres = (await handle({ id: 65, type: "personProfile", input: { id: president.id, seeAll: true } }, s))!;
    expect(devPres.truth?.attributes).toBeUndefined();
    expect(Object.keys(devPres.truth?.personality ?? {}).length).toBeGreaterThan(3);
  });
});

describe("competition page (RZ-145)", () => {
  it("lists clubs, previews the calendar, zero table with zones; unknown league gives null", async () => {
    const s = testServicos();
    await handle({ id: 70, type: "createWorld", input: { seed: "league" } }, s);
    const list = await handle({ id: 71, type: "competitions", input: null }, s);
    expect(list.find((c) => c.tier === "district")?.district).toBeTruthy();
    const d = (await handle({ id: 72, type: "competitionPage", input: { league: "Primeira Liga" } }, s))!;
    expect(d.preview).toBe(true);
    expect(d.clubs).toHaveLength(20);
    expect(d.rounds).toHaveLength(38);
    expect(d.gamesTotal).toBe(380);
    expect(d.currentRound).toBe(0);
    expect(d.table).toHaveLength(20);
    expect(d.table.every((l) => l.points === 0 && l.played === 0)).toBe(true);
    expect(d.table.map((l) => l.zone)).toEqual(["champion", ...Array(16).fill(undefined), "relegation", "relegation", "relegation"]);
    expect(d.highlights.topScorers).toEqual([]);
    expect(d.highlights.bestAttack).toBeUndefined();
    expect(d.highlights.attackRanking).toEqual([]);
    const sec = (await handle({ id: 74, type: "competitionPage", input: { league: "Segunda Liga" } }, s))!;
    expect(sec.table.map((l) => l.zone).filter(Boolean)).toEqual(["champion", "promotion", "promotion", "relegation", "relegation", "relegation"]);
    const district = (await handle({ id: 75, type: "competitionPage", input: { league: list.find((c) => c.tier === "district")!.league } }, s))!;
    expect(district.table.map((l) => l.zone).filter(Boolean)).toEqual(["champion"]);
    expect(await handle({ id: 73, type: "competitionPage", input: { league: "Inexistente" } }, s)).toBeNull();
  });

  it("with matches played: table, current round and highlights", async () => {
    const s = testServicos();
    await handle({ id: 80, type: "createWorld", input: { seed: "liga2" } }, s);
    const { repository: r } = await s.openRepository();
    const pre = (await handle({ id: 81, type: "competitionPage", input: { league: "Primeira Liga" } }, s))!;
    const [m1, m2] = [pre.rounds[0]!.matches[0]!, pre.rounds[1]!.matches[0]!];
    const match = (id: string, round: number, home: string, away: string, gc: number, gf: number) => {
      const pc = r.publicSquad(home).filter((p) => p.player?.position !== "GK").slice(0, 11);
      const pf = r.publicSquad(away).filter((p) => p.player?.position !== "GK").slice(0, 11);
      const facts = Array.from({ length: gc }, (_, i) => ({ minute: 10 + i * 10, type: "G" as const, player: pc[0]!.id, club: home }))
        .concat(Array.from({ length: gf }, (_, i) => ({ minute: 15 + i * 10, type: "G" as const, player: pf[0]!.id, club: away })));
      const cards = [{ minute: 50, type: "CA" as const, player: pf[1]!.id, club: away }];
      const part = [...pc.map((p) => ({ player: p.id, club: home, starter: true, minutes: 90, rating: 7 })), ...pf.map((p) => ({ player: p.id, club: away, starter: true, minutes: 90, rating: 6 }))];
      r.recordMatch({ id, competition: "Primeira Liga", season: 1, round, date: "2026-08-16", home, away, homeGoals: gc, awayGoals: gf }, [...facts, ...cards], part);
    };
    match("t1", 1, m1.home, m1.away, 3, 0);
    match("t2", 2, m2.home, m2.away, 1, 1);
    const d = (await handle({ id: 82, type: "competitionPage", input: { league: "Primeira Liga" } }, s))!;
    expect(d.gamesPlayed).toBe(2);
    expect(d.table[0]).toMatchObject({ points: 3, played: 1 });
    expect(d.highlights.topScorers[0]).toMatchObject({ value: 3 });
    expect(d.highlights.bestAttack).toMatchObject({ value: 3 });
    expect(d.highlights.attackRanking).toHaveLength(20);
    expect(d.highlights.defenceRanking).toHaveLength(20);
    expect(d.highlights.defenceRanking[0]!.value).toBe(0);
    expect(d.highlights.mostYellow).toHaveLength(2);
    expect(d.players.length).toBeGreaterThanOrEqual(22);
    expect(d.players.find((p) => p.goals === 3)).toMatchObject({ games: 1, minutes: 90 });
    expect(d.highlights.bestRated).toEqual([]); // só 1 jogo com nota, mínimo é 3
  });
});
