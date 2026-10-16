import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { handle, type Servicos } from "../api/handler";
import { MemoryRepository } from "../persistencia/repositorioMemoria";

const read = (f: string) => readFileSync(`data/${f}.csv`, "utf8");
const servicos = (now = new Date(2026, 9, 15)): Servicos => {
  const repository = new MemoryRepository();
  return {
    now: () => now,
    openRepository: async () => ({ repository, backend: "memory" as const, sqliteVersion: "teste" }),
    loadData: async () => ({ clubs: read("clubs"), cities: read("cities"), localities: read("localities"), rivalries: read("rivalries"), districts: read("districts"), countries: read("countries") }),
  };
};

describe("clube do save", () => {
  it("escolhe-se uma vez; só os developers (forcar) podem trocar", async () => {
    const s = servicos();
    await handle({ id: 1, type: "createWorld", input: { seed: "club" } }, s);
    expect(await handle({ id: 2, type: "gamerClub", input: null }, s)).toBeNull();
    const [a, b] = await handle({ id: 3, type: "clubs", input: null }, s);
    await handle({ id: 4, type: "chooseClub", input: { id: a!.id } }, s);
    expect(await handle({ id: 5, type: "gamerClub", input: null }, s)).toEqual({ id: a!.id });
    await expect(handle({ id: 6, type: "chooseClub", input: { id: b!.id } }, s)).rejects.toThrow();
    await handle({ id: 7, type: "chooseClub", input: { id: b!.id, force: true } }, s);
    expect(await handle({ id: 8, type: "gamerClub", input: null }, s)).toEqual({ id: b!.id });
    await expect(handle({ id: 9, type: "chooseClub", input: { id: "nao-existe", force: true } }, s)).rejects.toThrow();
  }, 60000);
});

describe("demissão e ofertas", () => {
  it("o gamer demite-se, recebe ofertas semanais e só volta a jogar aceitando uma", async () => {
    const s = servicos();
    await handle({ id: 1, type: "createWorld", input: { seed: "resignation" } }, s);
    const clubs = await handle({ id: 2, type: "clubs", input: null }, s);
    const mine = clubs[40]!;
    await handle({ id: 3, type: "chooseClub", input: { id: mine.id } }, s);
    expect((await handle({ id: 4, type: "offers", input: null }, s)).unemployed).toBe(false);
    await handle({ id: 5, type: "resign", input: null }, s);
    expect(await handle({ id: 6, type: "gamerClub", input: null }, s)).toBeNull();
    await expect(handle({ id: 7, type: "resign", input: null }, s)).rejects.toThrow();
    const o1 = await handle({ id: 8, type: "offers", input: null }, s);
    expect(o1.unemployed).toBe(true);
    expect(o1.offers.length).toBeGreaterThanOrEqual(3);
    expect(o1.offers.every((o) => o.id !== mine.id)).toBe(true);
    // não se escolhe um clube à vontade: só uma oferta
    await expect(handle({ id: 9, type: "chooseClub", input: { id: clubs[0]!.id } }, s)).rejects.toThrow();
    await expect(handle({ id: 10, type: "acceptOffer", input: { id: "nao-existe" } }, s)).rejects.toThrow();
    // o tempo avança sem pausa e as ofertas renovam-se à segunda-feira
    const r = await handle({ id: 11, type: "advance", input: { mode: "semana" } }, s);
    expect(r.pause).toBeUndefined();
    const o2 = await handle({ id: 12, type: "offers", input: null }, s);
    expect(o2.offers[0]!.since > o1.offers[0]!.since).toBe(true);
    await handle({ id: 13, type: "acceptOffer", input: { id: o2.offers[0]!.id } }, s);
    expect(await handle({ id: 14, type: "gamerClub", input: null }, s)).toEqual({ id: o2.offers[0]!.id });
    expect((await handle({ id: 15, type: "offers", input: null }, s)).unemployed).toBe(false);
  }, 120000);
});

