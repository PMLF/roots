/**
 * Notícias e caixa de entrada (RZ-118; docs/TOM_E_UX.md, docs/HISTORICO_EVENTOS.md §4). Tudo sai dos eventos públicos do
 * histórico — nada se grava à parte, por isso as notícias são sempre reconstruíveis. O motor devolve dados estruturados
 * (tipo, variante, valores, ligações); quem traduz e escreve a frase é a interface (pt-PT e inglês), com o tom realista da
 * imprensa desportiva. A variante escolhe-se pelo id do evento (estável: a mesma notícia lê-se sempre igual).
 */
import type { BaseData } from "../dados/tipos";
import type { Repository } from "../persistencia/repositorio";
import type { HistoryEvent } from "../persistencia/tipos";
import type { IsoDate } from "../persistencia/tipos";

export type NewsItemType =
  | "hattrick" | "red" | "expulsao_dois_amarelos" | "rout" | "golo_reviravolta" | "golo_descontos" | "lesao_grave"
  | "champion" | "premio_estado" | "promotion" | "relegation" | "segunda_distrital" | "regresso_distrital" | "locality" | "cidade_evento"
  | "outcome" | "injury" | "resignation" | "sacked" | "signed";

export type NewsItemLink = { k: "club" | "person" | "locality" | "competition" | "city"; id: string; name: string };

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
  hattrick: 2, red: 2, expulsao_dois_amarelos: 2, rout: 2, golo_reviravolta: 2, golo_descontos: 2, lesao_grave: 2,
  champion: 2, premio_estado: 2, promotion: 2, relegation: 2, segunda_distrital: 1, regresso_distrital: 1, locality: 1, cidade_evento: 1, outcome: 2, injury: 2, resignation: 1, sacked: 1, signed: 1,
};

/** Tipos de evento que dão notícia para toda a gente. */
const NEWS_ITEM_EVENTS = ["HATTRICK", "CARTAO_VERMELHO", "GOLEADA", "GOLO_NOTAVEL", "LESAO", "CAMPEAO", "PREMIO_ESTADO", "DESCIDA_SEGUNDA_DISTRITAL", "REGRESSO_DISTRITAL", "SUBIDA", "DESCIDA", "LOCALIDADE_ESTATUTO", "CIDADE_EVENTO"] as const;
/** A caixa de entrada junta o que é pessoal: o resultado do teu jogo, qualquer lesão do teu plantel, a tua carreira. */
const INBOX_EVENTS = [...NEWS_ITEM_EVENTS, "JOGO_JOGADO", "GAMER_DEMISSAO", "GAMER_CONTRATADO"] as const;
/** Lesões a partir desta gravidade são notícia no mundo; no teu plantel, todas. */
const NEWS_ITEM_SEVERITY = 4;

export type NewsScope = "club" | "league" | "world";

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

