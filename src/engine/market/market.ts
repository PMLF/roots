/**
 * Mercado de transferências entre clubes da IA (RZ-205 / RZ-213). Nas janelas, em rondas semanais (e no último dia), cada
 * clube decide se age: procura a posição que mais precisa de preencher ou reforçar, escolhe um jogador (de outro clube ou livre)
 * que traga qualidade dentro do que pode pagar (verba de transferências e massa salarial do orçamento anual), propõe um preço
 * à volta do valor de mercado; o clube vendedor aceita se o preço cobrir o que pede (sobe se o jogador é titular) e o jogador
 * consente consoante a ambição, a lealdade e o salário. O dinheiro passa pelo livro de cada clube (`transfers`).
 * O clube do gamer fica de fora (sem ecrã de propostas ainda): nem compra nem vende.
 */
import { Rng, clamp } from "../random/rng";
import { weekDay } from "../calendar/dates";
import type { Params, Tier } from "../config/parameters";
import type { BaseClub, BaseData, ClubId } from "../data/types";
import { post, monthlyWageBill } from "../club/finances";
import { clubBudget } from "../club/budget";
import type { Repository } from "../persistence/repository";
import type { IsoDate, PlayerRecord } from "../persistence/types";
import { currentQuality } from "../world/player";
import { distributePositions } from "../world/generateWorld";
import type { Attributes, Position } from "../world/types";
import { contractDates, wageFor } from "../squad/youth";
import { isInSecondDistrict } from "../season/districts";
import { marketValue } from "./value";
import { releaseClause } from "./clauses";
import { isImportantFee } from "./newsworthy";
import { agentTraits } from "../agent/assign";
import type { ContractClauses } from "../persistence/types";

export type MarketWindow = { index: number; last: boolean; id: string };

const pad = (n: number) => String(n).padStart(2, "0");

/** A janela de mercado aberta na data (se houver) e se é o último dia. */
export function windowAt(date: IsoDate, params: Params): MarketWindow | undefined {
  const md = date.slice(5);
  for (const [index, w] of params.market.windows.entries()) {
    const open = `${pad(w.open[0])}-${pad(w.open[1])}`;
    const close = `${pad(w.close[0])}-${pad(w.close[1])}`;
    if (md >= open && md <= close) return { index, last: md === close, id: `${date.slice(0, 4)}-w${index}` };
  }
  return undefined;
}

/** Corre-se uma ronda neste dia? Segundas-feiras da janela, abertura e último dia. */
export function isMarketDay(date: IsoDate, params: Params): boolean {
  const w = windowAt(date, params);
  if (!w) return false;
  const first = params.market.windows[w.index]!.open;
  return w.last || weekDay(date) === params.market.roundWeekday || date.slice(5) === `${pad(first[0])}-${pad(first[1])}`;
}

export type MarketSummary = { transfers: number; freeSignings: number; spent: number; agentFees: number; releases: number; compensation: number };

type Entry = { record: PlayerRecord; club?: ClubId; position: Position; quality: number };
type Budget = { season: number; wageBillMax: number; transfers: number };

const TIER_ORDER: Tier[] = ["firstLeague", "secondLeague", "thirdLeague", "cp", "district"];
const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 1;