describe("época inicial", () => {
  it("vem da data real de criação do save: a 1 de julho muda a época", async () => {
    for (const [date, year] of [[new Date(2026, 5, 30), 2025], [new Date(2026, 6, 1), 2026], [new Date(2027, 9, 14), 2027]] as const) {
      const s = servicos(date);
      await handle({ id: 1, type: "createWorld", input: { seed: "year" } }, s);
      const t = await handle({ id: 2, type: "timeState", input: null }, s);
      expect(t.today).toBe(`${year}-07-01`);
      expect(t.matchesNextDay! >= `${year}-08-15`).toBe(true);
      const page = await handle({ id: 3, type: "competitionPage", input: { league: "Primeira Liga" } }, s);
      expect(page!.seasonLabel).toBe(`${year}/${String((year + 1) % 100).padStart(2, "0")}`);
    }
  }, 120000);
});

describe("avançar no tempo", () => {
  it("joga os jogos de cada dia, grava-os e passa à frente", async () => {
    const s = servicos();
    await handle({ id: 1, type: "createWorld", input: { seed: "advance" } }, s);
    const { repository: repo } = await s.openRepository();
    const before = await handle({ id: 2, type: "timeState", input: null }, s);
    expect(before.season).toBe(1);
    expect(before.today).toBe("2026-07-01");
    expect(before.byPlay).toBeGreaterThan(3000);
    expect(before.matchesNextDay! >= "2026-08-15").toBe(true);

    const club = (await handle({ id: 3, type: "clubs", input: null }, s))[0]!;
    await handle({ id: 31, type: "chooseClub", input: { id: club.id } }, s);
    // pára antes do jogo do clube, sem o jogar
    const r = await handle({ id: 4, type: "advance", input: { mode: "nextMatch" } }, s);
    expect(r.pause).toBeDefined();
    expect(r.pause!.home === club.id || r.pause!.away === club.id).toBe(true);
    expect(r.state.today).toBe(r.pause!.date);
    expect(repo.match(r.pause!.match)).toBeUndefined();
    expect(r.days.length).toBeGreaterThan(10); // de 1 de agosto até à véspera
    // outra tentativa sem confirmar continua parada
    const other = await handle({ id: 41, type: "advance", input: { mode: "day" } }, s);
    expect(other.days).toHaveLength(0);
    expect(other.pause!.match).toBe(r.pause!.match);
    // confirmado, joga o dia com o jogo do clube em detalhe
    await handle({ id: 42, type: "confirmMatch", input: { match: r.pause!.match } }, s);
    const match = await handle({ id: 43, type: "advance", input: { mode: "day" } }, s);
    expect(match.pause).toBeUndefined();
    const ofClub = match.days[0]!.matches.find((j) => j.home === club.id || j.away === club.id)!;
    expect(ofClub.level).toBe(0);
    expect(repo.match(ofClub.id)).toBeDefined();
    // jogo ao vivo: a linha do tempo do jogo do clube bate certo com o resultado
    const live = (await handle({ id: 44, type: "liveMatch", input: {} }, s))!;
    expect(live.id).toBe(ofClub.id);
    expect(live.lines.at(-1)!.type).toBe("end");
    expect([live.lines.at(-1)!.homeGoals, live.lines.at(-1)!.awayGoals]).toEqual([ofClub.homeGoals, ofClub.awayGoals]);
    expect(live.lines.filter((l) => l.type === "goal").length).toBe(ofClub.homeGoals + ofClub.awayGoals);
    expect(live.lines.every((l, i, a) => i === 0 || a[i - 1]!.minute <= l.minute)).toBe(true);
    expect(live.lines.some((l) => l.type === "shot" || l.type === "corner")).toBe(true);
    expect(live.lines[0]!.type).toBe("start");
    expect(live.lines.filter((l) => l.type === "goal").every((l) => l.situation !== undefined)).toBe(true);
    // tabela de antes e outros jogos da competição no mesmo dia
    expect(live.table.length).toBeGreaterThanOrEqual(10);
    expect(live.table.filter((l) => l.club === live.home.id || l.club === live.away.id).every((l) => l.matches === 0)).toBe(true); // primeira jornada: ainda não jogaram
    const sameDay = match.days[0]!.matches.filter((j) => j.competition === live.competition && j.id !== live.id);
    expect(live.others.map((o) => o.id).sort()).toEqual(sameDay.map((j) => j.id).sort());
    for (const o of live.others) expect(o.goals.length).toBe(o.homeGoals + o.awayGoals);
    const all = [...r.days, ...match.days].flatMap((d) => d.matches);
    expect(all.length).toBeGreaterThan(10);
    expect(all.filter((j) => j.level === 1).length).toBe(all.length - all.filter((j) => j.level === 0).length);
    expect(match.state.byPlay).toBe(before.byPlay - all.length);

    // um dia a seguir não repete jogos
    const r2 = await handle({ id: 5, type: "advance", input: { mode: "day" } }, s);
    for (const j of r2.days.flatMap((d) => d.matches)) expect(all.map((x) => x.id)).not.toContain(j.id);
  }, 120000);

  it("uma época inteira: lesões e suspensões acontecem e todos os jogos são jogados", async () => {
    const s = servicos();
    await handle({ id: 1, type: "createWorld", input: { seed: "season" } }, s);
    const { repository: repo } = await s.openRepository();
    const start = await handle({ id: 2, type: "timeState", input: null }, s);
    let injuries = 0, reds = 0, matches = 0, end = false, keeps = 0, summary: Awaited<ReturnType<typeof handle<"advance">>>["seasonSummary"];
    while (!end && keeps++ < 80) {
      const r = await handle({ id: 3, type: "advance", input: { mode: "semana" } }, s);
      for (const d of r.days) for (const j of d.matches) { matches++; injuries += j.injuries.length; reds += j.cards.filter((c) => c.colour === "red").length; }
      end = r.seasonEnd;
      summary = r.seasonSummary;
    }
    expect(end).toBe(true);
    expect(matches).toBeGreaterThan(start.byPlay); // ligas + Fase de Promoção
    expect(injuries).toBeGreaterThan(100);
    expect(reds).toBeGreaterThan(50);
    // as distritais acabam cedo e a Fase de Promoção joga-se até maio
    const last = (c: string) => repo.competitionMatches(c, 1).map((j) => j.date).sort().pop()!;
    const districtLeagues = (await handle({ id: 9, type: "competitions", input: null }, s)).filter((c) => c.tier === "district");
    expect(districtLeagues.length).toBe(20);
    for (const d of districtLeagues) expect(last(d.league) <= "2027-04-06").toBe(true);
    for (const g of ["A", "B", "C", "D"]) expect(repo.competitionMatches(`Fase de Promoção ${g}`, 1).length).toBe(10);
    for (const g of ["A", "B", "C", "D"]) expect(last(`Fase de Promoção ${g}`) <= "2027-05-31").toBe(true);
    expect(summary!.champions.length).toBe(7);
    // as séries do CP acabam cedo e há meias-finais e final entre os quatro campeões, tudo até maio
    for (const sr of ["A", "B", "C", "D"]) expect(last(`CP Série ${sr}`) <= "2027-04-26").toBe(true);
    expect(repo.competitionMatches("CP Meias-Finais", 1)).toHaveLength(2);
    expect(repo.competitionMatches("CP Final", 1)).toHaveLength(1);
    expect(last("CP Final") <= "2027-05-31").toBe(true);
    expect(last("CP Meias-Finais") < last("CP Final")).toBe(true);
    const seriesChampions = new Set(summary!.champions.filter((x) => x.league.startsWith("CP Série")).map((x) => x.club));
    for (const j of [...repo.competitionMatches("CP Meias-Finais", 1), ...repo.competitionMatches("CP Final", 1)].filter((x) => x.competition === "CP Meias-Finais")) {
      expect(seriesChampions.has(j.home) && seriesChampions.has(j.away)).toBe(true);
    }
    expect(repo.count("CAMPEAO")).toBe(8); // sete campeões de liga/série e o campeão do CP
    // prémios por vencer cada competição (RZ-216): 3 ligas + 4 séries + vencedor do CP + 20 distritais + 4 grupos da Fase de Promoção
    expect(repo.count("PREMIO_COMPETICAO")).toBe(32);
    // Prémio do Estado: um por distrito (20), pago ao melhor classificado da pirâmide, com o valor dos parâmetros
    expect(repo.count("PREMIO_ESTADO")).toBe(20);
    const firstChampion = summary!.champions.find((x) => x.league === "Primeira Liga")!.club;
    expect(repo.count("PREMIO_ESTADO", { k: "club", id: firstChampion })).toBe(1);
    expect(summary!.movements.length).toBeGreaterThan(20);
    expect(repo.meta("season")).toBe("2");
    expect(repo.meta("piramide.2")).toBeDefined();
    const fresh = await handle({ id: 4, type: "timeState", input: null }, s);
    expect(fresh.season).toBe(2);
    expect(fresh.byPlay).toBeGreaterThan(3000);
    // as cidades mudaram: um estado novo por concelho, só em palavras para a interface, e os acontecimentos viram notícia
    const first = (await handle({ id: 20, type: "clubs", input: null }, s))[0]!;
    const fc = (await handle({ id: 21, type: "clubProfile", input: { id: first.id } }, s))!;
    const city = (await handle({ id: 22, type: "cityProfile", input: { id: fc.city.id } }, s))!;
    expect(city.historyPopulation.map((p) => p.label)).toEqual(["2026/27", "2027/28"]);
    expect(city.indicators).toHaveLength(6);
    for (const i of city.indicators) { expect(i.level).toBeGreaterThanOrEqual(1); expect(i.level).toBeLessThanOrEqual(5); expect(i.history).toHaveLength(2); }
    expect(city.clubs.some((c) => c.ref.id === first.id)).toBe(true);
    expect(repo.count("CIDADE_EPOCA")).toBe(276);
    const world = await handle({ id: 23, type: "news", input: { scope: "world", limit: 300 } }, s);
    expect(world.some((n) => n.type === "cidade_evento")).toBe(true);
    const old = await handle({ id: 5, type: "competitionPage", input: { league: "Primeira Liga", season: 1 } }, s);
    expect(old!.gamesPlayed).toBe(380);
    expect(old!.table.every((l) => l.played === 38)).toBe(true);
    const current = await handle({ id: 6, type: "competitionPage", input: { league: "Primeira Liga" } }, s);
    expect(current!.gamesPlayed).toBe(0);
    const rose = summary!.movements.find((m) => m.reason !== "relegation" && m.para === "first");
    if (rose) expect(current!.table.some((l) => l.club === rose.club)).toBe(true);
  }, 600000);
});

