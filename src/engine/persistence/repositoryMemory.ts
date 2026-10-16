/**
 * Repositório em memória (RZ-128): mesmo comportamento que o SQLite, sem dependências nativas.
 * Serve para testes rápidos do motor e como referência executável do contrato (ambos passam na mesma bateria).
 */
import { SCHEMA_VERSION } from "./schema";
import type { EventsFilter, RecentFilter, Repository } from "./repository";
import type {
  StandingsAdjustment,
  RoleRecord,
  ContractRecord,
  IsoDate,
  RefEntity,
  HistoryEvent,
  NewEvent,
  ScheduledBye,
  Match,
  ScheduledMatch,
  FactMatch,
  PlayerRecord,
  NewMatch,
  StandingsLine,
  PlayerStatLine,
  PlayerCompetitionStats,
  Scorer,
  CardRecord,
  Observation,
  NewObservation,
  WorldBatchRecord,
  LocalityRecord,
  LocalityUpdate,
  Appearance,
  PersonIndex,
  PublicPerson,
  PersonRecord,
  PointsPerResult,
} from "./types";
import { cmp, validateNewEvent, validateMatch } from "./validation";

type MatchRecord = { match: Match; facts: FactMatch[]; part: Appearance[] };
type ClassRow = { matches: number; wins: number; draws: number; losses: number; gm: number; gs: number; matchesPoints: number; adjustment: number };
type StatRow = Omit<PlayerStatLine, "player" | "season" | "club" | "competition">;

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const entityKey = (e: Pick<RefEntity, "k" | "id">) => `${e.k}\u0000${e.id}`;
const emptyLine = (): ClassRow => ({ matches: 0, wins: 0, draws: 0, losses: 0, gm: 0, gs: 0, matchesPoints: 0, adjustment: 0 });
const emptyStat = (): StatRow => ({ matches: 0, minutes: 0, goals: 0, assists: 0, yellows: 0, reds: 0 });

export class MemoryRepository implements Repository {
  readonly schemaVersion = SCHEMA_VERSION;

  private events: HistoryEvent[] = [];
  private byEntity = new Map<string, number[]>();
  private children = new Map<number, number[]>();
  private matches = new Map<string, MatchRecord>();
  private adjustments: StandingsAdjustment[] = [];
  private standing = new Map<string, ClassRow>();
  private stats = new Map<string, StatRow>();
  private obs: Observation[] = [];
  private metaMap = new Map<string, string>();
  private people = new Map<string, PersonRecord>();
  private mapPlayers = new Map<string, PlayerRecord>();
  private contracts: ContractRecord[] = [];
  private roles = new Map<string, RoleRecord>();
  private locals = new Map<string, LocalityRecord>();
  private matchesCal = new Map<string, ScheduledMatch>();
  private byesCal: ScheduledBye[] = [];
  private daily: (() => void)[][] = [];

  constructor(private readonly points: PointsPerResult = { win: 3, draw: 1 }) {}

  private undo(fn: () => void): void {
    this.daily[this.daily.length - 1]?.push(fn);
  }

  restart(): void {
    if (this.daily.length > 0) throw new Error("reiniciar() não pode correr dentro de uma transação");
    this.events = [];
    this.byEntity = new Map();
    this.children = new Map();
    this.matches = new Map();
    this.adjustments = [];
    this.standing = new Map();
    this.stats = new Map();
    this.obs = [];
    this.metaMap = new Map();
    this.people = new Map();
    this.mapPlayers = new Map();
    this.contracts = [];
    this.roles = new Map();
    this.locals = new Map();
    this.matchesCal = new Map();
    this.byesCal = [];
  }

  transaction<T>(fn: () => T): T {
    const board: (() => void)[] = [];
    this.daily.push(board);
    try {
      const r = fn();
      this.daily.pop();
      // confirmar um quadro interno: passa os seus desfazeres para o quadro de fora (que ainda pode falhar)
      const away = this.daily[this.daily.length - 1];
      if (away) for (const u of board) away.push(u);
      return r;
    } catch (e) {
      this.daily.pop();
      for (const u of board.reverse()) u();
      throw e;
    }
  }