/** Nome da divisão a partir do código de `movimentos.ts` (primeira, cp-A, distrital-Braga). */
export function localName(local: string, data: BaseData): string {
  if (local.startsWith("cp-")) return `CP Série ${local.slice(3)}`;
  if (local.startsWith("distrital-")) {
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
      return person && club ? base("hattrick", { player: c.personName(person.id), club: c.clubName(club.id), goals: within(d.golos) }, [lp(person.id), lc(club.id)]) : undefined;
    case "CARTAO_VERMELHO": {
      if (!person || !club) return undefined;
      const type: NewsItemType = d.segundoAmarelo ? "expulsao_dois_amarelos" : "red";
      return base(type, { player: c.personName(person.id), club: c.clubName(club.id), minute: Math.floor(within(d.minuto)) }, [lp(person.id), lc(club.id)]);
    }
    case "GOLEADA": {
      const v = roleKind(e, "club", "winner");
      const x = roleKind(e, "club", "beaten");
      return v && x ? base("rout", { winner: c.clubName(v.id), beaten: c.clubName(x.id), winnerGoals: within(d.golosVencedor), beatenGoals: within(d.golosVencido) }, [lc(v.id), lc(x.id)]) : undefined;
    }
    case "GOLO_NOTAVEL": {
      if (!person || !club) return undefined;
      const type: NewsItemType = d.motivo === "turnaround" ? "golo_reviravolta" : "golo_descontos";
      return base(type, { player: c.personName(person.id), club: c.clubName(club.id), minute: Math.floor(within(d.minuto)), homeGoals: within(d.golosCasa), awayGoals: within(d.golosFora) }, [lp(person.id), lc(club.id)]);
    }
    case "LESAO": {
      if (!person || !club) return undefined;
      const serious = within(d.gravidade) >= NEWS_ITEM_SEVERITY;
      const type: NewsItemType | undefined = inboxOnly && our ? "injury" : serious ? "lesao_grave" : undefined;
      if (!type) return undefined;
      return base(type, { player: c.personName(person.id), club: c.clubName(club.id), days: within(d.dias), severity: within(d.gravidade) }, [lp(person.id), lc(club.id)]);
    }
    case "CAMPEAO":
      return club ? base("champion", { club: c.clubName(club.id), league: String(d.liga ?? "") }, [lc(club.id)]) : undefined;
    case "PREMIO_ESTADO": {
      if (!club) return undefined;
      const council = e.entities.find((x) => x.k === "city");
      const city = council ? c.data.cities.find((x) => x.id === council.id)?.name ?? council.id : "";
      return base("premio_estado", { club: c.clubName(club.id), district: String(d.distrito ?? ""), value: within(d.valorClube), consecutive: within(d.seguidos), city }, [lc(club.id), ...(council ? [{ k: "city" as const, id: council.id, name: city }] : [])]);
    }
    case "DESCIDA_SEGUNDA_DISTRITAL": case "REGRESSO_DISTRITAL":
      return club ? base(e.type === "REGRESSO_DISTRITAL" ? "regresso_distrital" : "segunda_distrital", { club: c.clubName(club.id), district: String(d.distrito ?? "") }, [lc(club.id)]) : undefined;
    case "SUBIDA": case "DESCIDA":
      return club ? base(e.type === "SUBIDA" ? "promotion" : "relegation", { club: c.clubName(club.id), league: localName(String(d.para ?? ""), c.data) }, [lc(club.id)]) : undefined;
    case "CIDADE_EVENTO": {
      const cities = e.entities.filter((x) => x.k === "city");
      if (cities.length === 0) return undefined;
      const cityName = (id: string) => c.data.cities.find((x) => x.id === id)?.name ?? id;
      const regional = d.regional === true;
      const links = (regional ? cities.slice(0, 4) : cities).map((x): NewsItemLink => ({ k: "city" as const, id: x.id, name: cityName(x.id) }));
      return base("cidade_evento", { event: String(d.evento ?? ""), city: regional ? String(d.polo ?? "") : cityName(cities[0]!.id), regional: regional ? 1 : 0 }, links);
    }
    case "LOCALIDADE_ESTATUTO": {
      const l = roleKind(e, "locality");
      if (!l) return undefined;
      const name = c.data.localities.find((x) => x.id === l.id)?.name ?? l.id;
      return base("locality", { locality: name, de: String(d.de ?? ""), para: String(d.para ?? "") }, [{ k: "locality", id: l.id, name }]);
    }
    case "JOGO_JOGADO": {
      if (!inboxOnly || !our || !c.club) return undefined;
      if (c.rivals && !c.rivals.has(e.id)) return undefined;
      const home = roleKind(e, "club", "home");
      const away = roleKind(e, "club", "away");
      if (!home || !away) return undefined;
      const gc = within(d.golosCasa);
      const gf = within(d.golosFora);
      const ownSquad = home.id === c.club ? gc : gf;
      const their = home.id === c.club ? gf : gc;
      const competition = roleKind(e, "competition");
      return base("outcome", { home: c.clubName(home.id), away: c.clubName(away.id), homeGoals: gc, awayGoals: gf, outcome: ownSquad > their ? "win" : ownSquad === their ? "draw" : "derrota", competition: competition?.id ?? "" }, [lc(home.id), lc(away.id)]);
    }
    case "GAMER_DEMISSAO":
      return inboxOnly && club ? base(d.motivo === "segundaDistrital" ? "sacked" : "resignation", { club: c.clubName(club.id) }, [lc(club.id)]) : undefined;
    case "GAMER_CONTRATADO":
      return inboxOnly && club ? base("signed", { club: c.clubName(club.id) }, [lc(club.id)]) : undefined;
    default:
      return undefined;
  }
}

function context(repo: Repository, data: BaseData): Context {
  const club = repo.meta("clube.gamer") || undefined;
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

/** Notícias do clube do gamer, da liga dele ou do mundo todo. Mais recentes primeiro. */
export function news(repo: Repository, data: BaseData, options: { scope: NewsScope; limit?: number; beforeOf?: number }): NewsItem[] {
  const c = context(repo, data);
  const limit = options.limit ?? 30;
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
  if (!c.club && !repo.meta("gamer.anterior")) return { messages: [], unread: 0 };
  const isRead = Number(repo.meta("caixa.lida") ?? 0);
  const ex = inboxExceptions(repo);
  const isIsRead = (id: number) => (ex.readItems.has(id) ? true : ex.unread.has(id) ? false : id <= isRead);
  // sem clube (demitido): a tua carreira e só o que a imprensa conta do clube que deixaste (sem pormenores internos)
  const target = c.club ?? repo.meta("gamer.anterior");
  const external = target !== undefined && target !== c.club;
  const rivals = new Set(repo.eventsOf({ k: "club", id: target ?? "" }, { type: "JOGO_RIVAL" }).flatMap((e) => (e.cause !== undefined ? [e.cause] : [])));
  const cx: Context = external ? { ...c, club: target, external: true, rivals } : { ...c, rivals };
  const accepts = external ? (n: NewsItem) => n.links.some((l) => l.k === "club" && l.id === target) : (n: NewsItem) => n.ofClubYour;
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
    const x = JSON.parse(repo.meta("caixa.excecoes") || "{}") as { readItems?: number[]; unread?: number[] };
    return { readItems: new Set(x.readItems ?? []), unread: new Set(x.unread ?? []) };
  } catch {
    return { readItems: new Set(), unread: new Set() };
  }
}

/** Marca tudo como lido (até ao último evento) e esquece as marcas individuais. */
export function markInboxRead(repo: Repository): void {
  repo.setMeta("caixa.lida", String(repo.eventsTotal()));
  repo.setMeta("caixa.excecoes", "");
}

/** Marca uma mensagem como lida ou por ler (RZ-167). */
export function markMessage(repo: Repository, id: number, isRead: boolean): void {
  const ex = inboxExceptions(repo);
  ex.readItems.delete(id);
  ex.unread.delete(id);
  const mark = Number(repo.meta("caixa.lida") ?? 0);
  // só é exceção se contrariar a marca-d'água
  if (isRead && id > mark) ex.readItems.add(id);
  if (!isRead && id <= mark) ex.unread.add(id);
  repo.setMeta("caixa.excecoes", JSON.stringify({ readItems: [...ex.readItems], unread: [...ex.unread] }));
}
