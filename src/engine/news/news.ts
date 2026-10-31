/**
 * Notícias e caixa de entrada (RZ-118; docs/TONE_AND_UX.md, docs/EVENT_HISTORY.md §4). Tudo sai dos eventos públicos do
 * histórico — nada se grava à parte, por isso as notícias são sempre reconstruíveis. O motor devolve dados estruturados
 * (tipo, variante, valores, ligações); quem traduz e escreve a frase é a interface (pt-PT e inglês), com o tom realista da
 * imprensa desportiva. A variante escolhe-se pelo id do evento (estável: a mesma notícia lê-se sempre igual).
 */
import type { BaseData } from "../data/types";
import { foreignClubList } from "../squad/foreign";
import type { Repository } from "../persistence/repository";
import { reputationData } from "../club/reputationCycle";
import { currentSeason } from "../season/seasonPyramid";
import type { HistoryEvent } from "../persistence/types";
import type { IsoDate } from "../persistence/types";

export type NewsItemType =
  | "hattrick" | "red" | "two_yellows" | "rout" | "comeback_goal" | "stoppage_goal" | "serious_injury"
  | "champion" | "title_clinched" | "cup_upset" | "state_prize" | "promotion" | "relegation" | "second_district" | "district_return" | "locality" | "city_event"
  | "outcome" | "injury" | "resignation" | "sacked" | "sacked_results" | "contract_end" | "objective_met" | "objective_missed" | "signed" | "scout_report" | "scout_search" | "transfer" | "transfer_free" | "transfer_offer" | "loan_offer" | "youth_offer" | "council_reply" | "election_campaign" | "election_result" | "patron_offer" | "bid_agreed" | "bid_rejected" | "bid_progress" | "youth_intake" | "local_talent" | "market_open" | "market_close" | "club_offer"
  | "coach_sacked" | "coach_hired" | "staff_retired" | "staff_hired" | "staff_dismissed" | "staff_moved" | "stadium_works" | "stadium_opened"
  | "europe_qualified" | "europe_draw" | "europe_phase" | "europe_qualifier";

type NewsItemLink = { k: "club" | "person" | "locality" | "competition" | "city"; id: string; name: string };

export type NewsItem = {
  /** Id do evento que a originou. */
  id: number;
  date: IsoDate;
  season: number;
  type: NewsItemType;
  /** 1…VARIANTES[tipo]: qual das frases usar. */
  variant: number;
  values: Record<string, string | number>;
  links: NewsItemLink[];
  /** Envolve o clube do gamer. */
  ofClubYour: boolean;
};

export type Message = NewsItem & { isRead: boolean };

/** Quantas variantes de texto existem por tipo (a interface tem as frases `noticia.<tipo>.<n>.titulo|corpo`). */
export const VARIANTS: Record<NewsItemType, number> = {
  hattrick: 2, red: 2, two_yellows: 2, rout: 2, comeback_goal: 2, stoppage_goal: 2, serious_injury: 2,
  champion: 2, title_clinched: 2, cup_upset: 2, state_prize: 2, promotion: 2, relegation: 2, second_district: 1, district_return: 1, locality: 1, city_event: 1, outcome: 2, injury: 2, resignation: 1, sacked: 1, sacked_results: 1, contract_end: 1, objective_met: 1, objective_missed: 1, signed: 1, scout_report: 1, scout_search: 1, transfer: 2, transfer_free: 1, transfer_offer: 1, loan_offer: 1, youth_offer: 1, council_reply: 1, election_campaign: 1, election_result: 1, patron_offer: 1, bid_agreed: 1, bid_rejected: 1, bid_progress: 1, youth_intake: 1, local_talent: 1, market_open: 1, market_close: 1, club_offer: 1, coach_sacked: 1, coach_hired: 1, staff_retired: 1, staff_hired: 1, staff_dismissed: 1, staff_moved: 1, stadium_works: 1, stadium_opened: 1, europe_qualified: 1, europe_draw: 1, europe_phase: 1, europe_qualifier: 1,
};

