import { CHAMPIONS_LEAGUE, CONFERENCE_LEAGUE, EUROPA_LEAGUE } from "../europe/europe";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { handle, type Servicos } from "../api/handler";
import { MemoryRepository } from "../persistence/repositoryMemory";
import { matchWinner } from "../persistence/types";
import { weekDay, dayNumber as toDays } from "../calendar/dates";
import { CUP, SUPERCUP, districtCupName, districtSupercupName } from "./competitions";
import { NATIONAL_STADIUM } from "./venues";

const read = (f: string) => readFileSync(`data/${f}.csv`, "utf8");
const servicos = (now = new Date(2026, 9, 15)): Servicos => {
  const repository = new MemoryRepository();
  return {
    now: () => now,
    openRepository: async () => ({ repository, backend: "memory" as const, sqliteVersion: "test" }),
    loadData: async () => ({ clubs: read("clubs"), cities: read("cities"), localities: read("localities"), rivalries: read("rivalries"), districts: read("districts"), countries: read("countries") }),
  };
};

describe("avançar no tempo (época inteira)", () => {
  it("uma época inteira: lesões e suspensões acontecem e todos os jogos são jogados", async () => {
    const s = servicos();
    await handle({ id: 1, type: "createWorld", input: { seed: "season" } }, s);
    const { repository: repo } = await s.openRepository();
    const start = await handle({ id: 2, type: "timeState", input: null }, s);
    let injuries = 0, reds = 0, matches = 0, end = false, keeps = 0, summary: Awaited<ReturnType<typeof handle<"advance">>>["seasonSummary"];
    while (!end && keeps++ < 80) {
      const r = await handle({ id: 3, type: "advance", input: { mode: "week" } }, s);
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
    const european = [CHAMPIONS_LEAGUE, EUROPA_LEAGUE, CONFERENCE_LEAGUE].reduce((n, c) => n + repo.count("CHAMPION", { k: "competition", id: c }), 0);
    expect(repo.count("CHAMPION") - european).toBe(9); // sete campeões de liga/série, o campeão do CP e o vencedor da Taça (europeias à parte: só se um clube português as ganha)
    // Taça (RZ-140): jogo único, só jogos com vencedor, final no Estádio Nacional e último jogo interno da época
    const cupMatches = repo.competitionMatches(CUP, 1);
    const cupCalendar = repo.calendar(CUP, 1).matches;
    // meias-finais a duas mãos: a 1.ª pode acabar empatada e a 2.ª decide-se pelo agregado; os jogos únicos têm todos vencedor
    const firstLegs = new Set(cupCalendar.flatMap((j) => (j.firstLeg ? [j.firstLeg] : [])));
    const twoLegged = new Set(cupCalendar.filter((j) => j.firstLeg || firstLegs.has(j.id)).map((j) => j.id));
    expect(cupMatches.filter((j) => !twoLegged.has(j.id)).every((j) => matchWinner(j) !== undefined)).toBe(true);
    const cupFinal = cupCalendar.reduce((a, b) => (b.date > a.date ? b : a));
    expect(cupCalendar.filter((j) => j.date === cupFinal.date)).toHaveLength(1);
    expect(cupFinal.neutral).toBe(true);
    expect(cupFinal.venue).toBe(NATIONAL_STADIUM);
    expect(cupCalendar.every((j) => j.knockout === true || firstLegs.has(j.id))).toBe(true);
    const comps = await handle({ id: 10, type: "competitions", input: null }, s);
    const everyLeague = [...comps.map((c) => c.league), "CP Meias-Finais", "CP Final", ...["A", "B", "C", "D"].map((g) => `Fase de Promoção ${g}`)];
    for (const c of everyLeague) expect(last(c) < cupFinal.date, c).toBe(true);
    // a final do CP também é no Estádio Nacional
    expect(repo.calendar("CP Final", 1).matches[0]!.venue).toBe(NATIONAL_STADIUM);
    // as rondas da Taça são fins de semana de taça (domingo) em que as ligas param, a nível nacional
    const leagueDays = new Set(everyLeague.flatMap((c) => repo.competitionMatches(c, 1).map((j) => j.date)));
    for (const j of cupCalendar) {
      expect(leagueDays.has(j.date), j.date).toBe(false);
      expect(weekDay(j.date)).toBe(0);
    }
    const rounds = [...new Set(cupCalendar.map((j) => j.round))].sort((a, b) => a - b);
    expect(rounds.length).toBeGreaterThanOrEqual(6);
    // das distritais só entram os campeões de cada distrito e o vencedor da taça distrital (na 1.ª época: os de maior reputação)
    const inCup = new Set(cupCalendar.flatMap((j) => [j.home, j.away]));
    const districtClubs = comps.filter((c) => c.tier === "district").flatMap((c) => repo.calendar(c.league, 1).matches.flatMap((j) => [j.home, j.away]));
    const districtInCup = [...new Set(districtClubs)].filter((c) => inCup.has(c));
    expect(districtInCup.length).toBeGreaterThan(0);
    expect(districtInCup.length).toBeLessThanOrEqual(40);
    // os clubes da Primeira Liga só entram na última vaga
    const firstLeague = new Set(repo.calendar(comps.find((c) => c.tier === "firstLeague")!.league, 1).matches.flatMap((j) => [j.home, j.away]));
    expect(cupCalendar.filter((j) => j.round === rounds[0]).some((j) => firstLeague.has(j.home) || firstLeague.has(j.away))).toBe(false);
    expect(cupCalendar.some((j) => firstLeague.has(j.home) || firstLeague.has(j.away))).toBe(true);
    // Taças Distritais (RZ-142): uma por distrito, só com clubes desse distrito; a final num estádio do distrito que não é de nenhum dos finalistas
    const districts = comps.filter((c) => c.tier === "district").map((c) => c.league.replace(/^Distrital /, ""));
    for (const d of districts) {
      const name = districtCupName(d);
      const ms = repo.competitionMatches(name, 1);
      expect(ms.length, name).toBeGreaterThanOrEqual(5);
      expect(ms.every((j) => matchWinner(j) !== undefined)).toBe(true);
      const cal = repo.calendar(name, 1).matches;
      const final = cal.reduce((a, b) => (b.date > a.date ? b : a));
      expect(final.neutral, name).toBe(true);
      expect(final.venue && final.venue !== NATIONAL_STADIUM && final.venue !== final.home && final.venue !== final.away, name).toBe(true);
      expect(weekDay(final.date)).toBe(0);
    }
    // descanso: nenhum clube joga duas vezes com menos de 3 dias de diferença, em nenhuma competição
    const byClub = new Map<string, string[]>();
    for (const c of [...everyLeague, CUP, ...districts.map(districtCupName)]) for (const j of repo.competitionMatches(c, 1)) for (const club of [j.home, j.away]) byClub.set(club, [...(byClub.get(club) ?? []), j.date]);
    let tight = 0;
    for (const [club, dates] of byClub) {
      const sorted = [...dates].sort();
      for (let i = 1; i < sorted.length; i++) if (toDays(sorted[i]!) - toDays(sorted[i - 1]!) < 3) { tight++; if (tight < 5) console.log("DESCANSO", club, sorted[i - 1], sorted[i]); }
    }
    expect(tight).toBe(0);
    // prémios por vencer cada competição (RZ-216): 3 ligas + 4 séries + vencedor do CP + 20 distritais + 4 grupos da Fase de Promoção;
    // taças: vencedor e finalista de 21 taças, mais um prémio por cada eliminatória ganha na Taça antes da final
    const europeanPrizes = [CHAMPIONS_LEAGUE, EUROPA_LEAGUE, CONFERENCE_LEAGUE].reduce((n, c) => n + repo.count("COMPETITION_PRIZE", { k: "competition", id: c }), 0);
    expect(repo.count("COMPETITION_PRIZE") - europeanPrizes).toBe(32 + 2 * 21 + (cupMatches.length - 1 - twoLegged.size / 2));
    // fecho da época: qualificados para a Taça seguinte e supertaças distritais fixadas
    expect(JSON.parse(repo.meta("cupQualifiers.2")!).length).toBeGreaterThanOrEqual(20);
    expect(Object.keys(JSON.parse(repo.meta("districtSupercup.2")!)).length).toBe(20);
    // Prémio do Estado: um por distrito (20), pago ao melhor classificado da pirâmide, com o valor dos parâmetros
    expect(repo.count("STATE_PRIZE")).toBe(20);
    const firstChampion = summary!.champions.find((x) => x.league === "Primeira Liga")!.club;
    expect(repo.count("STATE_PRIZE", { k: "club", id: firstChampion })).toBe(1);
    expect(summary!.movements.length).toBeGreaterThan(20);
    expect(repo.meta("season")).toBe("2");
    expect(repo.meta("pyramid.2")).toBeDefined();
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
    expect(repo.count("CITY_SEASON")).toBe(276);
    const world = await handle({ id: 23, type: "news", input: { scope: "world", limit: 300 } }, s);
    expect(world.some((n) => n.type === "city_event")).toBe(true);
    const old = await handle({ id: 5, type: "competitionPage", input: { league: "Primeira Liga", season: 1 } }, s);
    expect(old!.gamesPlayed).toBe(380);
    expect(old!.table.every((l) => l.played === 38)).toBe(true);
    const current = await handle({ id: 6, type: "competitionPage", input: { league: "Primeira Liga" } }, s);
    expect(current!.gamesPlayed).toBe(0);
    const rose = summary!.movements.find((m) => m.reason !== "relegation" && m.to === "first");
    if (rose) expect(current!.table.some((l) => l.club === rose.club)).toBe(true);
  }, 600000);
});

describe("Supertaça (RZ-141)", () => {
  it("joga-se antes da primeira jornada da época seguinte, em campo neutro, entre o campeão e o vencedor da Taça", async () => {
    const s = servicos();
    await handle({ id: 1, type: "createWorld", input: { seed: "supercup" } }, s);
    const { repository: repo } = await s.openRepository();
    // a primeira época não tem Supertaça (ainda não houve campeão)
    expect(repo.calendar(SUPERCUP, 1).matches).toHaveLength(0);
    let end = false, keeps = 0, summary: Awaited<ReturnType<typeof handle<"advance">>>["seasonSummary"];
    while (!end && keeps++ < 80) {
      const r = await handle({ id: 2, type: "advance", input: { mode: "week" } }, s);
      end = r.seasonEnd;
      summary = r.seasonSummary;
    }
    expect(end).toBe(true);
    const champion = summary!.champions.find((x) => x.league === "Primeira Liga")!.club;
    const cupFinal = repo.competitionMatches(CUP, 1).reduce((a, b) => (b.date > a.date ? b : a));
    const cupWinner = matchWinner(cupFinal)!;
    const expected = cupWinner === champion ? (cupFinal.home === champion ? cupFinal.away : cupFinal.home) : cupWinner;
    // marcada logo no arranque da época 2
    const [game] = repo.calendar(SUPERCUP, 2).matches;
    expect(repo.calendar(SUPERCUP, 2).matches).toHaveLength(1);
    expect([game!.home, game!.away].sort()).toEqual([champion, expected].sort());
    expect(game!.knockout).toBe(true);
    expect(game!.neutral).toBe(true);
    expect(game!.venue).toBe(NATIONAL_STADIUM);
    expect(weekDay(game!.date)).toBe(0);
    // supertaças distritais: uma por distrito, uma semana antes, num estádio do distrito
    const districtSupers = Object.entries(JSON.parse(repo.meta("districtSupercup.2")!) as Record<string, [string, string]>);
    expect(districtSupers.length).toBeGreaterThan(10);
    for (const [district, pair] of districtSupers) {
      const [m] = repo.calendar(districtSupercupName(district), 2).matches;
      expect([m!.home, m!.away].sort()).toEqual([...pair].sort());
      expect(m!.neutral && m!.venue && m!.venue !== m!.home && m!.venue !== m!.away).toBeTruthy();
      expect(m!.date < game!.date).toBe(true);
    }
    const firstLeague = (await handle({ id: 3, type: "competitions", input: null }, s)).find((c) => c.tier === "firstLeague")!.league;
    const firstRound = repo.calendar(firstLeague, 2).matches.map((j) => j.date).sort()[0]!;
    expect(game!.date < firstRound).toBe(true);
    // joga-se mesmo: o vencedor recebe o prémio e há campeão
    keeps = 0;
    while (repo.competitionMatches(SUPERCUP, 2).length === 0 && keeps++ < 20) await handle({ id: 4, type: "advance", input: { mode: "week" } }, s);
    expect(repo.competitionMatches(SUPERCUP, 2)).toHaveLength(1);
    const played = repo.competitionMatches(SUPERCUP, 2)[0]!;
    expect(matchWinner(played)).toBeDefined();
    expect(played.date).toBe(game!.date);
    expect(repo.count("CHAMPION", { k: "club", id: matchWinner(played)! })).toBeGreaterThanOrEqual(1);
  }, 240000);
});