  meta(rowKey: string): string | undefined {
    return this.metaMap.get(rowKey);
  }
  setMeta(rowKey: string, value: string): void {
    const before = this.metaMap.get(rowKey);
    this.metaMap.set(rowKey, value);
    this.undo(() => {
      if (before === undefined) this.metaMap.delete(rowKey);
      else this.metaMap.set(rowKey, before);
    });
  }

  // ---------- localidades
  saveLocalities(localities: readonly LocalityRecord[]): void {
    this.transaction(() => {
      if (this.locals.size > 0) throw new Error("O save já tem localidades");
      for (const l of localities) {
        if (this.locals.has(l.id)) throw new Error(`Localidade repetida: ${l.id}`);
        this.locals.set(l.id, { ...l });
        this.undo(() => this.locals.delete(l.id));
      }
    });
  }
  locality(id: string): LocalityRecord | undefined {
    const l = this.locals.get(id);
    return l ? { ...l } : undefined;
  }
  localities(filter: { city?: string } = {}): LocalityRecord[] {
    return [...this.locals.values()].filter((l) => filter.city === undefined || l.city === filter.city).sort((a, b) => cmp(a.id, b.id)).map((l) => ({ ...l }));
  }
  updateLocality(id: string, a: LocalityUpdate): { event?: number } {
    return this.transaction(() => {
      const before = this.locals.get(id);
      if (!before) throw new Error(`Localidade inexistente: ${id}`);
      if (!(a.population >= 0)) throw new Error("população inválida");
      const copy = { ...before };
      this.undo(() => this.locals.set(id, copy));
      if (a.status === before.status) {
        this.locals.set(id, { ...before, population: a.population });
        return {};
      }
      const event = this.appendEvent({
        type: "LOCALITY_STATUS", date: a.date, season: a.season, visibility: "exposed",
        entities: [{ k: "locality", id }, { k: "city", id: before.city }],
        ...(a.cause !== undefined ? { cause: a.cause } : {}),
        data: { de: before.status, para: a.status, population: a.population },
      });
      this.locals.set(id, { ...before, population: a.population, status: a.status, since: a.date });
      return { event };
    });
  }

