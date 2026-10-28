/**
 * Ciclo anual dos plantéis (RZ-117; RZ-147 em versão básica). Corre no fim da época, antes de a nova começar:
 * 1. cada jogador envelhece: reforma-se ou desenvolve-se;
 * 2. contratos que terminaram: o clube renova ou deixa partir (o clube do gamer renova sempre até haver ecrã de renovações);
 * 3. formação: entram jovens do clube até ao plantel-alvo mais a folga;
 * 4. os clubes com falta de jogadores contratam livres (por posição, perto da qualidade que procuram);
 * 5. se não houver livre adequado, entra um jovem de emergência.
 * Determinístico: cada jogador e cada clube têm o seu fluxo aleatório; os clubes processam-se por escalão e reputação.
 */
import { cityStateNow } from "../city/cities";
import { endDueLoans } from "../loans/loans";
import { standingIn } from "../world/standing";
import { Rng, clamp } from "../random/rng";
import { ageAt } from "../calendar/dates";
import type { Params, Tier } from "../config/parameters";
import type { BaseCity, BaseClub, BaseData, ClubId } from "../data/types";
import type { Repository } from "../persistence/repository";
import type { ContractRecord, IsoDate, PlayerRecord, WorldBatchRecord } from "../persistence/types";
import { currentQuality } from "../world/player";
import { distributePositions } from "../world/generateWorld";
import type { Attributes, Position } from "../world/types";
import { developPlayer } from "./development";
import { contractDates, createYouth, wageFor } from "./youth";
import { decisionOf, negotiationOf } from "./renewals";
import { marketValue } from "../market/value";
import { releaseClause } from "../market/clauses";
import { agentTraits } from "../agent/assign";
import { newProspects } from "./prospects";
import { clubBalance } from "../club/finances";
import { lockLocalSigning, pruneLocks } from "./localPriority";
import { rolloverForeign } from "./foreign";
import { buyAbroad, foreignPool, sellAbroad } from "./abroad";
import { TIER_BONUS, youthFocus } from "./youthFocus";
import { updateYouthLevels, yieldOf, youthLevelOf } from "./youthLevel";

export type RolloverSummary = { retired: number; developed: number; expired: number; renewed: number; released: number; signedFree: number; youth: number; emergencyYouth: number; /** Jovens da terra que acabaram noutra cidade (2.ª fase). */ prospectsAway: number };

export type RolloverInput = {
  season: number;
  /** Primeiro dia da nova época (os contratos que acabam antes disto expiraram). */
  seasonStart: IsoDate;
  /** Escalão de cada clube na época que vai começar. */
  tiers: ReadonlyMap<ClubId, Tier>;
  gamerClub?: ClubId;
};

const TIER_ORDER: Tier[] = ["firstLeague", "secondLeague", "thirdLeague", "cp", "district"];


const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length === 0 ? 1 : (s[Math.floor(s.length / 2)] as number);
};

type Member = { record: PlayerRecord; position: Position; quality: number };

const member = (record: PlayerRecord): Member => {
  const position = (record.positions[0]?.pos ?? "CM") as Position;
  return { record, position, quality: currentQuality(record.attributes as Attributes, position) };
};

export function retirementProbability(age: number, position: string, free: boolean, params: Params): number {
  const r = params.squadCycle.retirement;
  if (age >= r.maxAge) return 1;
  const effective = age - (position === "GK" ? r.goalkeeperExtraYears : 0);
  if (effective < r.fromAge) return 0;
  return clamp((r.baseProbability + r.perYear * (effective - r.fromAge)) * (free ? r.freeMultiplier : 1), 0, 1);
}

export function renewalProbability(quality: number, tierMean: number, age: number, params: Params, focus = 1): number {
  const c = params.squadCycle.contracts;
  const y = params.squadCycle.youth;
  const byFocus = age <= 21 ? y.renewalYouthEffect * (focus - 1) : age >= 30 ? -y.renewalVeteranEffect * (focus - 1) : 0;
  return clamp(c.renewBase + c.renewPerQualityPoint * (quality - tierMean) - c.renewPerOldYear * Math.max(0, age - c.oldAge) + byFocus, c.renewMin, c.renewMax);
}

