import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS as P } from "../config/parameters";
import { acceptFloor, clauseFactor, expiringPlayers, negotiateRenewal, renewalAsk, renewalInterest, renewalSuggestions, setDecision } from "./renewals";
import { data, fresh, run } from "./testWorld.testlib";

const club = data.clubs.find((c) => c.tier === "thirdLeague")!;

describe("renovações do clube do gamer", () => {
  const repo = fresh("renewals");
  const squad = repo.clubPlayers(club.id).map((j) => j.person);
  const loyal = [...squad].sort((a, b) => (repo.person(b)?.personality.loyalty ?? 0) - (repo.person(a)?.personality.loyalty ?? 0));

  it("o pedido nunca fica abaixo de 95 % do ordenado atual e a duração vem dos parâmetros", () => {
    for (const p of squad.slice(0, 10)) {
      const ask = renewalAsk(repo, data, P, club, p)!;
      expect(ask.wage).toBeGreaterThanOrEqual(Math.floor((repo.contract(p)!.monthlyWage * 0.95) / 10) * 10);
      expect(ask.years).toBe(P.squadCycle.contracts.negotiation.askYears);
    }
  });
  it("o patamar baixa com a lealdade e fica entre o mínimo e 1", () => {
    const hi = acceptFloor(repo, P, club, loyal[0]!);
    const lo = acceptFloor(repo, P, club, loyal[loyal.length - 1]!);
    expect(hi).toBeLessThanOrEqual(lo);
    for (const f of [hi, lo]) {
      expect(f).toBeGreaterThanOrEqual(P.squadCycle.contracts.negotiation.floorMin);
      expect(f).toBeLessThanOrEqual(1);
    }
  });
  const terms = (w: number, y: number, r: number | null) => ({ wage: w, years: y, release: r });
  const open = squad.find((p) => renewalInterest(repo, data, P, club, p).interested && acceptFloor(repo, P, club, p) >= 0.85)!;
  it("aceita ao pedido; abaixo do patamar contrapropõe e, ao igualar a contraproposta, aceita", () => {
    const r = fresh("renewals");
    const ask = renewalAsk(r, data, P, club, open)!;
    const first = negotiateRenewal(r, data, P, club, 1, open, terms(Math.floor(ask.wage * 0.7), 2, ask.release))!;
    expect(first.status).toBe("counter");
    if (first.status !== "counter") return;
    expect(first.terms.wage).toBeGreaterThan(Math.floor(ask.wage * 0.7));
    expect(first.round).toBe(1);
    expect(negotiateRenewal(r, data, P, club, 1, open, first.terms)!.status).toBe("accepted");
    const c = fresh("renewals");
    expect(negotiateRenewal(c, data, P, club, 1, open, terms(renewalAsk(c, data, P, club, open)!.wage, 2, renewalAsk(c, data, P, club, open)!.release))!.status).toBe("accepted");
  });
  it("uma oferta demasiado baixa fecha a negociação e ela não reabre", () => {
    const r = fresh("renewals");
    expect(negotiateRenewal(r, data, P, club, 1, open, terms(50, 2, null))).toEqual({ status: "closed", reason: "refused" });
    expect(negotiateRenewal(r, data, P, club, 1, open, terms(999999, 2, null))).toEqual({ status: "closed", reason: "refused" });
  });
  it("depois de o agente desistir só volta a falar passado um mês", () => {
    const r = fresh("renewals");
    r.setMeta("date.today", "2026-10-01");
    const closed = negotiateRenewal(r, data, P, club, 1, open, terms(50, 2, null));
    expect(closed).toEqual({ status: "closed", reason: "refused", reopens: "2026-10-31" });
    r.setMeta("date.today", "2026-10-30");
    expect(negotiateRenewal(r, data, P, club, 1, open, terms(999999, 2, null))).toMatchObject({ status: "closed", reopens: "2026-10-31" });
    r.setMeta("date.today", "2026-10-31");
    expect(negotiateRenewal(r, data, P, club, 1, open, terms(999999, 2, null))!.status).toBe("accepted");
  });
  it("as sugestões são crescentes e cobrem valores à volta do ordenado", () => {
    const ask = renewalAsk(repo, data, P, club, open)!;
    const sug = renewalSuggestions(ask, repo.contract(open)!.monthlyWage);
    expect(sug.wages.length).toBeGreaterThanOrEqual(4);
    expect([...sug.wages].sort((a, b) => a - b)).toEqual(sug.wages);
    expect(sug.releases.length).toBeGreaterThan(0);
  });
  it("a cláusula pesa no ordenado e o agente corta uma acima do teto", () => {
    const r = fresh("renewals");
    const ask = renewalAsk(r, data, P, club, open)!;
    expect(clauseFactor(P, null, ask.release!)).toBeGreaterThan(clauseFactor(P, ask.release!, ask.release!));
    expect(clauseFactor(P, ask.release! / 2, ask.release!)).toBeLessThan(1);
    const reply = negotiateRenewal(r, data, P, club, 1, open, terms(ask.wage * 2, 2, ask.releaseCeiling * 3))!;
    expect(reply.status).toBe("counter");
    if (reply.status === "counter") expect(reply.terms.release).toBe(ask.releaseCeiling);
  });
  it("com os parâmetros certos, um craque ambicioso não quer o clube e quem vem de longe exige ordenado mínimo", () => {
    const n = P.squadCycle.contracts.negotiation;
    const withN = (patch: Partial<typeof n>) => ({ ...P, squadCycle: { ...P.squadCycle, contracts: { ...P.squadCycle.contracts, negotiation: { ...n, ...patch } } } });
    const lvl = withN({ level: { margin: -100, ambitionMin: 0, loyaltyStay: 99 } });
    const outsider = squad.find((p) => repo.person(p)?.birthCity !== club.city)!;
    expect(renewalInterest(repo, data, lvl, club, outsider)).toEqual({ interested: false, reason: "level" });
    const dist = withN({ distance: { tiers: [club.tier], wageFactor: 1.5, loyaltyStay: 99 } });
    const res = renewalInterest(repo, data, dist, club, outsider);
    const from = data.cities.find((c) => c.id === repo.person(outsider)?.birthCity)?.district;
    expect(res.interested).toBe(true);
    expect("minWage" in res).toBe(from !== club.district);
  });
  it("a decisão do gamer manda na passagem de época: renova com as condições dadas ou deixa sair", () => {
    const r = fresh("renewals-roll");
    const seasonStart = "2027-07-01";
    const ps = r.clubPlayers(club.id).map((j) => j.person).slice(0, 2);
    for (const p of ps) r.saveContract({ ...r.contract(p)!, end: "2027-06-30" });
    expect(expiringPlayers(r, club.id, seasonStart)).toEqual(expect.arrayContaining(ps));
    setDecision(r, 1, ps[0]!, { kind: "renew", wage: 4321, years: 3, release: null });
    setDecision(r, 1, ps[1]!, { kind: "release" });
    run(r, 1, club.id);
    expect(r.contract(ps[0]!)?.club).toBe(club.id);
    expect(r.contract(ps[0]!)?.monthlyWage).toBe(4321);
    expect(r.player(ps[1]!)?.club ?? null).not.toBe(club.id);
  }, 60000);
});