/** Tipos de evento que dão notícia para toda a gente. */
const NEWS_ITEM_EVENTS = ["HATTRICK", "RED_CARD", "ROUT", "NOTABLE_GOAL", "INJURY", "CHAMPION", "CUP_UPSET", "STATE_PRIZE", "SECOND_DISTRICT_RELEGATION", "DISTRICT_RETURN", "PROMOTION", "RELEGATION", "LOCALITY_STATUS", "CITY_EVENT", "TRANSFER", "PLAYER_SIGNED", "EUROPE_QUALIFIED", "EUROPE_DRAW", "EUROPE_LEAGUE_PHASE", "EUROPE_QUALIFIER", "COACH_SACKED", "COACH_HIRED", "STAFF_RETIRED", "STAFF_HIRED", "STAFF_DISMISSED", "STAFF_MOVED", "STADIUM_WORKS_STARTED", "STADIUM_WORKS_DONE"] as const;
/** A caixa de entrada junta o que é pessoal: o resultado do teu jogo, qualquer lesão do teu plantel, a tua carreira. */
const INBOX_EVENTS = [...NEWS_ITEM_EVENTS, "MATCH_PLAYED", "GAMER_RESIGNATION", "GAMER_HIRED", "GAMER_OBJECTIVE", "SCOUT_REPORT", "SCOUT_SEARCH", "TRANSFER_OFFER", "COUNCIL_REPLY", "ELECTION_CAMPAIGN", "ELECTION_RESULT", "PATRON_OFFER", "BID_REPLY", "YOUTH_INTAKE", "TALENT_APPEARED", "MARKET_WINDOW", "CLUB_OFFER"] as const;
/** Lesões a partir desta gravidade são notícia no mundo; no teu plantel, todas. */
const NEWS_ITEM_SEVERITY = 4;

export type NewsScope = "club" | "league" | "world" | "relevant";

type Context = {
  repo: Repository;
  data: BaseData;
  club?: string;
  league?: string;
  /** O gamer já não está no clube: só vê o que sai na imprensa (nada de resultados nem lesões internas). */
  external?: boolean;
  /** Ids dos eventos JOGO_JOGADO contra rivais (RZ-174): só estes resultados vão para a caixa. */
  rivals?: ReadonlySet<number>;
  clubName: (id: string) => string;
  personName: (id: string) => string;
};

const LOCAL_TIER: Record<string, string> = { first: "firstLeague", second: "secondLeague", third: "thirdLeague" };

/** Nome da divisão a partir do código de `movimentos.ts` (primeira, cp-A, district-Braga). */
function localName(local: string, data: BaseData): string {
  if (local.startsWith("cp-")) return `CP Série ${local.slice(3)}`;
  if (local.startsWith("district-")) {
    const d = local.slice(10);
    return data.clubs.find((c) => c.tier === "district" && (c.district === d || c.league.endsWith(d)))?.league ?? `Distrital ${d}`;
  }
  const tier = LOCAL_TIER[local];
  return data.clubs.find((c) => c.tier === tier)?.league ?? local;
}

const roleKind = (e: HistoryEvent, k: string, p?: string) => e.entities.find((x) => x.k === k && (p === undefined || x.roleKind === p));

