/**
 * Fim de época (RZ-159; docs/DESIGN_RULES.md §2). Corre sozinho depois da última jornada:
 * 1. As distritais acabam → gera-se a Fase de Promoção com os 20 campeões (4 grupos de 5, uma volta, em maio-junho).
 * 2. Acabada a Fase de Promoção → classificações finais, movimentos entre escalões, calendário da época seguinte.
 * O Prémio do Estado entra com as finanças (RZ-112); o reajuste das distritais com RZ-113.
 */
import { createDate } from "../calendar/dates";
import type { Params } from "../config/parameters";
import type { BaseData, CpSeries } from "../data/types";
import { cityStateNow, evolveCities } from "../city/cities";
import { mayorOf } from "../council/agenda";
import { closeRelation } from "../council/relation";
import type { ClubsResults } from "../city/evolution";
import { competitionTable } from "../competition/table";
import type { Repository } from "../persistence/repository";
import type { IsoDate } from "../persistence/types";
import { groupCalendar, rankGroup, buildGroups, groupPromoted } from "./promotionPhase";
import { applyMovements, SERIES, type Movement } from "./movements";
import { saveParameters } from "./saveYear";
import { cpChampionOf } from "./cpFinalPhase";
import { blockedSundays, planNextSeasonCups, promotionDates } from "./competitions";
import { sackByRelegation } from "./coachMarket";
import { adjustDistricts, isInSecondDistrict, type SecondDistrict } from "./districts";
import { closeUntilMonths, post } from "../club/finances";
import { districtFactors, prizeValue, type PrizeType } from "./competitionPrizes";
import { consecutiveYears, winnersPerDistrict, type RankedClub } from "./statePrize";
import { seasonData, savePyramid, readPyramid, pyramidLeagues } from "./seasonPyramid";
import { rolloverSquads } from "../squad/rollover";
import { assignAgents } from "../agent/assign";
import { Rng } from "../random/rng";
import { rolloverCompanies } from "../company/cycle";
import { promotionGroupName, promotionGroups, prepareSeason } from "./prepare";
import { coachSeasonEnd } from "../club/coaches";
import { staffSuccession } from "../people/succession";
import { staffSeasonEnd } from "../club/staff";
import { reputationData, updateReputations, type SeasonFinish } from "../club/reputationCycle";
import { CUP, cupResult } from "./competitions";
import { EUROPE_NAME, EUROPEAN } from "../europe/europe";
import { isForeignClub } from "../world/foreign";

export type SeasonSummary = {
  season: number;
  champions: { league: string; club: string; name: string }[];
  movements: (Movement & { name: string })[];
  warnings: string[];
};

const districtSeries = (data: BaseData) => (d: string): CpSeries => data.districts.find((x) => x.id === d || x.name === d)?.cpSeries ?? "A";

/** Gera a Fase de Promoção (calendário gravado) quando as ligas acabaram. Devolve os grupos. */
export function generatePromotionPhase(repo: Repository, data: BaseData, paramsBase: Params, season: number) {
  const params = saveParameters(repo, paramsBase);
  const seed = repo.meta("seed") ?? "?";
  const rep = new Map(data.clubs.map((c) => [c.id, c.reputation] as const));
  const champions = [...new Set(data.clubs.filter((c) => c.tier === "district" && !isInSecondDistrict(c.league)).map((c) => c.league))].flatMap((league) => {
    const table = competitionTable(repo, league, season, "promotion", params, { seed, reputation: rep });
    const club = table[0]?.club;
    return club ? [{ club, district: data.clubs.find((c) => c.id === club)!.district }] : [];
  });
  const { groups } = buildGroups(champions, districtSeries(data), params);
  const promoRounds = Math.max(...groups.filter((x) => x.clubs.length >= 2).map((g) => groupCalendar(g, season, seed, params).length), 0);
  const dates = promotionDates(promoRounds, season, params, blockedSundays(repo, season));
  repo.transaction(() => {
    for (const g of groups.filter((x) => x.clubs.length >= 2)) {
      const pairings = groupCalendar(g, season, seed, params);
      const comp = promotionGroupName(g.series);
      const matches = pairings.flatMap((r, i) => r.matches.map((j) => ({ id: `e${season}-promocao-${g.series}-j${i + 1}-${j.home}`, competition: comp, season, round: i + 1, date: dates[i] as IsoDate, home: j.home, away: j.away })));
      const byes = pairings.flatMap((r, i) => (r.bye ? [{ competition: comp, season, round: i + 1, club: r.bye }] : []));
      repo.saveCalendar(matches, byes);
    }
    repo.setMeta(`promotion.${season}`, JSON.stringify(groups));
  });
  return groups;
}