  // ---------- pessoas
  saveWorld(batch: WorldBatchRecord, onProgress?: (done: number, total: number) => void): void {
    this.transaction(() => {
      if (this.people.size > 0) throw new Error("O save já tem pessoas");
      const ids = new Set<string>();
      for (const p of batch.people) {
        if (ids.has(p.id)) throw new Error(`Pessoa repetida: ${p.id}`);
        ids.add(p.id);
      }
      for (const j of batch.players) if (!ids.has(j.person)) throw new Error(`Jogador sem pessoa: ${j.person}`);
      for (const c of batch.contracts) if (!ids.has(c.person)) throw new Error(`Contrato sem pessoa: ${c.person}`);
      for (const c of batch.roles) if (!ids.has(c.person)) throw new Error(`Cargo sem pessoa: ${c.person}`);
      const copy = clone(batch);
      for (const p of copy.people) this.people.set(p.id, p);
      for (const j of copy.players) this.mapPlayers.set(j.person, j);
      this.contracts.push(...copy.contracts);
      for (const c of copy.roles) this.roles.set(c.person, c);
      this.undo(() => {
        this.people.clear();
        this.mapPlayers.clear();
        this.contracts = [];
        this.roles.clear();
      });
      const total = batch.people.length + batch.players.length + batch.contracts.length + batch.roles.length;
      onProgress?.(total, total);
    });
  }
  peopleTotal(): number {
    return this.people.size;
  }
  peopleIndex(): PersonIndex[] {
    return [...this.people.values()]
      .sort((a, b) => cmp(a.id, b.id))
      .map((p) => {
        const j = this.mapPlayers.get(p.id);
        const c = this.roles.get(p.id);
        const club = j?.club ?? c?.club;
        return {
          id: p.id, name: p.name, sportingName: p.sportingName,
          ...(club !== undefined ? { club } : {}), ...(j ? { position: j.positions[0]!.pos } : {}), ...(c ? { fn: c.fn } : {}),
        };
      });
  }
  private exposed(id: string): PublicPerson {
    const p = this.people.get(id) as PersonRecord;
    const j = this.mapPlayers.get(id);
    const c = this.roles.get(id);
    const club = j?.club ?? c?.club;
    return {
      id: p.id, name: p.name, sportingName: p.sportingName, birth: p.birth, nationality: p.nationality,
      ...(p.naturalDe !== undefined ? { naturalDe: p.naturalDe } : {}),
      roles: [...p.roles],
      ...(club !== undefined ? { club } : {}),
      ...(c ? { fn: c.fn } : {}),
      ...(j ? { player: { position: j.positions[0]!.pos, heightCm: j.heightCm, weightKg: j.weightKg, pe: j.pe, state: j.state } } : {}),
    };
  }
  publicPerson(id: string): PublicPerson | undefined {
    return this.people.has(id) ? this.exposed(id) : undefined;
  }
  publicSquad(club: string): PublicPerson[] {
    return [...this.mapPlayers.values()]
      .filter((j) => j.club === club && j.state === "active")
      .map((j) => this.exposed(j.person))
      .sort((a, b) => cmp(a.sportingName, b.sportingName) || cmp(a.id, b.id));
  }
  publicRoles(filter: { club?: string; city?: string }): PublicPerson[] {
    if (filter.club === undefined && filter.city === undefined) return [];
    return [...this.roles.values()]
      .filter((c) => (filter.club === undefined || c.club === filter.club) && (filter.city === undefined || c.city === filter.city))
      .sort((a, b) => cmp(a.fn, b.fn) || cmp(a.person, b.person))
      .map((c) => this.exposed(c.person));
  }
  person(id: string): PersonRecord | undefined {
    const p = this.people.get(id);
    return p ? clone(p) : undefined;
  }
  player(person: string): PlayerRecord | undefined {
    const j = this.mapPlayers.get(person);
    return j ? clone(j) : undefined;
  }
  clubPlayers(club: string): PlayerRecord[] {
    return [...this.mapPlayers.values()].filter((j) => j.club === club).sort((a, b) => cmp(a.person, b.person)).map((j) => clone(j));
  }
  contract(person: string): ContractRecord | undefined {
    const c = [...this.contracts].reverse().find((x) => x.person === person);
    return c ? { ...c } : undefined;
  }
  role(person: string): RoleRecord | undefined {
    const c = this.roles.get(person);
    return c ? clone(c) : undefined;
  }

  // ---------- calendário
  saveCalendar(matches: readonly ScheduledMatch[], byes: readonly ScheduledBye[]): void {
    this.transaction(() => {
      const keys = new Set([...matches, ...byes].map((x) => `${x.competition}\u0000${x.season}`));
      for (const k of keys) {
        const [c, e] = k.split("\u0000") as [string, string];
        if ([...this.matchesCal.values()].some((j) => j.competition === c && j.season === Number(e))) throw new Error(`Já existe calendário de ${c} na época ${e}`);
      }
      for (const j of matches) {
        if (this.matchesCal.has(j.id)) throw new Error(`Jogo agendado repetido: ${j.id}`);
        this.matchesCal.set(j.id, { ...j });
        this.undo(() => this.matchesCal.delete(j.id));
      }
      for (const f of byes) {
        if (this.byesCal.some((x) => x.competition === f.competition && x.season === f.season && x.round === f.round)) throw new Error("Folga repetida");
        this.byesCal.push({ ...f });
        this.undo(() => this.byesCal.pop());
      }
    });
  }
  calendar(competition: string, season: number): { matches: ScheduledMatch[]; byes: ScheduledBye[] } {
    const matches = [...this.matchesCal.values()]
      .filter((j) => j.competition === competition && j.season === season)
      .sort((a, b) => a.round - b.round || cmp(a.id, b.id))
      .map((j) => ({ ...j }));
    const byes = this.byesCal.filter((f) => f.competition === competition && f.season === season).sort((a, b) => a.round - b.round).map((f) => ({ ...f }));
    return { matches, byes };
  }
  clubCalendar(club: string, season: number): ScheduledMatch[] {
    return [...this.matchesCal.values()]
      .filter((j) => j.season === season && (j.home === club || j.away === club))
      .sort((a, b) => cmp(a.date, b.date) || cmp(a.id, b.id))
      .map((j) => ({ ...j }));
  }
  dayMatches(date: IsoDate): ScheduledMatch[] {
    return [...this.matchesCal.values()].filter((j) => j.date === date).sort((a, b) => cmp(a.id, b.id)).map((j) => ({ ...j }));
  }
  nextMatch(club: string, since: IsoDate): ScheduledMatch | undefined {
    const j = [...this.matchesCal.values()]
      .filter((x) => (x.home === club || x.away === club) && x.date >= since)
      .sort((a, b) => cmp(a.date, b.date) || cmp(a.id, b.id))[0];
    return j ? { ...j } : undefined;
  }