function build(e: HistoryEvent, c: Context, inboxOnly: boolean): NewsItem | undefined {
  const clubs = e.entities.filter((x) => x.k === "club");
  const our = c.club !== undefined && !c.external && clubs.some((x) => x.id === c.club);
  const base = (type: NewsItemType, values: Record<string, string | number>, links: NewsItemLink[]): NewsItem => ({
    id: e.id, date: e.date, season: e.season, type, variant: (e.id % VARIANTS[type]) + 1, values, links, ofClubYour: our,
  });
  const lc = (id: string): NewsItemLink => ({ k: "club", id, name: c.clubName(id) });
  const lp = (id: string): NewsItemLink => ({ k: "person", id, name: c.personName(id) });
  const d = e.data as Record<string, unknown>;
  const within = (x: unknown) => (typeof x === "number" ? x : 0);
  const person = e.entities.find((x) => x.k === "person");
  const club = clubs[0];
  switch (e.type) {
    case "HATTRICK":
      return person && club ? base("hattrick", { player: c.personName(person.id), club: c.clubName(club.id), goals: within(d.goals) }, [lp(person.id), lc(club.id)]) : undefined;
    case "RED_CARD": {
      if (!person || !club) return undefined;
      const type: NewsItemType = d.secondYellow ? "two_yellows" : "red";
      return base(type, { player: c.personName(person.id), club: c.clubName(club.id), minute: Math.floor(within(d.minute)) }, [lp(person.id), lc(club.id)]);
    }
    case "ROUT": {
      const v = roleKind(e, "club", "winner");
      const x = roleKind(e, "club", "beaten");
      return v && x ? base("rout", { winner: c.clubName(v.id), beaten: c.clubName(x.id), winnerGoals: within(d.winnerGoals), beatenGoals: within(d.beatenGoals) }, [lc(v.id), lc(x.id)]) : undefined;
    }
    case "NOTABLE_GOAL": {
      if (!person || !club) return undefined;
      const type: NewsItemType = d.reason === "turnaround" ? "comeback_goal" : "stoppage_goal";
      return base(type, { player: c.personName(person.id), club: c.clubName(club.id), minute: Math.floor(within(d.minute)), homeGoals: within(d.homeGoals), awayGoals: within(d.awayGoals) }, [lp(person.id), lc(club.id)]);
    }
    case "INJURY": {
      if (!person || !club) return undefined;
      const serious = within(d.severity) >= NEWS_ITEM_SEVERITY;
      const type: NewsItemType | undefined = inboxOnly && our ? "injury" : serious ? "serious_injury" : undefined;
      if (!type) return undefined;
      return base(type, { player: c.personName(person.id), club: c.clubName(club.id), days: within(d.days), severity: within(d.severity) }, [lp(person.id), lc(club.id)]);
    }
    case "CHAMPION":
      return club ? base(d.clinched === true ? "title_clinched" : "champion", { club: c.clubName(club.id), league: String(d.league ?? "") }, [lc(club.id)]) : undefined;
    case "CUP_UPSET": {
      const v = roleKind(e, "club", "winner");
      const x = roleKind(e, "club", "beaten");
      return v && x ? base("cup_upset", { winner: c.clubName(v.id), beaten: c.clubName(x.id), competition: String(d.competition ?? ""), round: String(d.round ?? ""), penalties: d.penalties === true ? 1 : 0, winnerGoals: within(d.winnerGoals), beatenGoals: within(d.beatenGoals) }, [lc(v.id), lc(x.id)]) : undefined;
    }
    case "STATE_PRIZE": {
      if (!club) return undefined;
      const council = e.entities.find((x) => x.k === "city");
      const city = council ? c.data.cities.find((x) => x.id === council.id)?.name ?? council.id : "";
      return base("state_prize", { club: c.clubName(club.id), district: String(d.district ?? ""), value: within(d.clubValue), consecutive: within(d.consecutive), city }, [lc(club.id), ...(council ? [{ k: "city" as const, id: council.id, name: city }] : [])]);
    }
    case "SECOND_DISTRICT_RELEGATION": case "DISTRICT_RETURN":
      return club ? base(e.type === "DISTRICT_RETURN" ? "district_return" : "second_district", { club: c.clubName(club.id), district: String(d.district ?? "") }, [lc(club.id)]) : undefined;
    case "EUROPE_QUALIFIED": case "EUROPE_DRAW": case "EUROPE_LEAGUE_PHASE": case "EUROPE_QUALIFIER": {
      if (!club) return undefined;
      const competition = String(d.competition ?? "");
      const name = (id: string) => c.data.clubs.find((x) => x.id === id)?.name ?? foreignClubList(c.repo).find((x) => x.id === id)?.name ?? id;
      const opponents = Array.isArray(d.opponents) ? (d.opponents as string[]).map(name).join(", ") : "";
      const type = e.type === "EUROPE_QUALIFIED" ? "europe_qualified" : e.type === "EUROPE_DRAW" ? "europe_draw" : e.type === "EUROPE_QUALIFIER" ? "europe_qualifier" : "europe_phase";
      return base(type, { club: c.clubName(club.id), competition, opponents, position: within(d.position), zone: String(d.zone ?? ""), opponent: name(String(d.opponent ?? "")), won: d.won === true ? 1 : 0 }, [lc(club.id)]);
    }
    case "PROMOTION": case "RELEGATION":
      return club ? base(e.type === "PROMOTION" ? "promotion" : "relegation", { club: c.clubName(club.id), league: localName(String(d.to ?? ""), c.data) }, [lc(club.id)]) : undefined;
    case "CITY_EVENT": {
      const cities = e.entities.filter((x) => x.k === "city");
      if (cities.length === 0) return undefined;
      const cityName = (id: string) => c.data.cities.find((x) => x.id === id)?.name ?? id;
      const regional = d.regional === true;
      const links = (regional ? cities.slice(0, 4) : cities).map((x): NewsItemLink => ({ k: "city" as const, id: x.id, name: cityName(x.id) }));
      return base("city_event", { event: String(d.event ?? ""), city: regional ? String(d.hub ?? "") : cityName(cities[0]!.id), regional: regional ? 1 : 0 }, links);
    }
    case "LOCALITY_STATUS": {
      const l = roleKind(e, "locality");
      if (!l) return undefined;
      const name = c.data.localities.find((x) => x.id === l.id)?.name ?? l.id;
      return base("locality", { locality: name, from: String(d.from ?? ""), to: String(d.to ?? "") }, [{ k: "locality", id: l.id, name }]);
    }
    case "MATCH_PLAYED": {
      if (!inboxOnly || !our || !c.club) return undefined;
      if (c.rivals && !c.rivals.has(e.id)) return undefined;
      const home = roleKind(e, "club", "home");
      const away = roleKind(e, "club", "away");
      if (!home || !away) return undefined;
      const gc = within(d.homeGoals);
      const gf = within(d.awayGoals);
      const ownSquad = home.id === c.club ? gc : gf;
      const their = home.id === c.club ? gf : gc;
      const competition = roleKind(e, "competition");
      return base("outcome", { home: c.clubName(home.id), away: c.clubName(away.id), homeGoals: gc, awayGoals: gf, outcome: ownSquad > their ? "win" : ownSquad === their ? "draw" : "defeat", competition: competition?.id ?? "" }, [lc(home.id), lc(away.id)]);
    }
    case "COACH_SACKED": case "COACH_HIRED": case "STAFF_RETIRED": {
      // mexidas de treinadores: notícia no teu clube e nas duas primeiras divisões (as restantes ficam só no histórico)
      const big = clubs.some((x) => { const t = c.data.clubs.find((b) => b.id === x.id)?.tier; return t === "firstLeague" || t === "secondLeague"; });
      if (!our && !big) return undefined;
      if (e.type === "STAFF_RETIRED") {
        const fn = typeof d.fn === "string" ? d.fn : "";
        if (!person || !club || (fn !== "coach" && fn !== "president")) return undefined;
        return base("staff_retired", { name: c.personName(person.id), fn, club: c.clubName(club.id), age: within(d.age) }, [lp(person.id), lc(club.id)]);
      }
      if (!person) return undefined;
      const hirer = clubs.find((x) => x.roleKind === (e.type === "COACH_SACKED" ? "sacked" : "hirer"));
      if (!hirer) return undefined;
      if (e.type === "COACH_SACKED") return base("coach_sacked", { coach: c.personName(person.id), club: c.clubName(hirer.id), reason: typeof d.reason === "string" ? d.reason : "results" }, [lp(person.id), lc(hirer.id)]);
      const from = clubs.find((x) => x.roleKind === "from");
      return base("coach_hired", { coach: c.personName(person.id), club: c.clubName(hirer.id), from: from ? c.clubName(from.id) : "" }, [lp(person.id), lc(hirer.id), ...(from ? [lc(from.id)] : [])]);
    }
    case "STAFF_HIRED": case "STAFF_DISMISSED": case "STAFF_MOVED": {
      // mexidas de staff só interessam no teu clube (contratação, saída, ou aliciamento por outro clube)
      if (!our || !person || !club) return undefined;
      const fn = typeof d.fn === "string" ? d.fn : "";
      const name = c.personName(person.id);
      if (e.type === "STAFF_HIRED") return base("staff_hired", { name, fn, club: c.clubName(club.id) }, [lp(person.id), lc(club.id)]);
      if (e.type === "STAFF_DISMISSED") return base("staff_dismissed", { name, fn, club: c.clubName(club.id) }, [lp(person.id), lc(club.id)]);
      const from = clubs.find((x) => x.roleKind === "from");
      return base("staff_moved", { name, fn, club: c.clubName(club.id), from: from ? c.clubName(from.id) : "", poached: from?.id === c.club ? 1 : 0 }, [lp(person.id), lc(club.id), ...(from ? [lc(from.id)] : [])]);
    }
    case "STADIUM_WORKS_STARTED": case "STADIUM_WORKS_DONE": {
      // obras: notícia no teu clube e, quando ficam prontas, também na Primeira Liga
      const top = club ? c.data.clubs.find((b) => b.id === club.id)?.tier === "firstLeague" : false;
      if (d.kind === "cover") return undefined;
      if (!club || (!our && !(top && e.type === "STADIUM_WORKS_DONE"))) return undefined;
      return base(e.type === "STADIUM_WORKS_STARTED" ? "stadium_works" : "stadium_opened", { club: c.clubName(club.id), seats: within(d.seats), sector: String(d.sector ?? ""), cost: within(d.cost), capacity: within(d.capacity) }, [lc(club.id)]);
    }
    case "GAMER_RESIGNATION":
      if (!inboxOnly || !club) return undefined;
      if (d.reason === "results") return base("sacked_results", { club: c.clubName(club.id), amount: within(d.compensation) }, [lc(club.id)]);
      return base(d.reason === "secondDistrict" ? "sacked" : d.reason === "contractEnd" ? "contract_end" : "resignation", { club: c.clubName(club.id), paid: within(d.paid ?? 0) }, [lc(club.id)]);
    case "GAMER_OBJECTIVE":
      return inboxOnly && club ? base(d.met ? "objective_met" : "objective_missed", { club: c.clubName(club.id), rank: within(d.rank), target: within(d.target), bonus: within(d.bonus) }, [lc(club.id)]) : undefined;
    case "GAMER_HIRED":
      return inboxOnly && club ? base("signed", { club: c.clubName(club.id) }, [lc(club.id)]) : undefined;
    case "TRANSFER": {
      // notícia se for do teu clube ou se o valor é importante (marcado no evento)
      if (!our && !d.important) return undefined;
      const seller = e.entities.find((x) => x.k === "club" && x.roleKind === "seller");
      const buyer = e.entities.find((x) => x.k === "club" && x.roleKind === "buyer");
      if (!person || !buyer) return undefined;
      const sellerName = typeof d.foreign === "string" && d.foreign ? d.foreign : seller ? c.clubName(seller.id) : "";
      return base("transfer", { player: c.personName(person.id), from: sellerName, to: c.clubName(buyer.id), fee: within(d.fee) }, [lp(person.id), ...(seller && !seller.id.startsWith("x-") ? [lc(seller.id)] : []), lc(buyer.id)]);
    }
    case "PLAYER_SIGNED":
      // contratações de livres só são notícia no teu clube
      return our && person && club ? base("transfer_free", { player: c.personName(person.id), club: c.clubName(club.id) }, [lp(person.id), lc(club.id)]) : undefined;
    case "TRANSFER_OFFER": {
      const buyer = e.entities.find((x) => x.k === "club" && x.roleKind === "buyer");
      return inboxOnly && our && person && buyer ? base(d.loan ? "loan_offer" : d.youth ? "youth_offer" : "transfer_offer", { player: c.personName(person.id), club: c.clubName(buyer.id), fee: within(d.fee) }, [lp(person.id), lc(buyer.id)]) : undefined;
    }
    case "COUNCIL_REPLY": {
      const city = e.entities.find((x) => x.k === "city");
      const mayor = e.entities.find((x) => x.k === "person" && x.roleKind === "mayor");
      return inboxOnly && our && city && mayor ? base("council_reply", { mayor: c.personName(mayor.id), kind: String(d.kind ?? ""), outcome: d.approved ? "yes" : "no", reason: String(d.reason ?? ""), tone: String(d.tone ?? "plain"), amount: within(d.amount) }, [lp(mayor.id), { k: "city", id: city.id, name: c.data.cities.find((x) => x.id === city.id)?.name ?? city.id }]) : undefined;
    }
    case "ELECTION_CAMPAIGN": {
      const city = e.entities.find((x) => x.k === "city");
      return inboxOnly && our && city ? base("election_campaign", { city: c.data.cities.find((x) => x.id === city.id)?.name ?? city.id, date: String(d.date ?? "") }, [{ k: "city", id: city.id, name: c.data.cities.find((x) => x.id === city.id)?.name ?? city.id }]) : undefined;
    }
    case "ELECTION_RESULT": {
      const city = e.entities.find((x) => x.k === "city");
      const mayor = e.entities.find((x) => x.k === "person" && x.roleKind === "mayor");
      const cityName = city ? c.data.cities.find((x) => x.id === city.id)?.name ?? city.id : "";
      return inboxOnly && our && city && mayor ? base("election_result", { mayor: c.personName(mayor.id), city: cityName, reelected: within(d.reelected), backed: String(d.backed ?? "neutral") }, [lp(mayor.id), { k: "city", id: city.id, name: cityName }]) : undefined;
    }
    case "PATRON_OFFER": {
      const company = e.entities.find((x) => x.k === "company");
      const owner = e.entities.find((x) => x.k === "person");
      const name = company ? c.repo.company(company.id)?.name ?? company.id : "";
      return inboxOnly && our && company ? base("patron_offer", { company: name, amount: within(d.amount), counterpart: String(d.counterpart ?? "none") }, owner ? [lp(owner.id)] : []) : undefined;
    }
    case "CLUB_OFFER": {
      const offering = e.entities.find((x) => x.k === "club" && x.roleKind === "offer");
      return inboxOnly && offering ? base("club_offer", { club: c.clubName(offering.id), league: c.data.clubs.find((x) => x.id === offering.id)?.league ?? "", surprise: d.surprise === true ? 1 : 0 }, [lc(offering.id)]) : undefined;
    }
    case "BID_REPLY": {
      if (!inboxOnly || !our || !person) return undefined;
      const status = String(d.status ?? "");
      const kind = String(d.kind ?? "fee");
      const values = { player: c.personName(person.id), club: String(d.seller ?? ""), fee: within(d.fee), what: kind, status };
      const type: NewsItemType = kind === "terms" && status === "accepted" ? "bid_agreed" : status === "closed" ? "bid_rejected" : "bid_progress";
      return base(type, values, [lp(person.id)]);
    }
    case "MARKET_WINDOW":
      return inboxOnly && our ? base(d.state === "open" ? "market_open" : "market_close", { window: String(d.name ?? "") }, []) : undefined;
    case "YOUTH_INTAKE": {
      const kids = e.entities.filter((x) => x.k === "person");
      if (!inboxOnly || !our || kids.length === 0) return undefined;
      const names = kids.slice(0, 3).map((x) => c.personName(x.id)).join(", ") + (kids.length > 3 ? "…" : "");
      return base("youth_intake", { n: kids.length, names }, kids.map((x) => lp(x.id)));
    }
    case "TALENT_APPEARED": {
      const city = e.entities.find((x) => x.k === "city");
      if (!inboxOnly || !our || !city) return undefined;
      const cityName = c.data.cities.find((x) => x.id === city.id)?.name ?? city.id;
      return base("local_talent", { n: within(d.n), clubs: within(d.clubs), city: cityName }, [{ k: "city", id: city.id, name: cityName }]);
    }
    case "SCOUT_REPORT":
      return inboxOnly && our && person ? base("scout_report", { player: c.personName(person.id), kind: String(d.kind ?? "week") }, [lp(person.id)]) : undefined;
    case "SCOUT_SEARCH":
      return inboxOnly && our ? base("scout_search", { position: String(d.position ?? ""), n: within(d.n) }, []) : undefined;
    default:
      return undefined;
  }
}