export function rolloverSquads(repo: Repository, data: BaseData, params: Params, o: RolloverInput): RolloverSummary {
  const seed = repo.meta("seed") ?? "?";
  const sc = params.squadCycle;
  const world = params.world;
  const summary: RolloverSummary = { retired: 0, developed: 0, expired: 0, renewed: 0, released: 0, signedFree: 0, youth: 0, emergencyYouth: 0, prospectsAway: 0 };
  if (repo.peopleTotal() === 0) return summary; // save sem mundo gerado (testes de calendário)
  const date = o.seasonStart;
  endDueLoans(repo, date, o.season, true); // os empréstimos acabam com a época: todos regressam ao clube dono (RZ-268)
  const rngOf = (path: string) => new Rng(seed, `rollover/${o.season}/${path}`);

  // ---------- 1. envelhecer: reforma ou desenvolvimento
  const squads = new Map<ClubId, Member[]>();
  const retire = (j: PlayerRecord, was: ClubId | undefined) => {
    repo.updatePlayer(j.person, { state: "retired", club: null });
    repo.appendEvent({ type: "PLAYER_RETIRED", date, season: o.season, visibility: "exposed", origin: "generated", entities: [{ k: "person", id: j.person, roleKind: "player" }, ...(was ? [{ k: "club" as const, id: was }] : [])], data: { age: ageAt(repo.person(j.person)!.birth, date) } });
    summary.retired++;
  };
  const ages = new Map<string, number>();
  const age = (j: PlayerRecord): number => {
    let a = ages.get(j.person);
    if (a === undefined) {
      a = ageAt((repo.person(j.person) as { birth: IsoDate }).birth, date);
      ages.set(j.person, a);
    }
    return a;
  };
  const process = (j: PlayerRecord): Member | undefined => {
    const rng = rngOf(`player/${j.person}`);
    const a = age(j);
    const free = j.club === undefined;
    if (rng.derive("retire").prob(retirementProbability(a, j.positions[0]?.pos ?? "CM", free, params))) {
      retire(j, j.club);
      return undefined;
    }
    const position = (j.positions[0]?.pos ?? "CM") as Position;
    const d = developPlayer(rng.derive("develop"), { attributes: j.attributes, potential: j.potential, position, age: a }, params);
    repo.updatePlayer(j.person, { attributes: d.attributes, potential: d.potential });
    summary.developed++;
    return member({ ...j, attributes: d.attributes, potential: d.potential });
  };
  for (const club of [...data.clubs].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const list: Member[] = [];
    for (const j of repo.clubPlayers(club.id)) {
      if (j.state !== "active") continue;
      const m = process(j);
      if (m) list.push(m);
    }
    squads.set(club.id, list);
  }
  const pool: Member[] = [];
  for (const j of repo.playersByState("free")) {
    const m = process(j);
    if (m) pool.push(m);
  }

  // jovens da terra sem clube (RZ-234): desenvolvem-se um ano e os clubes contratam-nos da sua zona antes de criarem jovens de raiz
  const prospects: Member[] = [];
  for (const j of repo.playersByState("prospect")) {
    const m = process(j);
    if (m) prospects.push(m);
  }
  const homeOf = new Map<string, string | undefined>();
  const homeCity = (id: string): string | undefined => {
    if (!homeOf.has(id)) homeOf.set(id, repo.person(id)?.birthCity);
    return homeOf.get(id);
  };

  // ---------- estatísticas por escalão (reputação normalizada, mediana de capital) para qualidade e ordenados
  const byTier = new Map<Tier, BaseClub[]>();
  for (const c of data.clubs) {
    const t = o.tiers.get(c.id) ?? c.tier;
    byTier.set(t, [...(byTier.get(t) ?? []), c]);
  }
  const tierStats = new Map<Tier, { medianFinances: number; medianBalance: number }>();
  const standing = new Map<string, number>();
  for (const [t, cs] of byTier) {
    for (const c of cs) standing.set(c.id, standingIn(c, cs, world.standingReputationWeight));
    tierStats.set(t, { medianFinances: median(cs.map((c) => c.finances)), medianBalance: Math.max(1, median(cs.map((c) => clubBalance(repo, c)))) });
  }

  // ---------- 2-5. clubes por escalão e reputação
  const batch: WorldBatchRecord = { people: [], players: [], contracts: [], roles: [] };
  let nextId = repo.peopleTotal();
  const newId = () => `p${String(++nextId).padStart(6, "0")}`;
  const citiesByDistrict = new Map<string, BaseCity[]>();
  for (const c of data.cities) citiesByDistrict.set(c.district, [...(citiesByDistrict.get(c.district) ?? []), c]);

  const order = [...data.clubs].sort((a, b) => {
    const ta = TIER_ORDER.indexOf(o.tiers.get(a.id) ?? a.tier);
    const tb = TIER_ORDER.indexOf(o.tiers.get(b.id) ?? b.tier);
    return ta - tb || b.reputation - a.reputation || (a.id < b.id ? -1 : 1);
  });
  // mercado com o estrangeiro (RZ-237): os clubes de IA vendem destaques e, mais abaixo, repõem com compras lá fora
  const abroadCtx = { season: o.season, seasonStart: o.seasonStart, seed };
  for (const club of order) {
    if (club.id === o.gamerClub) continue;
    const tier = o.tiers.get(club.id) ?? club.tier;
    const desired = clamp(world.targetQuality[tier].mean + world.qualityByReputation * ((standing.get(club.id) ?? 0.5) - 0.5), 1, 20);
    const list = squads.get(club.id) ?? [];
    const gone = new Set(sellAbroad(repo, params, abroadCtx, club, tier, desired, list.map((m) => m.record)));
    if (gone.size > 0) squads.set(club.id, list.filter((m) => !gone.has(m.record.person)));
  }
  const abroadPool = foreignPool(repo, params, abroadCtx);
  const years = (rng: Rng) => rng.integer(sc.contracts.yearsMin, sc.contracts.yearsMax);
  const event = (type: string, j: string, club: ClubId, extra: Record<string, unknown>) =>
    repo.appendEvent({ type, date, season: o.season, visibility: "exposed", origin: "generated", entities: [{ k: "person", id: j, roleKind: "player" }, { k: "club", id: club }], data: extra });

  const newYouth: string[] = [];
  // contexto de cada clube no fim da sua ronda: a 2.ª fase dos jovens da terra (tentar a sorte noutra cidade) precisa de saber quem tem lugar
  const rooms: { club: BaseClub; tier: Tier; target: number; desired: number; wageScale: number; kept: Member[]; counts: Map<Position, number>; missing: () => Position[]; rng: Rng }[] = [];
  for (const club of order) {
    const tier = o.tiers.get(club.id) ?? club.tier;
    const stats = tierStats.get(tier) as { medianFinances: number; medianBalance: number };
    const target = world.squad[tier];
    const tq = world.targetQuality[tier];
    const repNorm = standing.get(club.id) ?? 0.5;
    const desired = clamp(tq.mean + world.qualityByReputation * (repNorm - 0.5), 1, 20);
    // poder de compra: metade da riqueza de arranque, metade da caixa de agora face à mediana do escalão (clubes bem geridos gastam mais)
    const richness = 0.5 * (club.finances / stats.medianFinances) + 0.5 * clamp(clubBalance(repo, club) / stats.medianBalance, 0.05, 6);
    const wageScale = clamp(richness ** 0.4, 0.4, 2.5);
    const rng = rngOf(`club/${club.id}`);
    const members = squads.get(club.id) ?? [];
    const focus = youthFocus(repo, club, tier, params);
    // aproveitamento da formação do clube e orgulho da terra: mais ou menos jovens a entrar e potencial extra para quem sai de uma boa formação
    const yld = yieldOf(youthLevelOf(repo, data, params, club).value, params);
    const pride = cityStateNow(repo, data, params, club.city)?.pride ?? 50;
    const dev = sc.youth.development;

    // contratos que terminaram
    const expired = (m: Member) => (repo.contract(m.record.person)?.end ?? "9999-12-31") < o.seasonStart;
    const kept = members.filter((m) => !expired(m));
    const expiring = members.filter(expired).sort((a, b) => b.quality - a.quality || (a.record.person < b.record.person ? -1 : 1));
    for (const m of expiring) {
      summary.expired++;
      const own = o.gamerClub === club.id;
      // negociação fechada sem acordo (o agente recusou, ou o jogador não quer o clube): sai
      const decision = own ? decisionOf(repo, o.season, m.record.person) ?? (negotiationOf(repo, o.season, m.record.person).closed ? { kind: "release" as const } : undefined) : undefined;
      const wants = decision
        ? decision.kind === "renew"
        : kept.length < target && (o.gamerClub === club.id || rng.derive(`renew/${m.record.person}`).prob(renewalProbability(m.quality, tq.mean, age(m.record), params, focus)));
      if (wants) {
        const y = decision?.kind === "renew" ? decision.years : years(rng);
        const wage = decision?.kind === "renew" ? decision.wage : Math.max(50, Math.round((wageFor(params, tier, m.quality, wageScale) * sc.contracts.renewalWageFactor) / 10) * 10);
        const release = decision?.kind === "renew" ? decision.release ?? undefined : releaseClause(rng.derive(`release/${m.record.person}`), marketValue({ quality: m.quality, potential: m.record.potential, age: age(m.record), monthlyWage: wage, monthsLeft: y * 12 }, params), agentTraits(repo, m.record.agent)?.greed, params);
        repo.saveContract({ person: m.record.person, club: club.id, monthlyWage: wage, ...contractDates(o.seasonStart, y), ...(release !== undefined ? { clauses: { release } } : {}) });
        event("CONTRACT_RENEWED", m.record.person, club.id, { wage, years: y });
        kept.push(m);
        summary.renewed++;
      } else {
        repo.updatePlayer(m.record.person, { club: null, state: "free" });
        event("CONTRACT_EXPIRED", m.record.person, club.id, {});
        pool.push({ ...m, record: { ...m.record, state: "free" } });
        summary.released++;
      }
    }

    // posições em falta
    const wanted = distributePositions(target, world.placesByPosition);
    const counts = new Map<Position, number>();
    for (const m of kept) counts.set(m.position, (counts.get(m.position) ?? 0) + 1);
    const missing = (): Position[] => {
      const left = new Map(counts);
      const out: Position[] = [];
      for (const p of wanted) {
        const have = left.get(p) ?? 0;
        if (have > 0) left.set(p, have - 1);
        else out.push(p);
      }
      return out;
    };
    const cities = citiesByDistrict.get(club.district) ?? [];
    const takeProspect = (position: Position): boolean => {
      const expected = desired - Math.max(0, world.peakAge - 3 - 17) * 0.35;
      let best = -1;
      let bestScore = Infinity;
      prospects.forEach((m, i) => {
        if (m.position !== position) return;
        const home = homeCity(m.record.person);
        const score = Math.abs(m.quality - expected) + (home === club.city ? 0 : Infinity);
        if (Math.abs(m.quality - expected) > sc.squad.freeAgentTolerance || score >= bestScore) return;
        best = i;
        bestScore = score;
      });
      if (best < 0) return false;
      const [m] = prospects.splice(best, 1) as [Member];
      const y = years(rng);
      const contract: ContractRecord = { person: m.record.person, club: club.id, monthlyWage: wageFor(params, tier, clamp(m.quality, 1, 20), wageScale), ...contractDates(o.seasonStart, y) };
      const potential = Math.round(clamp(m.record.potential + dev.potentialByYield * 10 * (yld - dev.yieldPivot), 1, 20) * 10) / 10;
      repo.updatePlayer(m.record.person, { club: club.id, trainedAt: club.id, state: "active", potential });
      repo.saveContract(contract);
      event("PLAYER_SIGNED", m.record.person, club.id, { from: "local", wage: contract.monthlyWage, years: y });
      lockLocalSigning(repo, params, m.record.person, o.seasonStart);
      if (o.gamerClub === club.id) newYouth.push(m.record.person);
      counts.set(position, (counts.get(position) ?? 0) + 1);
      kept.push(member({ ...m.record, club: club.id, trainedAt: club.id, state: "active" }));
      summary.youth++;
      return true;
    };
    const addYouth = (position: Position, emergency: boolean) => {
      if (!emergency && takeProspect(position)) return;
      const y = years(rng);
      const kit = createYouth(
        rng.derive(`youth/${nextId + 1}`),
        { id: newId(), club, tier, position, targetQuality: clamp(rng.gauss(desired + sc.youth.targetOffset + sc.youth.qualityByFocus * (focus - 1 - TIER_BONUS[tier]), tq.deviation), 1, 20), focus: focus - TIER_BONUS[tier], wageScale, seasonStart: o.seasonStart, years: y, cities: data.cities, districtCities: cities },
        params,
      );
      batch.people.push(kit.person);
      if (!emergency && o.gamerClub === club.id) newYouth.push(kit.person.id);
      batch.players.push(kit.player);
      batch.contracts.push(kit.contract);
      counts.set(position, (counts.get(position) ?? 0) + 1);
      kept.push(member(kit.player));
      if (emergency) summary.emergencyYouth++;
      else summary.youth++;
    };

    // formação até ao alvo mais a folga
    const intake = Math.min(Math.round(sc.youth.perClub[tier] * focus * (yld / dev.yieldPivot) * (1 + (dev.prideLocal * (pride - 50)) / 50)), Math.max(0, target + sc.squad.slack - kept.length));
    for (let i = 0; i < intake; i++) {
      const need = missing();
      addYouth(need.length > 0 ? rng.choose(need) : rng.weighted([...new Set(wanted)], (p) => world.placesByPosition[p]), false);
    }

    // livres para o que falta
    for (const position of missing().slice(0, Math.max(0, target - kept.length))) {
      if (o.gamerClub !== club.id) {
        const bought = buyAbroad(repo, params, abroadCtx, abroadPool, club, tier, wageScale, desired, position, years(rng));
        if (bought) {
          counts.set(position, (counts.get(position) ?? 0) + 1);
          kept.push(member(bought));
          continue;
        }
      }
      let best = -1;
      let bestGap = Infinity;
      pool.forEach((m, i) => {
        if (m.position !== position) return;
        const gap = Math.abs(m.quality - desired) + sc.youth.agePenalty * focus * Math.max(0, age(m.record) - 26);
        if (Math.abs(m.quality - desired) > sc.squad.freeAgentTolerance) return;
        if (gap < bestGap || (gap === bestGap && best >= 0 && m.record.person < (pool[best] as Member).record.person)) {
          best = i;
          bestGap = gap;
        }
      });
      if (best < 0) {
        addYouth(position, true);
        continue;
      }
      const [m] = pool.splice(best, 1) as [Member];
      const y = years(rng);
      const contract: ContractRecord = { person: m.record.person, club: club.id, monthlyWage: wageFor(params, tier, m.quality, wageScale), ...contractDates(o.seasonStart, y) };
      repo.updatePlayer(m.record.person, { club: club.id, state: "active" });
      repo.saveContract(contract);
      event("PLAYER_SIGNED", m.record.person, club.id, { from: "free", wage: contract.monthlyWage, years: y });
      counts.set(position, (counts.get(position) ?? 0) + 1);
      kept.push(member({ ...m.record, club: club.id, state: "active" }));
      summary.signedFree++;
    }
    rooms.push({ club, tier, target, desired, wageScale, kept, counts, missing, rng });
  }
  // 2.ª fase: os jovens que a terra não quis vão tentar a sorte noutras cidades, onde um clube tenha lugar e o nível sirva (melhores primeiro)
  for (const m of [...prospects].sort((a, b) => b.quality - a.quality || (a.record.person < b.record.person ? -1 : 1))) {
    const home = homeCity(m.record.person);
    const homeDistrict = data.cities.find((c) => c.id === home)?.district;
    let best: (typeof rooms)[number] | undefined;
    let bestScore = Infinity;
    for (const r of rooms) {
      if (r.club.id === o.gamerClub || r.club.city === home || r.kept.length >= r.target + sc.squad.slack || !r.missing().includes(m.position)) continue;
      const gap = Math.abs(m.quality - (r.desired - Math.max(0, world.peakAge - 3 - 17) * 0.35));
      if (gap > sc.squad.freeAgentTolerance) continue;
      const score = gap + (r.club.district === homeDistrict ? 0 : 0.8);
      if (score < bestScore) { best = r; bestScore = score; }
    }
    if (!best) continue;
    const r = best;
    prospects.splice(prospects.indexOf(m), 1);
    const y = years(r.rng);
    const contract: ContractRecord = { person: m.record.person, club: r.club.id, monthlyWage: wageFor(params, r.tier, clamp(m.quality, 1, 20), r.wageScale), ...contractDates(o.seasonStart, y) };
    repo.updatePlayer(m.record.person, { club: r.club.id, trainedAt: r.club.id, state: "active" });
    repo.saveContract(contract);
    event("PLAYER_SIGNED", m.record.person, r.club.id, { from: "luck", wage: contract.monthlyWage, years: y });
    r.counts.set(m.position, (r.counts.get(m.position) ?? 0) + 1);
    r.kept.push(member({ ...m.record, club: r.club.id, trainedAt: r.club.id, state: "active" }));
    summary.youth++;
    summary.prospectsAway++;
  }
  // quem ninguém quis sai do futebol; nasce a geração seguinte
  for (const m of prospects) repo.updatePlayer(m.record.person, { state: "retired" });
  pruneLocks(repo, o.seasonStart);
  updateYouthLevels(repo, data, params);
  const cohort = newProspects(data, params, { season: o.season, seasonStart: o.seasonStart, seed, nextId: newId, education: (city) => cityStateNow(repo, data, params, city)?.education });
  batch.people.push(...cohort.people);
  batch.players.push(...cohort.players);
  // a caixa de entrada do gamer avisa dos jovens livres que apareceram na cidade do clube
  const gamerCity = o.gamerClub ? data.clubs.find((c) => c.id === o.gamerClub)?.city : undefined;
  const ofCity = gamerCity ? cohort.people.filter((x) => x.birthCity === gamerCity) : [];
  if (o.gamerClub && gamerCity && ofCity.length > 0) {
    repo.appendEvent({ type: "TALENT_APPEARED", date, season: o.season, visibility: "exposed", origin: "generated", entities: [{ k: "club", id: o.gamerClub }, { k: "city", id: gamerCity }], data: { n: ofCity.length, clubs: data.clubs.filter((c) => c.city === gamerCity).length } });
  }
  rolloverForeign(repo, params, { season: o.season, seasonStart: o.seasonStart }, batch, newId);
  if (batch.people.length > 0) repo.addPeople(batch);
  // a caixa de entrada do gamer avisa dos recrutas da formação (os de urgência não contam: são tapa-buracos)
  if (o.gamerClub && newYouth.length > 0) {
    repo.appendEvent({ type: "YOUTH_INTAKE", date, season: o.season, visibility: "exposed", origin: "generated", entities: [{ k: "club", id: o.gamerClub }, ...newYouth.map((id) => ({ k: "person" as const, id, roleKind: "youth" }))], data: { n: newYouth.length } });
  }
  repo.setMeta(`rollover.${o.season}`, JSON.stringify(summary));
  return summary;
}