  // ---------- história
  appendEvent(e: NewEvent): number {
    validateNewEvent(e);
    const without = (id: number | undefined, name: string) => {
      if (id !== undefined && (id < 1 || id > this.events.length)) throw new Error(`${name} aponta para um evento inexistente (${id})`);
    };
    without(e.cause, "cause");
    without(e.fixes, "fixes");
    const id = this.events.length + 1;
    const ev: HistoryEvent = clone({
      id,
      type: e.type,
      v: e.v ?? 1,
      date: e.date,
      season: e.season,
      ...(e.round !== undefined ? { round: e.round } : {}),
      visibility: e.visibility,
      entities: [...e.entities].sort((a, b) => cmp(a.k, b.k) || cmp(a.id, b.id)).map((x) => ({ k: x.k, id: x.id, ...(x.roleKind !== undefined ? { roleKind: x.roleKind } : {}) })),
      ...(e.cause !== undefined ? { cause: e.cause } : {}),
      ...(e.fixes !== undefined ? { fixes: e.fixes } : {}),
      origin: e.origin ?? "match",
      data: e.data,
    });
    this.events.push(ev);
    this.undo(() => this.events.pop());
    for (const x of ev.entities) {
      const k = entityKey(x);
      const list = this.byEntity.get(k) ?? [];
      list.push(id);
      this.byEntity.set(k, list);
      this.undo(() => {
        list.pop();
        if (list.length === 0) this.byEntity.delete(k);
      });
    }
    if (ev.cause !== undefined) {
      const list = this.children.get(ev.cause) ?? [];
      list.push(id);
      this.children.set(ev.cause, list);
      this.undo(() => {
        list.pop();
        if (list.length === 0) this.children.delete(ev.cause as number);
      });
    }
    return id;
  }

  event(id: number): HistoryEvent | undefined {
    const e = this.events[id - 1];
    return e ? clone(e) : undefined;
  }

  eventsTotal(): number {
    return this.events.length;
  }

  eventsOf(entity: Pick<RefEntity, "k" | "id">, f: EventsFilter = {}): HistoryEvent[] {
    const ids = this.byEntity.get(entityKey(entity)) ?? [];
    const out: HistoryEvent[] = [];
    for (let i = ids.length - 1; i >= 0 && (f.limit === undefined || out.length < f.limit); i--) {
      const e = this.events[(ids[i] as number) - 1] as HistoryEvent;
      if (f.publicOnly && e.visibility !== "exposed") continue;
      if (f.visibility && !f.visibility.includes(e.visibility)) continue;
      if (f.type !== undefined && e.type !== f.type) continue;
      if (f.seasonSince !== undefined && e.season < f.seasonSince) continue;
      if (f.untilSeason !== undefined && e.season > f.untilSeason) continue;
      if (f.afterOf !== undefined && e.id <= f.afterOf) break;
      if (f.beforeOf !== undefined && e.id >= f.beforeOf) continue;
      out.push(clone(e));
    }
    return out;
  }