function context(repo: Repository, data: BaseData): Context {
  const club = repo.meta("gamer.club") || undefined;
  const names = new Map(data.clubs.map((x) => [x.id, x] as const));
  return {
    repo, data,
    ...(club ? { club } : {}),
    ...(club && names.get(club) ? { league: names.get(club)!.league } : {}),
    clubName: (id) => names.get(id)?.name ?? id,
    personName: (id) => repo.publicPerson(id)?.sportingName ?? id,
  };
}

type Source = { clubs?: readonly string[] };

/** Os eventos mais recentes (de uns clubes, ou de todo o mundo), do mais novo para o mais velho, sem repetidos. */
function events(c: Context, types: readonly string[], source: Source, limit: number, beforeOf: number | undefined, afterOf: number | undefined): HistoryEvent[] {
  const filter = { publicOnly: true as const, ...(beforeOf !== undefined ? { beforeOf } : {}), ...(afterOf !== undefined ? { afterOf } : {}) };
  if (!source.clubs) return c.repo.recentEvents({ types, ...filter, limit });
  const porId = new Map<number, HistoryEvent>();
  for (const id of source.clubs) for (const e of c.repo.eventsOf({ k: "club", id }, { ...filter, limit })) if (types.includes(e.type)) porId.set(e.id, e);
  return [...porId.values()].sort((a, b) => b.id - a.id).slice(0, limit);
}

