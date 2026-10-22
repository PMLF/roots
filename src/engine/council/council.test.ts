import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS as P, COUNCIL_AREAS, validateParameters } from "../config/parameters";
import { data, fresh } from "../squad/testWorld.testlib";
import { agendaOf, mayorOf, priorityLevel } from "./agenda";
import { adjustRelation, relationOf } from "./relation";
import { dailyCouncil, kindStatus, makeRequest, requestsOf, councilMatchdayBoost } from "./requests";
import { cityStateNow } from "../city/cities";

const club = data.clubs.find((c) => mayorOf(fresh("probe"), data, c.city))!;

describe("Câmara (RZ-236)", { timeout: 120000 }, () => {
  it("parâmetros válidos", () => expect(validateParameters(P)).toEqual([]));

  it("a agenda soma 1 e os níveis ficam entre 1 e 5", () => {
    const repo = fresh("council-a");
    const mayor = mayorOf(repo, data, club.city)!;
    const a = agendaOf("council-a", mayor, cityStateNow(repo, data, P, club.city), P);
    expect(COUNCIL_AREAS.reduce((s, k) => s + a.share[k], 0)).toBeCloseTo(1);
    for (const k of COUNCIL_AREAS) { const l = priorityLevel(a.ratio[k], P); expect(l).toBeGreaterThanOrEqual(1); expect(l).toBeLessThanOrEqual(5); }
  });

  it("a relação sobe com aprovações e desce com recusas", () => {
    const repo = fresh("council-b");
    const m = mayorOf(repo, data, club.city)!.person;
    const start = relationOf(repo, P, m).value;
    adjustRelation(repo, P, m, 10, "approved");
    expect(relationOf(repo, P, m).value).toBeGreaterThan(start);
    adjustRelation(repo, P, m, -30, "refused");
    expect(relationOf(repo, P, m).value).toBeLessThan(start);
  });

  it("pedido: abre, não duplica, é decidido no prazo e deixa evento", () => {
    const repo = fresh("council-c");
    const r = makeRequest(repo, data, P, club, "2027-08-01", 1, "matchday", 0);
    expect(r.ok).toBe(true);
    const again = makeRequest(repo, data, P, club, "2027-08-02", 1, "matchday", 0);
    expect(again).toEqual({ ok: false, reason: "open" });
    // um pedido em aberto traz sempre a data limite (a página da Câmara formata-a)
    expect(kindStatus(repo, P, club, "matchday", "2027-08-02")).toEqual({ status: "open", until: requestsOf(repo)[0]!.due });
    for (let d = 2; d <= 25; d++) dailyCouncil(repo, data, P, club, `2027-08-${String(d).padStart(2, "0")}` as never, 1);
    const done = requestsOf(repo)[0]!;
    expect(done.status).not.toBe("pending");
    expect(repo.eventsOf({ k: "club", id: club.id }).filter((e) => e.type === "COUNCIL_REPLY").length).toBe(1);
    if (done.status === "approved") expect(councilMatchdayBoost(repo, P, club.id, 1)).toBeGreaterThan(0);
  });

  it("tipo inválido é recusado", () => {
    expect(makeRequest(fresh("council-d"), data, P, club, "2027-08-01", 1, "nope" as never, 0)).toEqual({ ok: false, reason: "invalid" });
  });
});
