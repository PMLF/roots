import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS as P } from "../config/parameters";
import { importData } from "../data/importData";
import { MemoryRepository } from "../persistence/repositoryMemory";
import { generateWorld } from "../world/generateWorld";
import { importCountries } from "../world/countries";
import { monthlyWageBill } from "../club/finances";
import { openBid } from "../market/bids";
import { activeLoans, endDueLoans, endLoan, loanEnd, loanOf, startLoan, wageSplit, type Loan } from "./loans";

const read = (f: string) => readFileSync(`data/${f}`, "utf8");
const d = importData({ clubs: read("clubs.csv"), cities: read("cities.csv"), localities: read("localities.csv"), rivalries: read("rivalries.csv"), districts: read("districts.csv") });
const pr = importCountries(read("countries.csv"));
if (!d.ok || !pr.ok) throw new Error("invalid data");
const data = d.data;

describe("empréstimos (RZ-268)", { timeout: 120000 }, () => {
  it("acabam sempre a 30 de junho", () => {
    expect(loanEnd("2026-08-20")).toBe("2027-06-30");
    expect(loanEnd("2027-01-10")).toBe("2027-06-30");
    expect(loanEnd("2027-06-30")).toBe("2027-06-30");
  });

  it("o ordenado divide-se entre o clube que recebe e o dono", () => {
    const loan = { wageShare: 0.75 } as Loan;
    expect(wageSplit(loan, 1000)).toEqual({ borrower: 750, owner: 250 });
  });

  const repo = new MemoryRepository();
  repo.setMeta("seed", "loans");
  repo.saveWorld(generateWorld({ seed: "loans", data, countries: pr.countries, params: P }));
  const [owner, host] = data.clubs.filter((c) => c.tier === "firstLeague");
  const player = repo.clubPlayers(owner!.id).find((j) => j.state === "active")!.person;
  const wage = repo.contract(player)!.monthlyWage;
  const billOwner = monthlyWageBill(repo, owner!.id);
  const billHost = monthlyWageBill(repo, host!.id);
  const loan: Loan = { person: player, from: owner!.id, to: host!.id, start: "2026-08-01", end: "2027-06-30", season: 1, wageShare: 0.5, fee: 0 };

  it("o jogador joga no clube que recebe, o contrato fica com o dono e os custos repartem-se", () => {
    startLoan(repo, loan, "2026-08-01");
    expect(repo.player(player)!.club).toBe(host!.id);
    expect(repo.contract(player)!.club).toBe(owner!.id);
    expect(loanOf(repo, player)).toMatchObject({ from: owner!.id, to: host!.id });
    const half = wageSplit(loan, wage);
    expect(monthlyWageBill(repo, owner!.id)).toBe(billOwner - wage + half.owner);
    expect(monthlyWageBill(repo, host!.id)).toBe(billHost + half.borrower);
    expect(repo.eventsOf({ k: "person", id: player }, { type: "LOAN_STARTED" })).toHaveLength(1);
  });

  it("não se pode fazer proposta por quem está emprestado", () => {
    const other = data.clubs.find((c) => c.id !== owner!.id && c.id !== host!.id)!;
    expect(openBid(repo, data, P, other, "2026-09-01", player)).toEqual({ ok: false, reason: "loaned" });
  });

  it("chamado de volta (ou no fim da época) regressa ao dono e os custos voltam ao que eram", () => {
    expect(endDueLoans(repo, "2027-01-15", 1)).toHaveLength(0); // ainda não acabou
    endLoan(repo, player, "2027-01-15", 1, "recalled");
    expect(repo.player(player)!.club).toBe(owner!.id);
    expect(activeLoans(repo)).toHaveLength(0);
    expect(monthlyWageBill(repo, owner!.id)).toBe(billOwner);
    expect(monthlyWageBill(repo, host!.id)).toBe(billHost);
    expect(repo.eventsOf({ k: "person", id: player }, { type: "LOAN_ENDED" })[0]!.data).toMatchObject({ reason: "recalled" });
  });

  it("passada a data de fim, o empréstimo acaba sozinho", () => {
    startLoan(repo, loan, "2027-02-01");
    expect(endDueLoans(repo, "2027-07-01", 1)).toHaveLength(1);
    expect(repo.player(player)!.club).toBe(owner!.id);
  });
});