/** Notícias a partir dos eventos, até `limite`: lê em lotes até chegar (ou acabarem os eventos). */
function collapse(c: Context, types: readonly string[], inboxOnly: boolean, limit: number, beforeOf: number | undefined, accepts: (n: NewsItem) => boolean, source: Source = {}, afterOf?: number): NewsItem[] {
  const out: NewsItem[] = [];
  let cut = beforeOf;
  for (let pairings = 0; pairings < 40 && out.length < limit; pairings++) {
    const batch = events(c, types, source, 100, cut, afterOf);
    if (batch.length === 0) break;
    for (const e of batch) {
      const n = build(e, c, inboxOnly);
      if (n && accepts(n)) { out.push(n); if (out.length >= limit) break; }
    }
    cut = batch[batch.length - 1]!.id;
  }
  return out;
}

/**
 * Relevância de uma notícia para o gamer (por esta ordem): o teu clube, os teus rivais, os clubes da tua divisão, os melhores
 * clubes do país. Só contam os últimos `RELEVANT_DAYS` dias, com o peso a cair a metade a cada `HALF_LIFE_DAYS`; escolhem-se as
 * mais relevantes mas mostram-se por ordem cronológica (a mais recente primeiro). Se faltar notícia relevante, enche-se com o que
 * o mundo contou mais recentemente.
 */