describe("plano de jogo", () => {
  it("guarda tática e onze, valida e usa-os no jogo do clube", async () => {
    const s = servicos();
    await handle({ id: 1, type: "createWorld", input: { seed: "plan" } }, s);
    const club = (await handle({ id: 2, type: "clubs", input: null }, s))[0]!;
    expect(await handle({ id: 3, type: "plan", input: null }, s)).toBeNull();
    await handle({ id: 4, type: "chooseClub", input: { id: club.id } }, s);
    const p = (await handle({ id: 5, type: "plan", input: null }, s))!;
    expect(p.automatic).toBe(true);
    expect(p.lineup).toHaveLength(11);
    expect(p.squad.length).toBeGreaterThan(18);
    expect(p.nextMatch?.confirmed).toBe(false);

    // formação 4-4-2 com o onze proposto reorganizado: rejeita posições que não batem
    await expect(handle({ id: 6, type: "savePlan", input: { tactic: { ...p.tactic, formation: "4-4-2" }, lineup: p.lineup.map((o) => ({ player: o.player, position: o.position })) } }, s)).rejects.toThrow();
    await expect(handle({ id: 7, type: "savePlan", input: { tactic: { ...p.tactic, intensity: 9 as never }, lineup: null } }, s)).rejects.toThrow();
    const fresh = await handle({ id: 8, type: "savePlan", input: { tactic: { ...p.tactic, style: "direct", tempo: 5 }, lineup: p.lineup.map((o) => ({ player: o.player, position: o.position })) } }, s);
    expect(fresh.automatic).toBe(false);
    expect(fresh.tactic).toMatchObject({ style: "direct", tempo: 5 });
    expect((await handle({ id: 9, type: "plan", input: null }, s))!.lineup.map((o) => o.player)).toEqual(p.lineup.map((o) => o.player));
    const leg = await handle({ id: 10, type: "savePlan", input: { tactic: fresh.tactic, lineup: null } }, s);
    expect(leg.automatic).toBe(true);
  }, 60000);
});
