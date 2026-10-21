/**
 * Realismo do mercado (RZ-266): quem muda de clube, de que escalão para que escalão, se os clubes procuram gente da terra e se vendem
 * os excedentes. Mede numa época inteira de janelas (verão + inverno) em três saves.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS as P } from "../config/parameters";
import { importData } from "../data/importData";
import { MemoryRepository } from "../persistence/repositoryMemory";
import { generateWorld } from "../world/generateWorld";
import { importCountries } from "../world/countries";
import { ensureBudgets } from "../club/budget";
import { addDays } from "../calendar/dates";
import { isMarketDay, marketRound } from "./market";
import { Rng } from "../random/rng";
import { assignAgents } from "../agent/assign";

const read = (f: string) => readFileSync(`data/${f}`, "utf8");
const d = importData({ clubs: read("clubs.csv"), cities: read("cities.csv"), localities: read("localities.csv"), rivalries: read("rivalries.csv"), districts: read("districts.csv") });
const pr = importCountries(read("countries.csv"));
if (!d.ok || !pr.ok) throw new Error("invalid data");
const data = d.data;
const TIERS = ["firstLeague", "secondLeague", "thirdLeague", "cp", "district"];
const tierOf = (id: string) => TIERS.indexOf(data.clubs.find((c) => c.id === id)?.tier ?? "district");

describe("realismo do mercado", { timeout: 900000 }, () => {
  it("as transferências respeitam escalões e terra", () => {
    const rows: { n: number; up2: number; up1: number; same: number; down: number; local: number; summerPerClub: number; winterPerClub: number; summerTwoPlus: number }[] = [];
    for (const seed of ["rm-1", "rm-2", "rm-3"]) {
      const repo = new MemoryRepository();
      repo.setMeta("seed", seed);
      repo.saveWorld(generateWorld({ seed, data, countries: pr.countries, params: P }));
      assignAgents(repo, new Rng(seed, "agents"), P, (club) => data.clubs.find((c) => c.id === club)?.tier);
      ensureBudgets(repo, data, P, 1);
      for (const [from, to] of [["2026-07-01", "2026-09-01"], ["2027-01-01", "2027-02-01"]] as const)
        for (let day = from as string; day <= to; day = addDays(day, 1)) if (isMarketDay(day as never, P)) marketRound(repo, data, P, day as never, 1, {});
      const moves = data.clubs.flatMap((c) => repo.eventsOf({ k: "club", id: c.id }, { type: "TRANSFER" })).filter((e) => e.entities.find((x) => x.roleKind === "buyer")?.id === undefined ? false : true);
      const seen = new Set<string>();
      let up2 = 0, up1 = 0, same = 0, down = 0, local = 0, n = 0;
      for (const e of moves) {
        if (seen.has(String(e.id))) continue; seen.add(String(e.id));
        const buyer = e.entities.find((x) => x.roleKind === "buyer")!.id;
        const seller = e.entities.find((x) => x.roleKind === "seller")!.id;
        const diff = tierOf(seller) - tierOf(buyer); // >0 = o jogador sobe de escalão; <0 = desce (um clube de baixo a buscar um destaque de cima)
        n++;
        if (diff >= 2) up2++; else if (diff === 1) up1++; else if (diff === 0) same++; else down++;
        const person = e.entities.find((x) => x.roleKind === "player")!.id;
        if (repo.person(person)?.birthCity === data.clubs.find((c) => c.id === buyer)?.city) local++;
      }
      // volume: contratações (compras e livres) por clube em cada janela
      const incoming = (win: string, club: string) => repo.eventsOf({ k: "club", id: club }, {}).filter((e) => (e.data as { window?: string }).window === win && ((e.type === "TRANSFER" && e.entities.some((x) => x.roleKind === "buyer" && x.id === club)) || (e.type === "PLAYER_SIGNED" && e.entities.some((x) => x.k === "club" && x.id === club && x.roleKind === undefined)))).length;
      const market = data.clubs.filter((c) => !c.league.startsWith("Distrital") || true);
      const summer = market.map((c) => incoming("2026-w0", c.id));
      const winter = market.map((c) => incoming("2027-w1", c.id));
      const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
      rows.push({ n, up2, up1, same, down, local, summerPerClub: +mean(summer).toFixed(2), winterPerClub: +mean(winter).toFixed(2), summerTwoPlus: +(summer.filter((x) => x >= 2).length / Math.max(1, summer.length)).toFixed(2) });
    }
    process.stdout.write(`REALISMO ${JSON.stringify(rows)}\n`);
    for (const r of rows) {
      expect(r.n).toBeGreaterThan(15);
      expect(r.up2 / r.n).toBeLessThan(0.2); // subir dois escalões ou mais é raro
      expect(r.down / r.n).toBeLessThan(0.25); // quem desce é sobretudo excedente de clubes de cima
      expect(r.local).toBeGreaterThanOrEqual(0);
      expect(r.summerPerClub).toBeGreaterThan(2.5); // cada clube costuma mudar vários jogadores no verão
      expect(r.winterPerClub).toBeGreaterThan(0.8);
      expect(r.summerTwoPlus).toBeGreaterThan(0.7);
    }
  });
});
