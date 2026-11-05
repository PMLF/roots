import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { handle, type Servicos } from "../api/handler";
import type { ClubCompetition, EuropeView } from "../api/contracts";
import { DEFAULT_PARAMETERS as P } from "../config/parameters";
import { MemoryRepository } from "../persistence/repositoryMemory";
import { matchWinner } from "../persistence/types";
import { readRun } from "../season/competitions";
import { CHAMPIONS_LEAGUE, CONFERENCE_LEAGUE, EUROPA_LEAGUE } from "./europe";

const read = (f: string) => readFileSync(`data/${f}.csv`, "utf8");
const servicos = (): Servicos => {
  const repository = new MemoryRepository();
  return {
    now: () => new Date(2026, 9, 15),
    openRepository: async () => ({ repository, backend: "memory" as const, sqliteVersion: "test" }),
    loadData: async () => ({ clubs: read("clubs"), cities: read("cities"), localities: read("localities"), rivalries: read("rivalries"), districts: read("districts"), countries: read("countries") }),
  };
};

describe("competições europeias (RZ-902)", () => {
  it("uma época: três competições de 36 clubes, fase de liga, play-off e eliminatórias até à final", async () => {
    const s = servicos();
    await handle({ id: 1, type: "createWorld", input: { seed: "europe" } }, s);
    const { repository: repo } = await s.openRepository();
    let end = false, keeps = 0;
    while (!end && keeps++ < 90) end = (await handle({ id: 2, type: "advance", input: { mode: "week" } }, s)).seasonEnd;
    expect(end).toBe(true);
    // Portugal no ranking inicial (vagas guardadas em `europe.slots.1`): o n.º de portugueses em cada prova segue essas vagas (o perdedor da pré-eliminatória cai para a Liga Europa, a Taça acrescenta uma na Liga Europa)
    const slots = JSON.parse(repo.meta("europe.slots.1")!) as { rank: number; championsLeague: number; championsQualifying: number; europaLeague: number; conferenceLeague: number };
    expect(slots.rank).toBeGreaterThanOrEqual(5);
    expect(slots.rank).toBeLessThanOrEqual(12);
    for (const [name, perClub, minPt, maxPt] of [
      [CHAMPIONS_LEAGUE, 8, slots.championsLeague, slots.championsLeague + slots.championsQualifying],
      [EUROPA_LEAGUE, 8, slots.europaLeague, slots.europaLeague + slots.championsQualifying + 1],
      [CONFERENCE_LEAGUE, 6, slots.conferenceLeague, slots.conferenceLeague],
    ] as const) {
      const run = readRun(repo, 1, name)!;
      expect(run, name).toBeDefined();
      expect(run.done, `${name} acabou`).toBe(true);
      const first = run.outcomes[0]!.ranking;
      expect(first).toHaveLength(P.europe.size);
      const portuguese = first.filter((c) => !c.startsWith("x-")).length;
      expect(portuguese).toBeGreaterThanOrEqual(minPt);
      expect(portuguese).toBeLessThanOrEqual(maxPt);
      const games = repo.competitionMatches(name, 1);
      const league = games.filter((g) => g.id.includes("-lp-"));
      expect(league).toHaveLength((P.europe.size * perClub) / 2);
      // a fase de liga admite empates e nunca prolongamento; nenhum jogo a eliminar acaba sem vencedor
      expect(league.every((g) => !g.extraTime && g.homePenalties === undefined)).toBe(true);
      const calendar = repo.calendar(name, 1).matches;
      const decided = games.filter((g) => !g.id.includes("-lp-") && calendar.find((c) => c.id === g.id)?.knockout);
      expect(decided.length).toBeGreaterThan(0);
      expect(run.winner).toBeDefined();
      expect(matchWinner(games.at(-1)!) ?? run.winner).toBeDefined();
      // 1.ª mãos sem prolongamento nem penáltis
      const firstLegs = calendar.filter((c) => !c.id.includes("-lp-") && !c.firstLeg && !c.neutral && calendar.some((x) => x.firstLeg === c.id));
      expect(firstLegs.length).toBeGreaterThan(0);
      for (const f of firstLegs) { const m = games.find((g) => g.id === f.id)!; expect(m.extraTime).toBeFalsy(); expect(m.homePenalties).toBeUndefined(); }
      // vista para a UI: tabela com zonas e eliminatórias até à final
      const view = (await handle({ id: 3, type: "europeView", input: { competition: name, season: 1 } }, s)) as EuropeView;
      expect(view.table).toHaveLength(P.europe.size);
      expect(view.table.filter((r) => r.zone === "direct")).toHaveLength(8);
      expect(view.table.filter((r) => r.zone === "playoff")).toHaveLength(16);
      expect(view.table.filter((r) => r.zone === "out")).toHaveLength(12);
      expect(view.rounds.at(-1)!.key).toBe("final");
      expect(view.rounds[0]!.key).toBe("playoff");
      expect(view.winner?.club).toBe(run.winner);
      // a ficha do clube português mostra a competição
      const pt = first.find((c) => !c.startsWith("x-"))!;
      const mine = (await handle({ id: 4, type: "clubCompetitions", input: { club: pt, season: 1 } }, s)) as ClubCompetition[];
      expect(mine.find((c) => c.competition === name)).toBeDefined();
      // notícias (RZ-250): qualificação e sorteio no início, resultado da fase de liga no fim
      const events = repo.eventsOf({ k: "club", id: pt }, {}).filter((e) => (e.season === 1 && e.entities.some((x) => x.k === "competition" && x.id === name)));
      expect(events.filter((e) => e.type === "EUROPE_QUALIFIED")).toHaveLength(1);
      const draw = events.find((e) => e.type === "EUROPE_DRAW")!;
      expect((draw.data as { opponents: string[] }).opponents).toHaveLength(perClub);
      const phase = events.find((e) => e.type === "EUROPE_LEAGUE_PHASE")!;
      expect(["direct", "playoff", "out"]).toContain((phase.data as { zone: string }).zone);
    }
  }, 480000);
});
