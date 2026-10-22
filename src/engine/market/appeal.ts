/**
 * Atração de clubes e cidades e decisão do jogador (RZ-266). Um jogador só muda de clube se o conjunto «clube + cidade» do que o
 * quer contratar o convencer, comparado com o de onde joga, e se o dinheiro, o lugar no onze e a terra (ser dele, ou deixá-la) ajudarem.
 * O clube pode aceitar a proposta e o jogador recusar: a palavra final é dele.
 * Tudo determinístico (sem sorteio): quem decide sorteia com a probabilidade devolvida. Pesos em `params.market.decision`.
 */
import { clamp } from "../random/rng";
import type { Params } from "../config/parameters";
import type { BaseClub, BaseData } from "../data/types";
import { cityStateNow } from "../city/cities";
import type { Repository } from "../persistence/repository";

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

export type Decision = {
  /** Probabilidade de aceitar. */
  p: number;
  /** Diferença de atração (clube + cidade) entre o clube que propõe e o atual, em −1..1. */
  delta: number;
};

export type DecisionInput = {
  person: string;
  /** Clube atual (`undefined` = livre). */
  from?: BaseClub;
  to: BaseClub;
  /** Ordenado mensal atual e o proposto. */
  currentWage: number;
  newWage: number;
  /** O jogador teria lugar no onze do clube que propõe? */
  starter: boolean;
};

export type LoanInput = { person: string; from: BaseClub; to: BaseClub; /** Teria lugar no onze do clube que recebe? */ starter: boolean; /** Está no banco (ou fora dele) no clube dono? */ benchwarmer: boolean };

export type Appeal = {
  club: (club: BaseClub) => number;
  city: (city: string) => number;
  decide: (x: DecisionInput) => Decision;
  /** Vontade de ir emprestado: quer jogar (mais quem não joga no clube dono), custa-lhe descer de escalão e a cidade conta um pouco. */
  decideLoan: (x: LoanInput) => number;
};

/** Atração de um clube (0-1): escalão, reputação (contra a maior do país) e dimensão do estádio. */
function clubScore(c: BaseClub, p: Params["market"]["decision"], maxReputation: number, maxCapacity: number): number {
  const w = p.club;
  const total = w.tier + w.reputation + w.stadium;
  return (w.tier * p.tier[c.tier] + w.reputation * clamp(c.reputation / Math.max(1, maxReputation), 0, 1) + w.stadium * clamp(Math.log10(Math.max(100, c.stadium.capacity)) / Math.log10(Math.max(1000, maxCapacity)), 0, 1)) / total;
}

/** Cria o avaliador para uma ronda: guarda em memória a atração de cada clube e cidade, que só mudam de época para época. */
export function makeAppeal(repo: Repository, data: BaseData, params: Params): Appeal {
  const d = params.market.decision;
  const maxReputation = Math.max(...data.clubs.map((c) => c.reputation));
  const maxCapacity = Math.max(...data.clubs.map((c) => c.stadium.capacity));
  const maxPopulation = Math.max(...data.cities.map((c) => c.population));
  const clubs = new Map<string, number>();
  const cities = new Map<string, number>();
  const club = (c: BaseClub): number => clubs.get(c.id) ?? clubs.set(c.id, clubScore(c, d, maxReputation, maxCapacity)).get(c.id)!;
  const city = (id: string): number => {
    let v = cities.get(id);
    if (v !== undefined) return v;
    const st = cityStateNow(repo, data, params, id);
    const w = d.city;
    const total = w.economy + w.employment + w.tourism + w.pride + w.footballCulture + w.notoriety + w.population;
    v = st ? (w.economy * st.economy + w.employment * st.employment + w.tourism * st.tourism + w.pride * st.pride + w.footballCulture * st.footballCulture + w.notoriety * st.notoriety) / 100 / total + (w.population * clamp(Math.log10(Math.max(1000, st.population)) / Math.log10(Math.max(10000, maxPopulation)), 0, 1)) / total : 0.5;
    cities.set(id, v);
    return v;
  };

  const decide = (x: DecisionInput): Decision => {
    const person = repo.person(x.person);
    const ambition = person?.personality.ambition ?? 10;
    const loyalty = person?.personality.loyalty ?? 10;
    const greed = person?.personality.greed ?? 10;
    const birth = person?.birthCity;
    const share = clamp(d.cityShare + d.byLoyaltyCity * (loyalty - 10), 0, 0.8);
    const clubDelta = (club(x.to) - (x.from ? club(x.from) : 0)) * (1 + d.byAmbition * (ambition - 10));
    const cityDelta = city(x.to.city) - (x.from ? city(x.from.city) : city(x.to.city) - 0.1);
    const delta = clamp((1 - share) * clubDelta + share * cityDelta, -1, 1);
    let z = d.bias + d.scale * delta;
    z += d.wage * (greed / 10) * Math.log(Math.max(1, x.newWage) / Math.max(1, x.currentWage || x.newWage));
    if (birth !== undefined) {
      if (birth === x.to.city) z += d.home;
      else if (x.from && birth === x.from.city) z -= d.leavingHome;
    }
    z += (x.starter ? d.playingTime : -d.playingTime) * (ambition / 10);
    if (!x.from) z += d.free;
    z -= d.byLoyalty * (loyalty - 10) * (x.from ? 1 : 0);
    return { p: clamp(sigmoid(z), 0.02, 0.98), delta };
  };
  const decideLoan = (x: LoanInput): number => {
    const person = repo.person(x.person);
    const ambition = person?.personality.ambition ?? 10;
    const loyalty = person?.personality.loyalty ?? 10;
    const drop = Math.max(0, club(x.from) - club(x.to));
    let z = d.bias + (x.starter ? d.playingTime : -d.playingTime) * (ambition / 10) + (x.benchwarmer ? d.playingTime : 0) - d.scale * 0.8 * drop * (1 + d.byAmbition * (ambition - 10));
    z += 0.3 * d.scale * (city(x.to.city) - city(x.from.city));
    if (person?.birthCity === x.to.city) z += d.home;
    z -= d.byLoyalty * (loyalty - 10) * 0.5;
    return clamp(sigmoid(z), 0.02, 0.98);
  };
  return { club, city, decide, decideLoan };
}