export function marketRound(repo: Repository, data: BaseData, params: Params, date: IsoDate, season: number, o: { gamerClub?: ClubId; locked?: Set<string> } = {}): MarketSummary {
  const summary: MarketSummary = { transfers: 0, freeSignings: 0, spent: 0, agentFees: 0, releases: 0, compensation: 0 };
  const win = windowAt(date, params);
  if (!win || repo.peopleTotal() === 0) return summary;
  const mk = params.market;
  const world = params.world;
  const seed = repo.meta("seed") ?? "?";
  const rng = new Rng(seed, `market/${date}`);
  const clubs = data.clubs.filter((c) => !isInSecondDistrict(c.league));
  const clubById = new Map(clubs.map((c) => [c.id, c] as const));

  // índice do mercado: plantéis por clube e jogadores por posição
  const byClub = new Map<ClubId, Entry[]>();
  const byPos = new Map<Position, Entry[]>();
  const index = (e: Entry) => byPos.set(e.position, [...(byPos.get(e.position) ?? []), e]);
  for (const c of clubs) {
    const list = repo.clubPlayers(c.id).filter((j) => j.state === "active" && !o.locked?.has(j.person)).map((j): Entry => {
      const position = (j.positions[0]?.pos ?? "CM") as Position;
      return { record: j, club: c.id, position, quality: currentQuality(j.attributes as Attributes, position) };
    });
    byClub.set(c.id, list);
    for (const e of list) index(e);
  }
  for (const j of repo.playersByState("free")) {
    if (o.locked?.has(j.person)) continue;
    const position = (j.positions[0]?.pos ?? "CM") as Position;
    index({ record: j, position, quality: currentQuality(j.attributes as Attributes, position) });
  }
  const ageCache = new Map<string, number>();
  const ageOf = (id: string): number => {
    let a = ageCache.get(id);
    if (a === undefined) {
      const b = repo.person(id)?.birth ?? date;
      a = (Date.parse(date) - Date.parse(b)) / (365.25 * 86400000);
      ageCache.set(id, a);
    }
    return a;
  };
  const tierOf = (c: BaseClub): Tier => c.tier;
  const stats = new Map<Tier, { repMin: number; repMax: number; medianFinances: number }>();
  for (const t of TIER_ORDER) {
    const cs = clubs.filter((c) => tierOf(c) === t);
    if (cs.length === 0) continue;
    const reps = cs.map((c) => c.reputation);
    stats.set(t, { repMin: Math.min(...reps), repMax: Math.max(...reps), medianFinances: median(cs.map((c) => c.finances)) });
  }
  const greedOf = new Map<ClubId, number>();
  const greed = (club: ClubId): number => {
    let g = greedOf.get(club);
    if (g === undefined) {
      const p = repo.publicRoles({ club }).find((x) => x.fn === "president");
      g = (p ? repo.person(p.id)?.personality.greed : undefined) ?? 10;
      greedOf.set(club, g);
    }
    return g;
  };
  const budgets = new Map<ClubId, Budget>();
  const budgetOf = (c: BaseClub): Budget => {
    let b = budgets.get(c.id);
    if (!b) {
      b = { ...clubBudget(repo, c, params, season) };
      budgets.set(c.id, b);
    }
    return b;
  };
  const saveBudget = (c: BaseClub) => repo.setMeta(`budget.${c.id}`, JSON.stringify(budgets.get(c.id)));
  const signKey = (club: ClubId) => `market.${win.id}.${club}`;
  const signed = (club: ClubId) => Number(repo.meta(signKey(club)) ?? 0);

  const order = rng.shuffle(clubs.filter((c) => c.id !== o.gamerClub));
  for (const club of order) {
    const crng = rng.derive(club.id);
    if (!crng.prob(win.last ? mk.actProbabilityLastDay : mk.actProbability)) continue;
    if (signed(club.id) >= mk.maxSigningsPerWindow) continue;
    const tier = tierOf(club);
    const st = stats.get(tier);
    if (!st) continue;
    const target = world.squad[tier];
    const squad = byClub.get(club.id) ?? [];
    if (squad.length >= target + mk.squadSlack) continue;
    const repNorm = st.repMax > st.repMin ? (club.reputation - st.repMin) / (st.repMax - st.repMin) : 0.5;
    const desired = clamp(world.targetQuality[tier].mean + world.qualityByReputation * (repNorm - 0.5), 1, 20);

    // necessidade: posição por preencher, senão a posição com o titular mais fraco
    const wantedList = distributePositions(target, world.placesByPosition);
    const wanted = new Map<Position, number>();
    for (const p of wantedList) wanted.set(p, (wanted.get(p) ?? 0) + 1);
    const lacking: Position[] = [];
    let weakest = { position: undefined as Position | undefined, gap: 0, floor: 0 };
    for (const [position, slots] of wanted) {
      const qs = squad.filter((e) => e.position === position).map((e) => e.quality).sort((a, b) => b - a);
      if (qs.length < slots) lacking.push(position);
      const floorQ = qs[slots - 1] ?? 0;
      const gap = desired - floorQ;
      if (qs.length >= slots && gap > weakest.gap) weakest = { position, gap, floor: floorQ };
    }
    const fill = lacking.length > 0;
    const position = fill ? crng.choose(lacking) : weakest.gap >= mk.minUpgrade ? weakest.position : undefined;
    if (!position) continue;
    const floor = fill ? desired - 2 : weakest.floor + mk.minUpgrade;

    const budget = budgetOf(club);
    const monthsOf = (id: string) => {
      const c = repo.contract(id);
      return c ? Math.max(0, (Date.parse(c.end) - Date.parse(date)) / (30.44 * 86400000)) : 0;
    };
    // com o plantel completo, o reforço desloca o suplente mais fraco da posição se o contrato dele estiver a acabar
    const slotsHere = wanted.get(position) ?? 0;
    const backups = squad.filter((x) => x.position === position).sort((a, b) => a.quality - b.quality);
    const displaced = squad.length >= target && backups.length > slotsHere && monthsOf(backups[0]!.record.person) <= 12 ? backups[0] : undefined;
    const displacedWage = displaced ? (repo.contract(displaced.record.person)?.monthlyWage ?? 0) * 12 : 0;
    const bill = monthlyWageBill(repo, club.id) * 12 - displacedWage;
    const wageScale = clamp((club.finances / st.medianFinances) ** 0.4, 0.4, 2.5);

    // candidatos: qualidade acima do piso e não muito acima do que o clube pode querer
    const pool = (byPos.get(position) ?? []).filter((e) => e.club !== club.id && (o.gamerClub === undefined || e.club !== o.gamerClub) && e.quality >= floor && e.quality <= desired + mk.qualityCeiling);
    let best: { e: Entry; fee: number; wage: number; commission: number; compensation: number; trainer: BaseClub | undefined; years: number; score: number } | undefined;
    for (const e of crng.shuffle(pool).slice(0, 80)) {
      const ct = repo.contract(e.record.person);
      const age = ageOf(e.record.person);
      if (age > 35 && e.club) continue;
      const monthsLeft = ct ? Math.max(0, (Date.parse(ct.end) - Date.parse(date)) / (30.44 * 86400000)) : 0;
      const value = e.club && ct ? marketValue({ quality: e.quality, potential: e.record.potential, age, monthlyWage: ct.monthlyWage, monthsLeft }, params) : 0;
      const fee = Math.round(value * (1 + mk.bidPremium) / 1000) * 1000;
      const formula = wageFor(params, tier, e.quality, wageScale);
      const ag = agentTraits(repo, e.record.agent);
      const wage = Math.round((Math.max(formula, Math.round(((ct?.monthlyWage ?? 0) * mk.wageRaise) / 10) * 10) * (ag ? 1 + mk.agents.wageByGreed * (ag.greed - mk.agents.greedPivot) : 1)) / 10) * 10;
      const commission = ag ? Math.round((wage * 12 * mk.agents.commissionRate * (1 + mk.agents.commissionByGreed * (ag.greed - mk.agents.greedPivot))) / 100) * 100 : 0;
      const trainer = !e.club && e.record.trainedAt && e.record.trainedAt !== club.id && age <= mk.training.ageMax ? clubById.get(e.record.trainedAt) : undefined;
      const compensation = trainer ? Math.round((wage * 12 * mk.training.byTier[tierOf(trainer)]) / 100) * 100 : 0;
      if (fee + commission + compensation > budget.transfers || bill + wage * 12 > budget.wageBillMax * (1 + mk.wageSlack)) continue;
      const score = (e.quality - floor) - (budget.transfers > 0 ? (fee / budget.transfers) * 0.8 : 0) - ((wage * 12) / Math.max(1, budget.wageBillMax)) * 2 + crng.float() * 0.3;
      if (!best || score > best.score) best = { e, fee, wage, commission, compensation, trainer, years: crng.integer(mk.contractYears[0], mk.contractYears[1]), score };
    }
    if (!best) continue;
    const { e, fee, wage, commission, compensation, trainer, years } = best;
    const agentTr = agentTraits(repo, e.record.agent);
    const seller = e.club ? clubById.get(e.club) : undefined;

    if (seller) {
      // o vendedor pede mais se o jogador é titular, e não fica sem gente
      const sellerSquad = byClub.get(seller.id) ?? [];
      if (sellerSquad.length - 1 < world.squad[tierOf(seller)] - 2) continue;
      const rankInPos = sellerSquad.filter((x) => x.position === position && x.quality > e.quality).length;
      const slots = [...distributePositions(world.squad[tierOf(seller)], world.placesByPosition)].filter((p) => p === position).length;
      const ct = repo.contract(e.record.person);
      const age = ageOf(e.record.person);
      const monthsLeft = ct ? Math.max(0, (Date.parse(ct.end) - Date.parse(date)) / (30.44 * 86400000)) : 0;
      const value = ct ? marketValue({ quality: e.quality, potential: e.record.potential, age, monthlyWage: ct.monthlyWage, monthsLeft }, params) : 0;
      const ask = value * (mk.askBase + mk.askByGreed * (greed(seller.id) - 10)) * (rankInPos < slots ? 1.25 : 1);
      const offer = fee * (1 + crng.gauss(0, mk.bidNoise));
      const counter = ask <= value * (1 + mk.counterTolerance) && ask <= budget.transfers;
      const releaseClauseValue = repo.contract(e.record.person)?.clauses?.release;
      const canRelease = releaseClauseValue !== undefined && releaseClauseValue + commission <= budget.transfers;
      let viaRelease = false;
      if (offer < ask && !counter) {
        if (!canRelease) continue;
        viaRelease = true;
      }
      // consentimento do jogador
      const person = repo.person(e.record.person);
      const dir = TIER_ORDER.indexOf(tierOf(club)) < TIER_ORDER.indexOf(tierOf(seller)) ? mk.consent.up : TIER_ORDER.indexOf(tierOf(club)) === TIER_ORDER.indexOf(tierOf(seller)) ? (mk.consent.up + mk.consent.down) / 2 : mk.consent.down;
      const wageRatio = ct && ct.monthlyWage > 0 ? wage / ct.monthlyWage : 1;
      const p = clamp(dir + mk.consent.byAmbition * ((person?.personality.ambition ?? 10) - 10) - mk.consent.byLoyalty * ((person?.personality.loyalty ?? 10) - 10) + mk.consent.byWageRatio * (wageRatio - 1) + (agentTr ? mk.agents.consentByGreed * (agentTr.greed - mk.agents.greedPivot) - mk.agents.consentByLoyalty * (agentTr.loyalty - mk.agents.loyaltyPivot) : 0), 0.02, 0.98);
      if (!crng.derive(`consent/${e.record.person}`).prob(p)) continue;
      // transferência
      const paid = viaRelease ? (releaseClauseValue as number) : Math.round(Math.max(ask, Math.min(offer, fee)) / 1000) * 1000;
      if (paid + commission > budget.transfers) continue;
      post(repo, club, "transfers", -paid);
      post(repo, seller, "transfers", paid);
      budget.transfers -= paid;
      const sb = budgetOf(seller);
      sb.transfers += Math.round(paid * mk.saleToBudget);
      saveBudget(seller);
      sellerSquad.splice(sellerSquad.indexOf(e), 1);
      summary.transfers++;
      if (viaRelease) summary.releases++;
      summary.spent += paid;
      repo.appendEvent({
        type: "TRANSFER", date, season, visibility: "exposed", origin: "generated",
        entities: [{ k: "person", id: e.record.person, roleKind: "player" }, { k: "club", id: seller.id, roleKind: "seller" }, { k: "club", id: club.id, roleKind: "buyer" }, ...(e.record.agent ? [{ k: "person" as const, id: e.record.agent, roleKind: "agent" }] : [])],
        data: { fee: paid, wage, years, window: win.id, ...(isImportantFee(params, paid) ? { important: 1 } : {}), ...(commission > 0 ? { commission } : {}), ...(viaRelease ? { release: true } : {}) },
      });
    } else {
      repo.appendEvent({
        type: "PLAYER_SIGNED", date, season, visibility: "exposed", origin: "generated",
        entities: [{ k: "person", id: e.record.person, roleKind: "player" }, { k: "club", id: club.id }, ...(trainer && compensation > 0 ? [{ k: "club" as const, id: trainer.id, roleKind: "trainer" }] : []), ...(e.record.agent ? [{ k: "person" as const, id: e.record.agent, roleKind: "agent" }] : [])], data: { from: "free", wage, years, window: win.id, ...(commission > 0 ? { commission } : {}), ...(compensation > 0 ? { compensation } : {}) },
      });
      summary.freeSignings++;
    }
    if (displaced) {
      repo.updatePlayer(displaced.record.person, { club: null, state: "free" });
      squad.splice(squad.indexOf(displaced), 1);
      displaced.club = undefined;
      repo.appendEvent({ type: "CONTRACT_EXPIRED", date, season, visibility: "exposed", origin: "generated", entities: [{ k: "person", id: displaced.record.person, roleKind: "player" }, { k: "club", id: club.id }], data: { reason: "released" } });
    }
    repo.updatePlayer(e.record.person, { club: club.id, state: "active" });
    const newRelease = releaseClause(crng.derive(`release/${e.record.person}`), marketValue({ quality: e.quality, potential: e.record.potential, age: ageOf(e.record.person), monthlyWage: wage, monthsLeft: years * 12 }, params), agentTr?.greed, params);
    const clauses: ContractClauses = { ...(newRelease !== undefined ? { release: newRelease } : {}) };
    repo.saveContract({ person: e.record.person, club: club.id, monthlyWage: wage, ...contractDates(date, years), ...(Object.keys(clauses).length > 0 ? { clauses } : {}) });
    e.club = club.id;
    squad.push(e);
    if (commission > 0) {
      post(repo, club, "transfers", -commission);
      budget.transfers -= commission;
      summary.agentFees += commission;
    }
    if (trainer && compensation > 0) {
      post(repo, club, "transfers", -compensation);
      post(repo, trainer, "transfers", compensation);
      budget.transfers -= compensation;
      const tb = budgetOf(trainer);
      tb.transfers += Math.round(compensation * mk.saleToBudget);
      saveBudget(trainer);
      summary.compensation += compensation;
    }
    saveBudget(club);
    repo.setMeta(signKey(club.id), String(signed(club.id) + 1));
  }
  return summary;
}