  recentEvents(f: RecentFilter = {}): HistoryEvent[] {
    const out: HistoryEvent[] = [];
    for (let i = this.events.length - 1; i >= 0 && (f.limit === undefined || out.length < f.limit); i--) {
      const e = this.events[i] as HistoryEvent;
      if (f.afterOf !== undefined && e.id <= f.afterOf) break;
      if (f.beforeOf !== undefined && e.id >= f.beforeOf) continue;
      if (f.publicOnly && e.visibility !== "exposed") continue;
      if (f.types && !f.types.includes(e.type)) continue;
      out.push(clone(e));
    }
    return out;
  }

  count(type: string, entity?: Pick<RefEntity, "k" | "id">, i: { seasonSince?: number; untilSeason?: number } = {}): number {
    const source = entity ? (this.byEntity.get(entityKey(entity)) ?? []).map((id) => this.events[id - 1] as HistoryEvent) : this.events;
    return source.filter((e) => e.type === type && (i.seasonSince === undefined || e.season >= i.seasonSince) && (i.untilSeason === undefined || e.season <= i.untilSeason)).length;
  }

  last(type: string, entity: Pick<RefEntity, "k" | "id">): HistoryEvent | undefined {
    return this.eventsOf(entity, { type, limit: 1 })[0];
  }
  lastN(type: string, entity: Pick<RefEntity, "k" | "id">, n: number): HistoryEvent[] {
    return this.eventsOf(entity, { type, limit: n });
  }

  chain(eventId: number): HistoryEvent[] {
    const ids = new Set<number>();
    if (!this.events[eventId - 1]) return [];
    for (let id: number | undefined = eventId; id !== undefined; id = this.events[id - 1]?.cause) ids.add(id);
    const queue = [eventId];
    while (queue.length > 0) {
      const id = queue.pop() as number;
      ids.add(id);
      queue.push(...(this.children.get(id) ?? []));
    }
    return [...ids].sort((a, b) => a - b).map((id) => clone(this.events[id - 1] as HistoryEvent));
  }

  exportNdjson(): string {
    return this.events.length === 0 ? "" : this.events.map((e) => JSON.stringify(e)).join("\n") + "\n";
  }

  // ---------- jogos
  recordMatch(j: NewMatch, facts: FactMatch[], appearances: Appearance[]): { event: number } {
    validateMatch(j, facts, appearances);
    return this.transaction(() => {
      if (this.matches.has(j.id)) throw new Error(`Jogo ${j.id} já existe`);
      const event = this.appendEvent({
        type: "MATCH_PLAYED",
        date: j.date,
        season: j.season,
        round: j.round,
        visibility: "exposed",
        entities: [
          { k: "club", id: j.home, roleKind: "home" },
          { k: "club", id: j.away, roleKind: "away" },
          { k: "competition", id: j.competition },
          { k: "match", id: j.id },
        ],
        ...(j.cause !== undefined ? { cause: j.cause } : {}),
        data: { homeGoals: j.homeGoals, awayGoals: j.awayGoals },
      });
      const match: Match = {
        id: j.id, competition: j.competition, season: j.season, round: j.round, date: j.date, home: j.home, away: j.away,
        homeGoals: j.homeGoals, awayGoals: j.awayGoals, homeXg: j.homeXg ?? 0, awayXg: j.awayXg ?? 0, homePossession: j.homePossession ?? 0.5,
        attendance: j.attendance ?? 0, revenue: j.revenue ?? 0, importance: j.importance ?? 0, referee: j.referee ?? "", event,
      };
      this.matches.set(j.id, { match, facts: clone(facts), part: clone(appearances) });
      this.undo(() => this.matches.delete(j.id));
      this.applyMatch(match, facts, appearances);
      return { event };
    });
  }

  private upsert<V>(map: Map<string, V>, rowKey: string, empty: () => V): V {
    let v = map.get(rowKey);
    if (v === undefined) {
      v = empty();
      map.set(rowKey, v);
      this.undo(() => map.delete(rowKey));
    } else {
      const before = clone(v);
      this.undo(() => map.set(rowKey, before));
    }
    return v;
  }

