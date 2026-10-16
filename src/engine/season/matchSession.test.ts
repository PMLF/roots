import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { handle, type Servicos } from "../api/handler";
import { DEFAULT_TACTIC } from "../match/formations";
import { MemoryRepository } from "../persistence/repositoryMemory";

const read = (f: string) => readFileSync(`data/${f}.csv`, "utf8");
const servicos = (): Servicos => {
  const repository = new MemoryRepository();
  return {
    now: () => new Date(2026, 9, 15),
    openRepository: async () => ({ repository, backend: "memory" as const, sqliteVersion: "test" }),
    loadData: async () => ({ clubs: read("clubs"), cities: read("cities"), localities: read("localities"), rivalries: read("rivalries"), districts: read("districts"), countries: read("countries") }),
  };
};

async function untilMatch(seed: string) {
  const s = servicos();
  await handle({ id: 1, type: "createWorld", input: { seed } }, s);
  const club = (await handle({ id: 2, type: "clubs", input: null }, s))[10]!;
  await handle({ id: 3, type: "chooseClub", input: { id: club.id } }, s);
  const r = await handle({ id: 4, type: "advance", input: { mode: "nextMatch" } }, s);
  expect(r.pause).toBeDefined();
  return { s, pause: r.pause! };
}

describe("jogo do gamer minuto a minuto (RZ-170)", () => {
  it("não deixa notícias nem mensagens até ao apito final; depois regista tudo e o avanço continua", async () => {
    const { s, pause } = await untilMatch("sessao-1");
    const before = await handle({ id: 10, type: "inbox", input: {} }, s);
    const v0 = await handle({ id: 11, type: "startMatch", input: { match: pause.match } }, s);
    expect(v0.ongoing).toBe(true);
    expect(v0.minute).toBe(0);
    expect(v0.table.length).toBeGreaterThan(5);
    expect(Object.keys(v0.colours ?? {}).length).toBeGreaterThan(5);
    // a pausa continua, agora «em curso»
    const p2 = await handle({ id: 12, type: "advance", input: { mode: "day" } }, s);
    expect(p2.pause?.ongoing).toBe(true);
    const v45 = await handle({ id: 13, type: "matchStep", input: { minutes: 45 } }, s);
    expect(v45.minute).toBe(45);
    expect(v45.lines.every((l) => l.minute <= 45)).toBe(true);
    expect(v45.lines.some((l) => l.type === "end")).toBe(false);
    expect(v45.summary?.minute).toBe(45);
    // equipas: onze + banco de cada lado, com nota ao minuto; o que já aconteceu aparece nos indicadores
    for (const l of ["home", "away"] as const) {
      const eq = v45.teams![l];
      expect(eq.length).toBeGreaterThanOrEqual(18);
      const pitch = eq.filter((j) => j.state !== "bench" && j.cameOn === undefined);
      expect(pitch).toHaveLength(11);
      expect(pitch.every((j) => j.rating !== undefined && j.rating >= 3 && j.rating <= 10)).toBe(true);
      expect(eq.filter((j) => j.state === "bench").every((j) => j.rating === undefined)).toBe(true);
    }
    const goals45 = v45.teams!.home.concat(v45.teams!.away).reduce((t, j) => t + j.goals, 0);
    expect(goals45).toBe(v45.homeGoals + v45.awayGoals);
    expect(v0.teams!.home.every((j) => j.goals === 0 && j.cameOn === undefined)).toBe(true);
    const middle = await handle({ id: 14, type: "inbox", input: {} }, s);
    expect(middle.messages.length).toBe(before.messages.length);
    // o ao-vivo continua a ser devolvido enquanto decorre
    expect((await handle({ id: 15, type: "liveMatch", input: {} }, s))?.ongoing).toBe(true);
    const end = await handle({ id: 16, type: "matchStep", input: { minutes: 200 } }, s);
    expect(end.ongoing).toBeFalsy();
    expect(end.lines.at(-1)?.type).toBe("end");
    expect(end.summary?.finished).toBe(true);
    // no fim, quem foi substituído tem o minuto de saída e o suplente o de entrada
    const substitutions = end.lines.filter((l) => l.type === "substitution");
    const all = end.teams!.home.concat(end.teams!.away);
    for (const tr of substitutions) {
      expect(all.find((j) => j.id === tr.player)?.left).toBe(tr.minute);
      expect(all.find((j) => j.id === tr.inId)?.cameOn).toBe(tr.minute);
    }
    const after = await handle({ id: 17, type: "inbox", input: {} }, s);
    // só os resultados contra rivais vão para a caixa (RZ-174): aqui pode ou não haver mensagem do jogo
    expect(after.messages.length).toBeGreaterThanOrEqual(before.messages.length);
    expect((await handle({ id: 18, type: "liveMatch", input: { id: pause.match } }, s))?.ongoing).toBeFalsy();
    // o jogo de hoje já foi jogado: deixa de ser «o próximo» e o avanço continua
    const plan = await handle({ id: 20, type: "plan", input: null }, s);
    expect(plan?.nextMatch?.id).not.toBe(pause.match);
    const sec = await handle({ id: 19, type: "advance", input: { mode: "day" } }, s);
    expect(sec.pause).toBeUndefined();
  }, 120000);

  it("sem mudanças dá o mesmo jogo que a simulação de uma vez; mudar a tática só altera os minutos seguintes", async () => {
    const a = await untilMatch("sessao-3");
    await handle({ id: 20, type: "startMatch", input: { match: a.pause.match } }, a.s);
    await handle({ id: 21, type: "matchStep", input: { minutes: 30 } }, a.s);
    const base30 = await handle({ id: 22, type: "liveMatch", input: {} }, a.s);
    const tactic = { ...(base30!.tactic ?? DEFAULT_TACTIC), intensity: 5 as const, line: 5 as const, tempo: 5 as const, style: "direct" as const };
    const changed = await handle({ id: 23, type: "tacticInMatch", input: { tactic: tactic } }, a.s);
    expect(changed.tactic?.intensity).toBe(5);
    expect(changed.lines.filter((l) => l.minute <= 30)).toEqual(base30!.lines);
    const aEnd = await handle({ id: 24, type: "matchStep", input: { minutes: 200 } }, a.s);

    const b = await untilMatch("sessao-3");
    await handle({ id: 30, type: "startMatch", input: { match: b.pause.match } }, b.s);
    const bEnd = await handle({ id: 31, type: "matchStep", input: { minutes: 200 } }, b.s);
    // os primeiros 30 minutos são iguais com ou sem mudança
    expect(aEnd.lines.filter((l) => l.minute <= 30)).toEqual(bEnd.lines.filter((l) => l.minute <= 30));
    // depois dos 30 minutos o jogo é outro (tática ofensiva e intensa mexe nos remates)
    expect(aEnd.summary).not.toEqual(bEnd.summary);
  }, 120000);

  it("rejeita mudar de formação a meio do jogo", async () => {
    const { s, pause } = await untilMatch("sessao-3");
    const v = await handle({ id: 40, type: "startMatch", input: { match: pause.match } }, s);
    const other = v.tactic!.formation === "4-4-2" ? "4-3-3" : "4-4-2";
    await expect(handle({ id: 41, type: "tacticInMatch", input: { tactic: { ...v.tactic!, formation: other } } }, s)).rejects.toThrow(/formação/i);
  }, 60000);

  it("a página do jogo recebe a curva de xG até ao minuto atual, os confrontos e os dados do estádio", async () => {
    const a = await untilMatch("sessao-3");
    const start = await handle({ id: 40, type: "startMatch", input: { match: a.pause.match } }, a.s);
    expect(start.xg?.home).toEqual([0]);
    expect(start.meetings).toEqual([]);
    expect(start.info?.stadium.capacity).toBeGreaterThan(0);
    expect(start.info!.attendance).toBeGreaterThan(0);
    expect(start.info!.attendance).toBeLessThanOrEqual(start.info!.stadium.capacity);
    const middle = await handle({ id: 41, type: "matchStep", input: { minutes: 45 } }, a.s);
    expect(middle.xg!.home).toHaveLength(46);
    expect(middle.xg!.home.every((v, i, l) => i === 0 || v >= l[i - 1]!)).toBe(true);
    const end = await handle({ id: 42, type: "matchStep", input: { minutes: 200 } }, a.s);
    expect(end.xg!.home.at(-1)).toBeCloseTo(end.summary!.home.xg, 1);
    expect(end.xg!.away.at(-1)).toBeCloseTo(end.summary!.away.xg, 1);
    expect(end.info).toEqual(start.info);
    expect(start.info!.referee).toMatch(/\S+ \S+/);
    expect(start.info!.channels!.length).toBeGreaterThan(0);
  }, 120000);

  it("depois de jogar o jogo, um só «avançar até ao próximo jogo» chega ao jogo seguinte", async () => {
    const a = await untilMatch("sessao-4");
    await handle({ id: 50, type: "startMatch", input: { match: a.pause.match } }, a.s);
    await handle({ id: 51, type: "matchStep", input: { minutes: 200 } }, a.s);
    const r = await handle({ id: 53, type: "advance", input: { mode: "nextMatch" } }, a.s);
    expect(r.pause).toBeDefined();
    expect(r.pause!.match).not.toBe(a.pause.match);
    expect(r.pause!.date > a.pause.date).toBe(true);
  }, 120000);

  describe("substituições do gamer (RZ-215)", () => {
    async function aos(minutes: number, seed: string) {
      const a = await untilMatch(seed);
      const start = await handle({ id: 60, type: "startMatch", input: { match: a.pause.match } }, a.s);
      const j = minutes > 0 ? await handle({ id: 61, type: "matchStep", input: { minutes } }, a.s) : start;
      let n = 100;
      const swap = (substitutions: { playerOut: string; playerIn: string }[]) => handle({ id: n++, type: "substitutionsInMatch", input: { substitutions } }, a.s);
      const step = (m: number) => handle({ id: n++, type: "matchStep", input: { minutes: m } }, a.s);
      const pitch = (jg: typeof j) => jg.teams![jg.gamerSide!].filter((x) => x.state === "pitch" && x.position !== "GK");
      const bench = (jg: typeof j) => jg.teams![jg.gamerSide!].filter((x) => x.state === "bench" && x.position !== "GK");
      return { j, swap, step, pitch, bench };
    }

    it("várias trocas de uma vez gastam uma pausa; o limite é 5 substituições e 3 pausas", async () => {
      const { j, swap, pitch, bench } = await aos(30, "subs-1");
      expect(j.subs).toMatchObject({ used: 0, max: 5, usedPauses: 0, pausesMax: 3 });
      const c = pitch(j);
      const b = bench(j);
      const j2 = await swap([{ playerOut: c[0]!.id, playerIn: b[0]!.id }, { playerOut: c[1]!.id, playerIn: b[1]!.id }, { playerOut: c[2]!.id, playerIn: b[2]!.id }]);
      expect(j2.subs).toMatchObject({ used: 3, usedPauses: 1 });
      expect(j2.lines.filter((l) => l.type === "substitution" && l.minute === 30)).toHaveLength(3);
      const em = j2.teams![j2.gamerSide!];
      expect(em.find((x) => x.id === b[0]!.id)).toMatchObject({ state: "pitch", cameOn: 30, position: c[0]!.position });
      expect(em.find((x) => x.id === c[0]!.id)).toMatchObject({ state: "left", left: 30 });
      const c2 = pitch(j2).filter((x) => !x.cameOn);
      const b2 = bench(j2);
      const j3 = await swap([{ playerOut: c2[0]!.id, playerIn: b2[0]!.id }, { playerOut: c2[1]!.id, playerIn: b2[1]!.id }]);
      expect(j3.subs).toMatchObject({ used: 5, usedPauses: 2 });
      await expect(swap([{ playerOut: pitch(j3)[0]!.id, playerIn: bench(j3)[0]?.id ?? "x" }])).rejects.toThrow(/substituições/);
    }, 120000);

    it("sem pausas não há substituições; ao intervalo não se gastam pausas", async () => {
      const { j, swap, step, pitch, bench } = await aos(20, "subs-2");
      let current = j;
      for (let k = 0; k < 3; k++) {
        current = await swap([{ playerOut: pitch(current).filter((x) => !x.cameOn)[0]!.id, playerIn: bench(current)[0]!.id }]);
        current = await step(2);
        if (current.minute! >= 45) break;
      }
      expect(current.subs!.usedPauses).toBe(3);
      await expect(swap([{ playerOut: pitch(current).filter((x) => !x.cameOn)[0]!.id, playerIn: bench(current)[0]!.id }])).rejects.toThrow(/pausas/);
      const middle = await step(45 - current.minute!);
      expect(middle.minute).toBe(45);
      const free = await swap([{ playerOut: pitch(middle).filter((x) => !x.cameOn)[0]!.id, playerIn: bench(middle)[0]!.id }]);
      expect(free.subs!.usedPauses).toBe(3);
      expect(free.subs!.used).toBe(4);
    }, 120000);

    it("rejeita jogadores que não estão em campo ou no banco; o jogo guardado inclui as trocas", async () => {
      const { j, swap, step, pitch, bench } = await aos(10, "subs-3");
      const c = pitch(j)[0]!;
      const b = bench(j)[0]!;
      await expect(swap([{ playerOut: b.id, playerIn: c.id }])).rejects.toThrow();
      await expect(swap([])).rejects.toThrow();
      const done = await swap([{ playerOut: c.id, playerIn: b.id }]);
      expect(done.subs!.used).toBe(1);
      const end = await step(200);
      const cameOn = end.teams![end.gamerSide!].find((x) => x.id === b.id)!;
      expect(cameOn.cameOn).toBe(10);
      expect(cameOn.rating).toBeDefined();
      expect(end.lines.filter((l) => l.type === "substitution" && l.minute === 10).length).toBe(1);
    }, 120000);
  });
});
