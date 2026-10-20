import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { handle, type Servicos } from "../api/handler";
import { MemoryRepository } from "../persistence/repositoryMemory";

const read = (f: string) => readFileSync(`data/${f}.csv`, "utf8");
const servicos = (now = new Date(2026, 9, 15)): Servicos => {
  const repository = new MemoryRepository();
  return {
    now: () => now,
    openRepository: async () => ({ repository, backend: "memory" as const, sqliteVersion: "test" }),
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
    const r = await handle({ id: 11, type: "advance", input: { mode: "week" } }, s);
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
});

describe("plano de jogo", () => {
  it("guarda tática e onze, valida e usa-os no jogo do clube", async () => {
    const s = servicos();
    await handle({ id: 1, type: "createWorld", input: { seed: "plan" } }, s);
    const club = (await handle({ id: 2, type: "clubs", input: null }, s))[0]!;
    expect(await handle({ id: 3, type: "plan", input: null }, s)).toBeNull();
    await handle({ id: 4, type: "chooseClub", input: { id: club.id } }, s);
    const p = (await handle({ id: 5, type: "plan", input: null }, s))!;
    // sem onze automático: o campo começa vazio e só o gamer escolhe quem joga
    expect(p.lineup).toHaveLength(11);
    expect(p.lineup.every((o) => o.player === undefined)).toBe(true);
    expect(p.ready).toMatchObject({ ok: false, reason: "incomplete" });
    expect(p.squad.length).toBeGreaterThan(18);
    expect(p.squad[0]).toMatchObject({ matches: 0, goals: 0 });
    expect(p.nextMatch?.confirmed).toBe(false);
    await expect(handle({ id: 60, type: "confirmMatch", input: { match: p.nextMatch!.id, strict: true } }, s)).rejects.toThrow(/onze/);

    // o gamer escolhe o melhor para cada posição (aqui, o 1.º do plantel que tenha a posição) e banco
    const used = new Set<string>();
    const pick = p.lineup.map((slot) => {
      const who = p.squad.find((q) => !used.has(q.player) && !q.unavailable && q.positions.some((x) => x.pos === slot.position)) ?? p.squad.find((q) => !used.has(q.player) && !q.unavailable)!;
      used.add(who.player);
      return { player: who.player, position: slot.position };
    });
    const bench = p.squad.filter((q) => !used.has(q.player)).slice(0, 7).map((q) => q.player);
    // formação 4-4-2 com as posições do 4-3-3: rejeita
    await expect(handle({ id: 6, type: "savePlan", input: { tactic: { ...p.tactic, formation: "4-4-2" }, lineup: pick } }, s)).rejects.toThrow();
    await expect(handle({ id: 7, type: "savePlan", input: { tactic: { ...p.tactic, intensity: 9 as never } } }, s)).rejects.toThrow();
    await expect(handle({ id: 61, type: "savePlan", input: { tactic: p.tactic, lineup: pick, bench: [pick[0]!.player] } }, s)).rejects.toThrow(/onze e no banco/);
    const fresh = await handle({ id: 8, type: "savePlan", input: { tactic: { ...p.tactic, directness: 5, intensity: 5 }, lineup: pick, bench } }, s);
    expect(fresh.tactic).toMatchObject({ directness: 5, intensity: 5 });
    expect(fresh.bench).toEqual(bench);
    expect(fresh.lineup.map((o) => o.player)).toEqual(pick.map((o) => o.player));
    // um onze incompleto guarda-se (a montar) mas não se confirma
    const partial = await handle({ id: 62, type: "savePlan", input: { tactic: p.tactic, lineup: pick.slice(0, 5) } }, s);
    expect(partial.lineup.filter((o) => o.player).length).toBe(5);
    expect(partial.ready.reason).toBe("incomplete");
  }, 60000);
});
