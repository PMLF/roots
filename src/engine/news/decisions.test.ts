import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS as P } from "../config/parameters";
import { updateOffers } from "../season/coachMarket";
import { data, fresh } from "../squad/testWorld.testlib";
import { decisionStates } from "./decisions";
import { inbox } from "./news";

const club = data.clubs.find((c) => c.tier === "thirdLeague")!;
const d0 = "2027-08-02" as never;

describe("estado das mensagens que pedem decisão (RZ-164)", { timeout: 120000 }, () => {
  it("uma proposta de mecenato passa de pendente a respondida ou expirada", () => {
    const repo = fresh("dec-a");
    repo.setMeta("gamer.club", club.id);
    const offer = (id: number, status: string) => ({ id, company: "co1", club: club.id, amount: 5000, counterpart: "none", years: 0, created: d0, expires: "2027-08-20", status });
    repo.setMeta("patron.offers", JSON.stringify([offer(1, "pending"), offer(2, "accepted"), offer(3, "declined"), offer(4, "expired")]));
    const ids = [1, 2, 3, 4].map((n) => repo.appendEvent({ type: "PATRON_OFFER", date: d0, season: 1, visibility: "exposed", origin: "generated", entities: [{ k: "club", id: club.id }], data: { offer: n } }));
    const s = decisionStates(repo);
    expect(s[ids[0]!]).toMatchObject({ kind: "patron", state: "pending", until: "2027-08-20" });
    expect(s[ids[1]!]).toMatchObject({ state: "answered", answer: "accepted" });
    expect(s[ids[2]!]).toMatchObject({ state: "answered", answer: "declined" });
    expect(s[ids[3]!]).toMatchObject({ state: "expired" });
  });

  it("ofertas de clubes chegam à caixa de quem está sem clube e ficam respondidas ao aceitar uma", () => {
    const repo = fresh("dec-b");
    repo.setMeta("gamer.club", "");
    repo.setMeta("gamer.previous", club.id);
    const offers = updateOffers(repo, data, P, d0);
    expect(offers.length).toBeGreaterThan(0);
    const messages = inbox(repo, data, { limit: 50 }).messages.filter((m) => m.type === "club_offer");
    expect(messages.length).toBe(offers.length);
    const all = Object.values(decisionStates(repo));
    expect(all.filter((x) => x.kind === "clubOffer" && x.state === "pending").length).toBe(offers.length);
    // aceita a primeira: as outras expiram
    repo.setMeta("gamer.club", offers[0]!.club);
    repo.setMeta("gamer.offers", "");
    const after = Object.values(decisionStates(repo)).filter((x) => x.kind === "clubOffer");
    expect(after.filter((x) => x.state === "answered").length).toBe(1);
    expect(after.filter((x) => x.state === "expired").length).toBe(offers.length - 1);
  });
});