  private applyMatch(j: Match, facts: FactMatch[], appearances: Appearance[]): void {
    const side = (club: string, gm: number, gs: number) => {
      const r = this.upsert(this.standing, [j.competition, j.season, club].join("\u0000"), emptyLine);
      const v = gm > gs ? 1 : 0;
      const e = gm === gs ? 1 : 0;
      r.matches++;
      r.wins += v;
      r.draws += e;
      r.losses += gm < gs ? 1 : 0;
      r.gm += gm;
      r.gs += gs;
      r.matchesPoints += v * this.points.win + e * this.points.draw;
    };
    side(j.home, j.homeGoals, j.awayGoals);
    side(j.away, j.awayGoals, j.homeGoals);
    const stat = (player: string, club: string) => this.upsert(this.stats, [player, j.season, club, j.competition].join("\u0000"), emptyStat);
    for (const p of appearances) {
      const s = stat(p.player, p.club);
      s.matches += p.minutes > 0 ? 1 : 0;
      s.minutes += p.minutes;
    }
    for (const f of facts) {
      if (f.type === "G" && f.extra !== "auto") stat(f.player, f.club).goals++;
      else if (f.type === "A") stat(f.player, f.club).assists++;
      else if (f.type === "CA") stat(f.player, f.club).yellows++;
      else if (f.type === "CV") stat(f.player, f.club).reds++;
    }
  }

  match(id: string): Match | undefined {
    const r = this.matches.get(id);
    return r ? { ...r.match } : undefined;
  }

  meetings(a: string, b: string, limit: number): Match[] {
    return [...this.matches.values()]
      .filter((r) => (r.match.home === a && r.match.away === b) || (r.match.home === b && r.match.away === a))
      .sort((x, y) => cmp(y.match.date, x.match.date) || cmp(y.match.id, x.match.id))
      .slice(0, Math.max(0, limit))
      .map((r) => ({ ...r.match }));
  }

  competitionMatches(competition: string, season: number): Match[] {
    return [...this.matches.values()]
      .filter((r) => r.match.competition === competition && r.match.season === season)
      .sort((a, b) => a.match.round - b.match.round || cmp(a.match.date, b.match.date) || cmp(a.match.id, b.match.id))
      .map((r) => ({ ...r.match }));
  }

  scorers(competition: string, season: number, round: number): Scorer[] {
    return [...this.matches.values()]
      .filter((r) => r.match.competition === competition && r.match.season === season && r.match.round === round)
      .sort((a, b) => cmp(a.match.date, b.match.date) || cmp(a.match.id, b.match.id))
      .flatMap((r) =>
        r.facts
          .filter((f) => f.type === "G")
          .map((f, i) => ({ f, i }))
          .sort((a, b) => a.f.minute - b.f.minute || a.i - b.i)
          .map(({ f }) => ({ player: f.player, club: f.club, minute: f.minute, match: r.match.id })),
      );
  }

  cards(competition: string, season: number, players: readonly string[]): CardRecord[] {
    const who = new Set(players);
    return [...this.matches.values()]
      .filter((r) => r.match.competition === competition && r.match.season === season)
      .sort((a, b) => a.match.round - b.match.round || cmp(a.match.date, b.match.date) || cmp(a.match.id, b.match.id))
      .flatMap((r) =>
        r.facts
          .map((f, i) => ({ f, i }))
          .filter(({ f }) => (f.type === "CA" || f.type === "CV") && who.has(f.player))
          .sort((a, b) => a.f.minute - b.f.minute || a.i - b.i)
          .map(({ f }) => ({ player: f.player, match: r.match.id, round: r.match.round, minute: f.minute, type: f.type as "CA" | "CV", extra: f.extra ?? "" })),
      );
  }

  playedMinutes(players: readonly string[], since: IsoDate, until: IsoDate): Map<string, number> {
    const who = new Set(players);
    const out = new Map<string, number>();
    for (const r of this.matches.values()) {
      if (r.match.date < since || r.match.date >= until) continue;
      for (const p of r.part) if (who.has(p.player) && p.minutes > 0) out.set(p.player, (out.get(p.player) ?? 0) + p.minutes);
    }
    return out;
  }

