import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS as BASE } from "../config/parameters";
import { loanOf } from "../loans/loans";
import { data, fresh } from "../squad/testWorld.testlib";
import { loanTermsOf, proposeLoan } from "./loanBids";
import { dailyOffers, offers, respondOffer } from "./offers";

const club = data.clubs.find((c) => c.tier === "firstLeague")!;
const DAY = "2027-01-05";

const setup = (seed: string) => {
  const repo = fresh(seed);
  repo.setMeta("gamer.club", club.id);
  repo.setMeta("date.today", DAY);
  repo.setMeta("balance." + club.id, "50000000");
  for (const c of data.clubs) {
    if (c.id !== club.id) repo.setMeta("balance." + c.id, "500000000");
    // os contratos do mundo de teste acabam em junho: alongam-se para caberem empréstimos
    for (const j of repo.clubPlayers(c.id)) { const ct = repo.contract(j.person); if (ct) repo.saveContract({ ...ct, end: "2029-06-30" }); }
  }
  return repo;
};
/** Jogadores de outros clubes que o clube dono aceita emprestar. */
const lendableIds = (repo: ReturnType<typeof setup>) => {
  const out: string[] = [];
  for (const c of data.clubs.filter((x) => x.id !== club.id && x.tier === "firstLeague")) {
    for (const j of repo.clubPlayers(c.id)) if (typeof loanTermsOf(repo, data, BASE, club, DAY, j.person) === "object") out.push(j.person);
  }
  return out;
};

describe("empréstimos pedidos pelo gamer", { timeout: 120000 }, () => {
  it("só com a janela aberta; titulares não se emprestam; abaixo do mínimo o clube contrapropõe", () => {
    const repo = setup("loanbid-a");
    const any = lendableIds(repo);
    expect(any.length).toBeGreaterThan(0);
    expect(proposeLoan(repo, data, BASE, club, "2026-10-20", 1, any[0]!, 0.5)).toEqual({ status: "closed", reason: "window" });
    expect(proposeLoan(repo, data, BASE, club, DAY, 1, any[0]!, 0.2)).toEqual({ status: "counter", share: BASE.market.loans.wageShares[0] });
    // o melhor jogador de cada posição é indispensável
    const other = data.clubs.find((c) => c.id !== club.id && c.tier === "firstLeague")!;
    const best = repo.clubPlayers(other.id).filter((j) => j.positions[0]?.pos === "GK").map((j) => j.person);
    const keys = best.filter((id) => loanTermsOf(repo, data, BASE, club, DAY, id) === "key");
    expect(keys.length).toBeGreaterThan(0);
    expect(proposeLoan(repo, data, BASE, club, DAY, 1, keys[0]!, 1)).toEqual({ status: "closed", reason: "key" });
  });

  it("aceitar põe o jogador no clube do gamer, com o contrato no dono e a parte do ordenado paga", () => {
    const repo = setup("loanbid-b");
    let done: string | undefined;
    for (const id of lendableIds(repo).slice(0, 60)) {
      const r = proposeLoan(repo, data, BASE, club, DAY, 1, id, 0.75);
      if (r.status === "accepted") { done = id; break; }
    }
    expect(done).toBeDefined();
    const loan = loanOf(repo, done!)!;
    expect(loan.to).toBe(club.id);
    expect(loan.wageShare).toBe(0.75);
    expect(repo.player(done!)!.club).toBe(club.id);
    expect(repo.contract(done!)!.club).toBe(loan.from);
    expect(loan.end >= "2027-06-30").toBe(true);
    // já emprestado: não se volta a pedir
    expect(proposeLoan(repo, data, BASE, club, DAY, 1, done!, 0.75)).toEqual({ status: "closed", reason: "club" });
  });
});

describe("pedidos de empréstimo por jogadores do gamer", { timeout: 120000 }, () => {
  const P = { ...BASE, market: { ...BASE.market, offers: { ...BASE.market.offers, dailyChance: 0 }, loans: { ...BASE.market.loans, offerChance: 1 } } };
  it("chegam por jogadores que não jogam; aceitar empresta-o e a decisão não se regateia", () => {
    const repo = setup("loanoffer-a");
    const made = dailyOffers(repo, data, P, club, DAY, 1).filter((o) => o.kind === "loan");
    expect(made.length).toBeGreaterThan(0);
    expect(made.every((o) => o.status === "pending" && (o.wageShare ?? 0) > 0 && o.fee >= 0)).toBe(true);
    let done: string | undefined;
    for (const o of made) {
      const r = respondOffer(repo, data, P, club, DAY, 1, o.id, { kind: "counter", fee: o.fee * 3 }); // regatear = aceitar o que está em cima da mesa
      if (r?.status === "done") { done = o.person; break; }
    }
    if (!done) return; // todos os jogadores podem recusar
    const loan = loanOf(repo, done)!;
    expect(loan.from).toBe(club.id);
    expect(repo.contract(done)!.club).toBe(club.id);
    expect(repo.player(done)!.club).not.toBe(club.id);
    expect(offers(repo).filter((o) => o.person === done && o.status === "pending")).toEqual([]);
  });
});