const TIER_WEIGHT = { own: 16, rival: 8, division: 4, top: 2 } as const;
const HALF_LIFE_DAYS = 2;
/** Passados estes dias, uma notícia já não é relevante (só entra se faltar notícia nova para encher a lista). */
const RELEVANT_DAYS = 6;
const TOP_CLUBS = 8;

function relevantNews(repo: Repository, data: BaseData, c: Context, limit: number): NewsItem[] {
  const own = c.club;
  const ownClub = data.clubs.find((x) => x.id === own);
  const rivals = new Set<string>();
  if (own) {
    if (ownClub?.rival) rivals.add(ownClub.rival);
    for (const r of data.rivalries) { if (r.a === own) rivals.add(r.b); if (r.b === own) rivals.add(r.a); }
  }
  const division = new Set(ownClub ? data.clubs.filter((x) => x.league === ownClub.league).map((x) => x.id) : []);
  const top = new Set([...reputationData(repo, data, currentSeason(repo)).clubs].sort((a, b) => b.reputation - a.reputation).slice(0, TOP_CLUBS).map((x) => x.id));
  const tierOf = (n: NewsItem): keyof typeof TIER_WEIGHT | undefined => {
    const ids = n.links.filter((l) => l.k === "club").map((l) => l.id);
    if (n.ofClubYour || (own && ids.includes(own))) return "own";
    if (ids.some((id) => rivals.has(id))) return "rival";
    if (ids.some((id) => division.has(id))) return "division";
    if (ids.some((id) => top.has(id))) return "top";
    return undefined;
  };
  // candidatas: o que o mundo contou há pouco, mais o que se passou com o teu clube e os rivais (que pode ter ficado mais para trás)
  const pool = new Map<number, NewsItem>();
  const add = (list: NewsItem[]) => { for (const n of list) pool.set(n.id, n); };
  add(collapse(c, NEWS_ITEM_EVENTS, false, 300, undefined, () => true));
  const near = [...(own ? [own] : []), ...rivals];
  if (near.length > 0) add(collapse(c, NEWS_ITEM_EVENTS, false, 60, undefined, (n) => n.links.some((l) => l.k === "club" && near.includes(l.id)), { clubs: near }));
  const dayOf = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;
  const today = repo.meta("date.today");
  const now = today ? dayOf(today) : Math.max(0, ...[...pool.values()].map((n) => dayOf(n.date)));
  const scored = [...pool.values()].flatMap((n) => {
    const tier = tierOf(n);
    const age = now - dayOf(n.date);
    return tier && age <= RELEVANT_DAYS ? [{ n, score: TIER_WEIGHT[tier] * 0.5 ** (age / HALF_LIFE_DAYS) }] : [];
  });
  const picked = scored.sort((a, b) => b.score - a.score || b.n.id - a.n.id).slice(0, limit).map((x) => x.n);
  if (picked.length < limit) {
    const taken = new Set(picked.map((n) => n.id));
    picked.push(...[...pool.values()].filter((n) => !taken.has(n.id)).sort((a, b) => b.id - a.id).slice(0, limit - picked.length));
  }
  return picked.sort((a, b) => b.id - a.id);
}