  playedRounds(club: string, competition: string, season: number): number[] {
    const js = new Set<number>();
    for (const r of this.matches.values()) if (r.match.competition === competition && r.match.season === season && (r.match.home === club || r.match.away === club)) js.add(r.match.round);
    return [...js].sort((a, b) => a - b);
  }

  standings(competition: string, season: number): StandingsLine[] {
    const prefix = `${competition}\u0000${season}\u0000`;
    return [...this.standing.entries()]
      .filter(([k]) => k.startsWith(prefix))
      .map(([k, r]) => ({
        club: k.slice(prefix.length), matches: r.matches, wins: r.wins, draws: r.draws, losses: r.losses,
        scoredGoals: r.gm, concededGoals: r.gs, matchesPoints: r.matchesPoints, adjustment: r.adjustment, points: r.matchesPoints + r.adjustment,
      }))
      .sort((a, b) => b.points - a.points || b.scoredGoals - b.concededGoals - (a.scoredGoals - a.concededGoals) || b.scoredGoals - a.scoredGoals || cmp(a.club, b.club));
  }

  playerStats(player: string): PlayerStatLine[] {
    return [...this.stats.entries()]
      .map(([k, s]) => {
        const [player, season, club, competition] = k.split("\u0000") as [string, string, string, string];
        return { player: player, season: Number(season), club, competition, ...s };
      })
      .filter((l) => l.player === player)
      .sort((a, b) => a.season - b.season || cmp(a.competition, b.competition) || cmp(a.club, b.club));
  }

  playerStatsForCompetition(competition: string, season: number): PlayerCompetitionStats[] {
    const ratings = new Map<string, { sum: number; n: number }>();
    for (const r of this.matches.values()) {
      if (r.match.competition !== competition || r.match.season !== season) continue;
      for (const p of r.part) {
        if (p.rating === undefined) continue;
        const a = ratings.get(p.player) ?? { sum: 0, n: 0 };
        a.sum += p.rating;
        a.n++;
        ratings.set(p.player, a);
      }
    }
    return [...this.stats.entries()]
      .map(([k, s]) => {
        const [player, season, club, comp] = k.split("\u0000") as [string, string, string, string];
        return { player: player, season: Number(season), club, competition: comp, ...s };
      })
      .filter((l) => l.competition === competition && l.season === season)
      .map((l): PlayerCompetitionStats => {
        const n = ratings.get(l.player);
        return { ...l, ratedGames: n?.n ?? 0, ...(n ? { avgRating: n.sum / n.n } : {}) };
      })
      .sort((a, b) => cmp(a.player, b.player));
  }

  adjustStandings(a: StandingsAdjustment): void {
    if (a.event < 1 || a.event > this.events.length) throw new Error(`ajuste aponta para um evento inexistente (${a.event})`);
    this.transaction(() => {
      this.adjustments.push({ ...a });
      this.undo(() => this.adjustments.pop());
      this.upsert(this.standing, [a.competition, a.season, a.club].join("\u0000"), emptyLine).adjustment += a.points;
    });
  }

  rebuildDerived(): void {
    this.transaction(() => {
      const beforeStanding = this.standing;
      const beforeStats = this.stats;
      this.undo(() => ((this.standing = beforeStanding), (this.stats = beforeStats)));
      this.standing = new Map();
      this.stats = new Map();
      for (const r of this.matches.values()) this.applyMatch(r.match, r.facts, r.part);
      for (const a of this.adjustments) this.upsert(this.standing, [a.competition, a.season, a.club].join("\u0000"), emptyLine).adjustment += a.points;
    });
  }

  // ---------- conhecimento
  appendObservation(o: NewObservation): number {
    const id = this.obs.length + 1;
    this.obs.push({ ...clone(o), id });
    this.undo(() => this.obs.pop());
    return id;
  }

  observations(observer: string, target: Pick<RefEntity, "k" | "id">, group?: string): Observation[] {
    return this.obs
      .filter((o) => o.observer === observer && o.targetK === target.k && o.targetId === target.id && (group === undefined || o.group === group))
      .reverse()
      .map((o) => clone(o));
  }
}
