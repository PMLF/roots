import { describe, expect, it } from "vitest";
import { Rng } from "../aleatorio/rng";
import { generateLeagueCalendar, forRepository } from "../calendario/calendario";
import { DEFAULT_PARAMETERS as P } from "../config/parametros";
import { playMatch } from "../jogo/detalhe";
import { syntheticTeam } from "../jogo/teste-util";
import { MemoryRepository } from "../persistencia/repositorioMemoria";
import { competitionStatus, competitionTable } from "./tabela";

describe("uma liga inteira: calendário, jogos, tabela e jornadas", () => {
  const clubs = ["A", "B", "C", "D", "E", "F", "G", "H"];
  const strength = new Map(clubs.map((c, i) => [c, 14 - i]));
  const cal = generateLeagueCalendar({ competition: "L", tier: "secondLeague", clubs }, 1, P.calendar, new Rng("cal"));

  function play(stop?: string) {
    const repo = new MemoryRepository();
    const { matches, byes } = forRepository(cal);
    repo.saveCalendar(matches, byes);
    for (const g of [...matches].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1))) {
      if (stop !== undefined && g.date > stop) break;
      const r = playMatch(
        { seed: "league", id: g.id, home: syntheticTeam(g.home, strength.get(g.home)!), away: syntheticTeam(g.away, strength.get(g.away)!) },
        1,
        { id: g.id, competition: g.competition, season: g.season, round: g.round, date: g.date },
        P,
      );
      repo.recordMatch(r.record.match, r.record.facts, r.record.appearances);
    }
    return { repo, total: matches.length };
  }

  it("no fim, a tabela tem todos os clubes, jogos certos, pontos coerentes e as melhores equipas em cima", () => {
    const { repo, total } = play();
    const t = competitionTable(repo, "L", 1, "league", P, { seed: "x" });
    expect(t).toHaveLength(8);
    expect(t.map((l) => l.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(t.every((l) => l.matches === 14)).toBe(true);
    expect(t.reduce((s, l) => s + l.matches, 0)).toBe(total * 2);
    expect(t.reduce((s, l) => s + l.scoredGoals, 0)).toBe(t.reduce((s, l) => s + l.concededGoals, 0));
    for (let i = 1; i < t.length; i++) expect(t[i - 1]!.points).toBeGreaterThanOrEqual(t[i]!.points);
    // o mais forte fica no topo meia dúzia, o mais fraco nos últimos
    expect(["A", "B", "C"]).toContain(t[0]!.club);
    expect(["F", "G", "H"]).toContain(t[7]!.club);
    const e = competitionStatus(repo, "L", 1, "2027-06-30");
    expect(e).toMatchObject({ finished: true, playedMatches: total, matchesPerPlay: 0 });
    expect(e.rounds).toHaveLength(14);
    expect(e.inDelay).toEqual([]);
  });

  it("a meio da época: jornada atual, próxima data e clubes sem jogos continuam na tabela", () => {
    const middle = cal.rounds[4]!.date;
    const { repo, total } = play(middle);
    const e = competitionStatus(repo, "L", 1, middle);
    expect(e.finished).toBe(false);
    expect(e.playedMatches).toBeGreaterThan(0);
    expect(e.playedMatches).toBeLessThan(total);
    expect(e.currentRound).toBeGreaterThanOrEqual(5);
    expect(e.inDelay).toEqual([]);
    const without = new MemoryRepository();
    const { matches, byes } = forRepository(cal);
    without.saveCalendar(matches, byes);
    const t0 = competitionTable(without, "L", 1, "league", P, { seed: "x" });
    expect(t0.map((l) => l.club).sort()).toEqual(clubs);
    expect(t0.every((l) => l.points === 0)).toBe(true);
    // jogos por jogar já passados da data contam como atraso
    expect(competitionStatus(without, "L", 1, "2027-06-30").inDelay).toHaveLength(total);
  });

  it("é determinístico", () => {
    const a = competitionTable(play().repo, "L", 1, "league", P, { seed: "x" });
    const b = competitionTable(play().repo, "L", 1, "league", P, { seed: "x" });
    expect(b).toEqual(a);
  });
});