/** Notícias do clube do gamer, da liga dele ou do mundo todo. Mais recentes primeiro. */
export function news(repo: Repository, data: BaseData, options: { scope: NewsScope; limit?: number; beforeOf?: number }): NewsItem[] {
  const c = context(repo, data);
  const limit = options.limit ?? 30;
  if (options.scope === "relevant") return relevantNews(repo, data, c, limit);
  const leagueOf = new Map(data.clubs.map((x) => [x.id, x.league] as const));
  const inLeague = (n: NewsItem) => n.links.some((l) => l.k === "club" && leagueOf.get(l.id) === c.league);
  const accepts = (n: NewsItem) => options.scope === "world" || (options.scope === "club" ? n.ofClubYour : c.league !== undefined && (n.ofClubYour || inLeague(n)));
  const clubs = options.scope === "world" ? undefined : options.scope === "club" ? (c.club ? [c.club] : []) : data.clubs.filter((x) => x.league === c.league).map((x) => x.id);
  if (clubs && (clubs.length === 0)) return [];
  return collapse(c, NEWS_ITEM_EVENTS, false, limit, options.beforeOf, accepts, clubs ? { clubs } : {});
}

/** Caixa de entrada: o que se passou com o teu clube e contigo. */
export function inbox(repo: Repository, data: BaseData, options: { limit?: number; beforeOf?: number } = {}): { messages: Message[]; unread: number } {
  const c = context(repo, data);
  if (!c.club && !repo.meta("gamer.previous")) return { messages: [], unread: 0 };
  const isRead = Number(repo.meta("cash.read") ?? 0);
  const ex = inboxExceptions(repo);
  const isIsRead = (id: number) => (ex.readItems.has(id) ? true : ex.unread.has(id) ? false : id <= isRead);
  // sem clube (demitido): a tua carreira e só o que a imprensa conta do clube que deixaste (sem pormenores internos)
  const target = c.club ?? repo.meta("gamer.previous");
  const external = target !== undefined && target !== c.club;
  const rivals = new Set(repo.eventsOf({ k: "club", id: target ?? "" }, { type: "RIVAL_MATCH" }).flatMap((e) => (e.cause !== undefined ? [e.cause] : [])));
  const cx: Context = external ? { ...c, club: target, external: true, rivals } : { ...c, rivals };
  const accepts = external ? (n: NewsItem) => n.type === "club_offer" || n.links.some((l) => l.k === "club" && l.id === target) : (n: NewsItem) => n.ofClubYour;
  const source = { clubs: target ? [target] : [] };
  const all = collapse(cx, INBOX_EVENTS, true, options.limit ?? 40, options.beforeOf, accepts, source);
  const messages = all.map((n): Message => ({ ...n, isRead: isIsRead(n.id) }));
  const fresh = collapse(cx, INBOX_EVENTS, true, 99, undefined, accepts, source, isRead).filter((n) => !ex.readItems.has(n.id)).length;
  const unread = fresh + [...ex.unread].filter((id) => id <= isRead).length;
  return { messages, unread };
}