/** Fecha a época: classificações finais → movimentos → eventos → nova época com calendários. */
export function closeSeason(repo: Repository, data: BaseData, paramsBase: Params, season: number): SeasonSummary {
  const params = saveParameters(repo, paramsBase);
  const seed = repo.meta("seed") ?? "?";
  const today = repo.meta("date.today") as IsoDate;
  const rep = new Map(data.clubs.map((c) => [c.id, c.reputation] as const));
  const name = new Map(data.clubs.map((c) => [c.id, c.name] as const));
  const current = readPyramid(repo, data, season);
  const leagues = pyramidLeagues(current, data);
  const leagueName = (club: string) => leagues.get(club)?.league ?? "";
  const order = (league: string, type: "league" | "promotion") => competitionTable(repo, league, season, type, params, { seed, reputation: rep }).map((l) => l.club);
  const league = (c: string[]) => leagueName(c[0] as string);
  const first = order(league(current.first), "league");
  const second = order(league(current.second), "league");
  const third = order(league(current.third), "league");
  const cp = Object.fromEntries(SERIES.map((s) => [s, order(`CP Série ${s}`, "promotion")])) as Record<CpSeries, string[]>;
  const groupsWinners: string[] = [];
  const promoted = (promotionGroups(repo, season) ?? []).flatMap((g) => {
    const matches = repo.competitionMatches(promotionGroupName(g.series), season).map((j) => ({ home: j.home, away: j.away, homeGoals: j.homeGoals, awayGoals: j.awayGoals }));
    const order = rankGroup(g, matches, season, seed, params, rep);
    if (matches.length > 0 && order[0]) groupsWinners.push(order[0]);
    return groupPromoted(g, order, params);
  });
  const ctx = { districtOf: (c: string) => data.clubs.find((x) => x.id === c)!.district, districtSeries: districtSeries(data) };
  const r = applyMovements(current, { first, second, third, cp, promotionPhasePromoted: promoted }, params, ctx);

  // Prémio do Estado (passo 2 do DESIGN_REGRAS §2): sobre as classificações finais, antes de qualquer movimento
  const ranked: RankedClub[] = [];
  const finish: SeasonFinish[] = [];
  const competitions = new Map([...leagues.values()].map((l) => [l.league, l.tier] as const));
  for (const [competition, tier] of competitions) {
    const table = competitionTable(repo, competition, season, tier === "cp" || tier === "district" ? "promotion" : "league", params, { seed, reputation: rep });
    for (const l of table) {
      const cd = data.clubs.find((x) => x.id === l.club);
      if (cd) finish.push({ club: l.club, tier, position: l.position, size: table.length });
      if (cd) ranked.push({ club: l.club, district: cd.district, tier, position: l.position, matches: l.matches, points: l.points, difference: l.difference, scoredGoals: l.scoredGoals, reputation: cd.reputation });
    }
  }
  const winners = winnersPerDistrict(ranked);
  const cityOf0 = new Map(data.clubs.map((c) => [c.id, c.city] as const));

  // Distritais de tamanho variável e segunda distrital (RZ-113): depois dos movimentos, ajusta-se cada distrito a [min, max]
  const secondRaw = repo.meta("secondDistrict");
  const secondBefore: SecondDistrict = secondRaw ? (JSON.parse(secondRaw) as SecondDistrict) : {};
  const districtsFinal: Record<string, string[]> = {};
  for (const x of [...ranked].filter((c) => c.tier === "district").sort((a, b) => a.position - b.position)) (districtsFinal[x.district] ??= []).push(x.club);
  const cpRelegated = new Set(r.movements.filter((m) => m.from.startsWith("cp-") && m.to.startsWith("district-")).map((m) => m.club));
  const adjustment = adjustDistricts(r.pyramid.districtLeagues, { final: districtsFinal, protected: cpRelegated, second: secondBefore, season }, params);
  r.pyramid.districtLeagues = adjustment.districtLeagues;
  r.warnings.push(...adjustment.warnings);

  const champions = [first, second, third, ...SERIES.map((s) => cp[s])].map((t) => ({ league: leagueName(t[0] as string), club: t[0] as string, name: name.get(t[0] as string) ?? "" }));
  const cpChampion = cpChampionOf(repo, season);
  repo.transaction(() => {
    // o título já anunciado quando ficou matematicamente decidido não se repete
    const announced = (league: string) => repo.eventsOf({ k: "competition", id: league }, { type: "CHAMPION", seasonSince: season, untilSeason: season, limit: 1 }).length > 0;
    for (const c of champions) if (!announced(c.league)) repo.appendEvent({ type: "CHAMPION", date: today, season, visibility: "exposed", origin: "match", entities: [{ k: "club", id: c.club, roleKind: "champion" }, { k: "competition", id: c.league }], data: { league: c.league } });
    if (cpChampion) repo.appendEvent({ type: "CHAMPION", date: today, season, visibility: "exposed", origin: "match", entities: [{ k: "club", id: cpChampion, roleKind: "champion" }, { k: "competition", id: "Campeonato de Portugal" }], data: { league: "Campeonato de Portugal" } });
    // prémio por vencer cada competição (RZ-216)
    const factors = districtFactors(data.cities, params);
    const districtOf2 = new Map(data.clubs.map((c) => [c.id, c.district] as const));
    const award = (type: PrizeType, club: string, competition: string, district?: string) => {
      const factor = district ? factors.get(district) ?? 1 : 1;
      const city = cityOf0.get(club);
      const value = prizeValue(type, params, factor);
      const cb = data.clubs.find((x) => x.id === club);
      if (cb) post(repo, cb, "prizes", value);
      repo.appendEvent({ type: "COMPETITION_PRIZE", date: today, season, visibility: "exposed", origin: "match", entities: [{ k: "club", id: club, roleKind: "awarded" }, { k: "competition", id: competition }, ...(city ? [{ k: "city" as const, id: city, roleKind: "host" }] : [])], data: { competition, type, value, districtFactor: district ? factor : undefined, position: 1 } });
    };
    const leagueType: PrizeType[] = ["firstLeague", "secondLeague", "thirdLeague", "cpSeries", "cpSeries", "cpSeries", "cpSeries"];
    champions.forEach((c, i) => award(leagueType[i] as PrizeType, c.club, c.league));
    if (cpChampion) award("cpWinner", cpChampion, "Campeonato de Portugal");
    for (const [district, table] of Object.entries(districtsFinal)) if (table[0]) award("district", table[0], `Distrital ${district}`, district);
    for (const c of groupsWinners) award("promotionPhase", c, "Fase de Promoção", districtOf2.get(c));
    for (const m of r.movements) {
      const target = m.to.startsWith("cp-") ? `CP Série ${m.to.slice(3)}` : m.to;
      repo.appendEvent({ type: m.reason === "relegation" ? "RELEGATION" : "PROMOTION", date: today, season, visibility: "exposed", origin: "match", entities: [{ k: "club", id: m.club }], data: { from: m.from, to: target, reason: m.reason } });
    }
    for (const p of winners) {
      const rowKey = `prize.${p.district}`;
      const previous = repo.meta(rowKey) ? (JSON.parse(repo.meta(rowKey) as string) as { club: string; consecutive: number }) : undefined;
      const consecutive = consecutiveYears(previous, p.club);
      repo.setMeta(rowKey, JSON.stringify({ club: p.club, consecutive, season }));
      const city = cityOf0.get(p.club);
      const cbp = data.clubs.find((x) => x.id === p.club);
      if (cbp) post(repo, cbp, "prizes", params.prizes.club);
      repo.appendEvent({ type: "STATE_PRIZE", date: today, season, visibility: "exposed", origin: "match", entities: [{ k: "club", id: p.club, roleKind: "awarded" }, ...(city ? [{ k: "city" as const, id: city, roleKind: "council" }] : [])], data: { district: p.district, clubValue: params.prizes.club, cityValue: params.prizes.city, consecutive } });
    }
    // Supertaça da época seguinte: campeão da Primeira Liga contra o vencedor da Taça (RZ-141)
    planNextSeasonCups(repo, season, first[0], Object.fromEntries(Object.entries(districtsFinal).flatMap(([d, t]) => (t[0] ? [[d, t[0]]] : []))));
    repo.setMeta("secondDistrict", JSON.stringify(adjustment.second));
    for (const a of adjustment.adjustments) repo.appendEvent({ type: a.type === "relegation" ? "SECOND_DISTRICT_RELEGATION" : "DISTRICT_RETURN", date: today, season, visibility: "exposed", origin: "match", entities: [{ k: "club", id: a.club }], data: { district: a.district } });
    // as cidades reagem aos resultados dos clubes e ao que lhes acontece (RZ-133)
    const cityOf = new Map(data.clubs.map((c) => [c.id, c.city] as const));
    const results = new Map<string, ClubsResults>();
    const add = (club: string, pitch: keyof ClubsResults) => {
      const city = cityOf.get(club);
      if (city) results.set(city, { champions: 0, promotions: 0, relegations: 0, ...results.get(city), [pitch]: (results.get(city)?.[pitch] ?? 0) + 1 });
    };
    for (const [i, c] of champions.entries()) { add(c.club, "champions"); if (i === 0) add(c.club, "champions"); }
    for (const m of r.movements) {
      add(m.club, m.reason === "relegation" ? "relegations" : "promotions");
      // subir à Primeira Liga ou descer dela pesa o dobro na cidade
      if (m.to === "first" || m.from === "first") add(m.club, m.reason === "relegation" ? "relegations" : "promotions");
    }
    evolveCities(repo, data, params, season, today, results);
    // a relação do gamer com o autarca: o clube que dá orgulho à cidade agrada-lhe (RZ-236)
    const ownClub = data.clubs.find((c) => c.id === repo.meta("gamer.club"));
    const ownMayor = ownClub ? mayorOf(repo, data, ownClub.city) : undefined;
    if (ownClub && ownMayor) closeRelation(repo, params, ownMayor.person, cityStateNow(repo, data, params, ownClub.city)?.pride ?? 50);
    // plantéis: envelhecer, reformas, contratos, livres e formação para a nova época (RZ-117)
    const newSeasonStart = createDate(params.calendar.initialYear + season, params.calendar.seasonStartMonth, 1);
    const nextTiers = new Map([...pyramidLeagues(r.pyramid, data)].map(([club, l]) => [club, l.tier] as const));
    // reputação da época seguinte: sobe e desce com o que cada clube alcançou (RZ-270)
    const european = new Set<string>();
    for (const kind of EUROPEAN) for (const m of repo.competitionMatches(EUROPE_NAME[kind], season)) for (const id of [m.home, m.away]) if (!isForeignClub(id)) european.add(id);
    const cupWinner = cupResult(repo, season, CUP).winner;
    const europeWinner = cupResult(repo, season, EUROPE_NAME.championsLeague).winner;
    updateReputations(repo, data.clubs, params, {
      season, finish, champions: [...champions.map((c) => c.club), ...(cpChampion ? [cpChampion] : [])],
      tier: new Map([...leagues].map(([club, l]) => [club, l.tier] as const)), nextTier: nextTiers,
      cupWinners: cupWinner ? [cupWinner] : [], europe: { played: [...european], ...(europeWinner && !isForeignClub(europeWinner) ? { winner: europeWinner } : {}) },
    });
    // objetivos falhados: a direção despede os treinadores de quem desceu ou ficou muito abaixo do esperado (RZ-210)
    coachSeasonEnd(repo, data, params, season, today, finish, nextTiers, repo.meta("gamer.club") || undefined);
    // staff que chega à idade da reforma sai e entra gente nova (treinadores novos entram livres)
    staffSuccession(repo, data, params, season, today);
    staffSeasonEnd(repo, data, params, season, today, nextTiers, repo.meta("gamer.club") || undefined);
    const next = reputationData(repo, data, season + 1);
    const gamerClub = repo.meta("gamer.club");
    rolloverSquads(repo, next, params, { season, seasonStart: newSeasonStart, tiers: nextTiers, ...(gamerClub ? { gamerClub } : {}) });
    // agentes para os novos jogadores (formação e livres contratados) (RZ-206)
    assignAgents(repo, new Rng(repo.meta("seed") ?? "?", `agents/${season}`), params, (club) => nextTiers.get(club));
    // empresas: evolução, falências, novas e patrocínios do clube para a nova época (RZ-219, RZ-311)
    rolloverCompanies(repo, next, params, { season, seasonStart: newSeasonStart, year: params.calendar.initialYear + season, tiers: nextTiers, previousTiers: new Map([...leagues].map(([club, l]) => [club, l.tier] as const)) });
    savePyramid(repo, season + 1, r.pyramid);
    repo.setMeta("season", String(season + 1));
    repo.setMeta("date.today", newSeasonStart);
  });
  prepareSeason(repo, seasonData(repo, data), paramsBase);
  // os meses sem jogos (junho, julho) também pagam custos
  closeUntilMonths(repo, seasonData(repo, data), params, repo.meta("date.today") as IsoDate, season + 1, (c) => !isInSecondDistrict(c.league));
  // o clube do gamer que desceu à segunda distrital é despedido (deixa de ser jogável até voltar à pirâmide)
  const gamer = repo.meta("gamer.club");
  if (gamer && adjustment.adjustments.some((a) => a.type === "relegation" && a.club === gamer)) sackByRelegation(repo, seasonData(repo, data), params, gamer, repo.meta("date.today") as IsoDate, season);
  return { season, champions, movements: r.movements.map((m) => ({ ...m, name: name.get(m.club) ?? m.club })), warnings: r.warnings };
}
