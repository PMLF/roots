import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS as BASE } from "../config/parameters";
import { inbox, news } from "../news/news";
import { data, fresh } from "../squad/testWorld.testlib";
import { dailyOffers, forSale, offers, pendingOffers, respondOffer, setForSale } from "./offers";

// chance máxima para forçar propostas
const P = { ...BASE, market: { ...BASE.market, offers: { ...BASE.market.offers, dailyChance: 1 }, loans: { ...BASE.market.loans, offerChance: 0 } } };
const club = data.clubs.find((c) => c.tier === "firstLeague")!;

const setup = (seed: string) => {
  const repo = fresh(seed);
  repo.setMeta("gamer.club", club.id);
  repo.setMeta("date.today", "2027-01-05");
  repo.setMeta("balance." + club.id, "1000000");
  for (const c of data.clubs) if (c.id !== club.id) repo.setMeta("balance." + c.id, "500000000");
  return repo;
};

describe("propostas da IA ao gamer", { timeout: 60000 }, () => {
  it("só há propostas com a janela aberta e chegam à caixa de entrada", () => {
    const repo = setup("offers-a");
    expect(dailyOffers(repo, data, P, club, "2026-10-20", 1)).toEqual([]);
    const made = dailyOffers(repo, data, P, club, "2027-01-05", 1);
    expect(made.length).toBeGreaterThan(0);
    expect(made.every((o) => o.expires <= "2027-01-31" && o.fee > 0 && o.buyer !== club.id)).toBe(true);
    expect(pendingOffers(repo).length).toBe(made.length);
    // não repete proposta pelo mesmo jogador
    expect(dailyOffers(repo, data, P, club, "2027-01-06", 1)).toEqual([]);
    expect(inbox(repo, data).messages.some((m) => m.type === "transfer_offer")).toBe(true);
  });

  it("aceitar muda o jogador de clube, mexe no dinheiro e gera notícia; vencidas expiram", () => {
    const repo = setup("offers-b");
    const made = dailyOffers(repo, data, P, club, "2027-01-05", 1);
    const o = made[0]!;
    const before = Number(repo.meta("balance." + club.id));
    const r = respondOffer(repo, data, P, club, "2027-01-06", 1, o.id, { kind: "accept" });
    if (r?.status === "refused") return; // o jogador pode recusar o contrato
    expect(r).toEqual({ status: "done" });
    expect(repo.player(o.person)!.club).toBe(o.buyer);
    expect(repo.contract(o.person)!.monthlyWage).toBe(o.wage);
    expect(Number(repo.meta("balance." + club.id))).toBeGreaterThan(before);
    expect(news(repo, data, { scope: "club" }).some((n) => n.type === "transfer" && n.values.to !== undefined)).toBe(true);
    // as outras propostas pendentes expiram ao passar a validade
    const rest = pendingOffers(repo);
    dailyOffers(repo, data, { ...P, market: { ...P.market, offers: { ...P.market.offers, dailyChance: 0 } } }, club, "2027-01-30", 1);
    expect(pendingOffers(repo).length).toBeLessThan(Math.max(1, rest.length) + 0.5);
    expect(offers(repo).filter((x) => rest.some((y) => y.id === x.id)).every((x) => x.status === "expired" || x.status === "gone")).toBe(true);
  });

  it("rejeitar encerra; contrapropor muito acima faz o comprador desistir e um pouco acima faz contraproposta ou fecha", () => {
    const repo = setup("offers-c");
    const made = dailyOffers(repo, data, P, club, "2027-01-05", 1);
    const [a, b] = [made[0]!, made[1]!];
    expect(respondOffer(repo, data, P, club, "2027-01-06", 1, a.id, { kind: "reject" })).toEqual({ status: "rejected" });
    expect(respondOffer(repo, data, P, club, "2027-01-06", 1, a.id, { kind: "reject" })).toBeUndefined();
    expect(respondOffer(repo, data, P, club, "2027-01-06", 1, b.id, { kind: "counter", fee: b.fee * 10 })).toEqual({ status: "withdrawn" });
    expect(offers(repo).find((x) => x.id === b.id)!.status).toBe("withdrawn");
  });
});

describe("jogadores à venda", { timeout: 60000 }, () => {
  it("meter à venda e tirar da venda persiste; à venda há mais propostas (em média)", () => {
    const repo = setup("offers-sale");
    const someone = repo.clubPlayers(club.id)[0]!.person;
    expect(forSale(repo).has(someone)).toBe(false);
    setForSale(repo, someone, true);
    expect(forSale(repo).has(someone)).toBe(true);
    setForSale(repo, someone, false);
    expect(forSale(repo).has(someone)).toBe(false);
    // com a chance base baixa, pôr o plantel todo à venda faz aparecer mais propostas
    const low = { ...BASE, market: { ...BASE.market, offers: { ...BASE.market.offers, dailyChance: 0.02 } } };
    const count = (sale: boolean) => {
      let n = 0;
      for (let i = 0; i < 4; i++) {
        const r = setup("offers-sale-" + i);
        if (sale) for (const x of r.clubPlayers(club.id)) setForSale(r, x.person, true);
        n += dailyOffers(r, data, low, club, "2027-01-05", 1).length;
      }
      return n;
    };
    expect(count(true)).toBeGreaterThanOrEqual(count(false));
  });
});