/** Exceções ao «tudo até ao último evento lido»: mensagens que o gamer marcou à mão como lidas ou por ler. */
function inboxExceptions(repo: Repository): { readItems: Set<number>; unread: Set<number> } {
  try {
    const x = JSON.parse(repo.meta("cash.exceptions") || "{}") as { readItems?: number[]; unread?: number[] };
    return { readItems: new Set(x.readItems ?? []), unread: new Set(x.unread ?? []) };
  } catch {
    return { readItems: new Set(), unread: new Set() };
  }
}

/** Marca tudo como lido (até ao último evento) e esquece as marcas individuais. */
export function markInboxRead(repo: Repository): void {
  repo.setMeta("cash.read", String(repo.eventsTotal()));
  repo.setMeta("cash.exceptions", "");
}

/** Marca uma mensagem como lida ou por ler (RZ-167). */
export function markMessage(repo: Repository, id: number, isRead: boolean): void {
  const ex = inboxExceptions(repo);
  ex.readItems.delete(id);
  ex.unread.delete(id);
  const mark = Number(repo.meta("cash.read") ?? 0);
  // só é exceção se contrariar a marca-d'água
  if (isRead && id > mark) ex.readItems.add(id);
  if (!isRead && id <= mark) ex.unread.add(id);
  repo.setMeta("cash.exceptions", JSON.stringify({ readItems: [...ex.readItems], unread: [...ex.unread] }));
}
