/**
 * Repositório sobre SQLite (RZ-128). Recebe um `DriverSql` já aberto; chama `migrate` ao criar.
 * Quem fala SQL é só este ficheiro e o esquema.
 */
import type { DriverSql, SqlLine, SqlValue } from "./driver";
import { migrate, SCHEMA_VERSION } from "./schema";
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
  PlayerPatch,
  CompanyRecord,
  CompanyPatch,
  CompanyState,
  SponsorshipRecord,
  SponsorshipKind,
  NewSponsorship,
  CompanyScale,
  PlayerState,
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
  EntityType,
  Visibility,
} from "./types";
import { validateNewEvent, validateMatch } from "./validation";

const Visibility: Visibility[] = ["exposed", "private", "secret"];
const visibilityIn = (v: Visibility) => Visibility.indexOf(v);
const within = (v: SqlValue | undefined) => Number(v);
const txt = (v: SqlValue | undefined) => String(v);

export class SqliteRepository implements Repository {
  readonly schemaVersion = SCHEMA_VERSION;
  private depth = 0;

  constructor(
    private readonly d: DriverSql,
    private readonly points: PointsPerResult = { win: 3, draw: 1 },
  ) {
    migrate(d);
  }

  /** Bytes do ficheiro `.sqlite` completo (RZ-134 comprime e dá o nome .raizes). */
  exportSqlite(): Uint8Array {
    return this.d.exported();
  }
  close(): void {
    this.d.close();
  }

  restart(): void {
    if (this.depth > 0) throw new Error("reiniciar() não pode correr dentro de uma transação");
    const tables = this.d.all("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").map((r) => txt(r.name));
    this.d.runScript("PRAGMA foreign_keys = OFF");
    this.d.runScript("BEGIN");
    try {
      for (const t of tables) this.d.runScript(`DROP TABLE IF EXISTS "${t}"`);
      this.d.runScript("PRAGMA user_version = 0");
      this.d.runScript("COMMIT");
    } catch (e) {
      this.d.runScript("ROLLBACK");
      throw e;
    } finally {
      this.d.runScript("PRAGMA foreign_keys = ON");
    }
    migrate(this.d);
  }

  transaction<T>(fn: () => T): T {
    const level = this.depth;
    const sp = `sp${level}`;
    this.d.runScript(level === 0 ? "BEGIN IMMEDIATE" : `SAVEPOINT ${sp}`);
    this.depth++;
    try {
      const r = fn();
      this.depth--;
      this.d.runScript(level === 0 ? "COMMIT" : `RELEASE ${sp}`);
      return r;
    } catch (e) {
      this.depth--;
      this.d.runScript(level === 0 ? "ROLLBACK" : `ROLLBACK TO ${sp}; RELEASE ${sp}`);
      throw e;
    }
  }

  // ---------- meta
  meta(rowKey: string): string | undefined {
    const r = this.d.all("SELECT value FROM meta WHERE key = ?", [rowKey])[0];
    return r ? txt(r.value) : undefined;
  }
  setMeta(rowKey: string, value: string): void {
    this.d.run("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [rowKey, value]);
  }

  // ---------- localidades
  private localityRecord(r: SqlLine): LocalityRecord {
    return { id: txt(r.id), name: txt(r.name), city: txt(r.city), population: within(r.population), status: txt(r.status) as LocalityRecord["status"], since: txt(r.since) };
  }
  saveLocalities(localities: readonly LocalityRecord[]): void {
    this.transaction(() => {
      if (within(this.d.all("SELECT COUNT(*) AS n FROM locality")[0]?.n) > 0) throw new Error("O save já tem localidades");
      for (const l of localities)
        this.d.run("INSERT INTO locality (id, name, city, population, status, since) VALUES (?,?,?,?,?,?)", [l.id, l.name, l.city, l.population, l.status, l.since]);
    });
  }
  locality(id: string): LocalityRecord | undefined {
    const r = this.d.all("SELECT * FROM locality WHERE id = ?", [id])[0];
    return r ? this.localityRecord(r) : undefined;
  }
  localities(filter: { city?: string } = {}): LocalityRecord[] {
    const rs = filter.city === undefined ? this.d.all("SELECT * FROM locality ORDER BY id") : this.d.all("SELECT * FROM locality WHERE city = ? ORDER BY id", [filter.city]);
    return rs.map((r) => this.localityRecord(r));
  }
  updateLocality(id: string, a: LocalityUpdate): { event?: number } {
    return this.transaction(() => {
      const before = this.locality(id);
      if (!before) throw new Error(`Localidade inexistente: ${id}`);
      if (!(a.population >= 0)) throw new Error("população inválida");
      if (a.status === before.status) {
        this.d.run("UPDATE locality SET population = ? WHERE id = ?", [a.population, id]);
        return {};
      }
      const event = this.appendEvent({
        type: "LOCALITY_STATUS", date: a.date, season: a.season, visibility: "exposed",
        entities: [{ k: "locality", id }, { k: "city", id: before.city }],
        ...(a.cause !== undefined ? { cause: a.cause } : {}),
        data: { from: before.status, to: a.status, population: a.population },
      });
      this.d.run("UPDATE locality SET population = ?, status = ?, since = ? WHERE id = ?", [a.population, a.status, a.date, id]);
      return { event };
    });
  }

  // ---------- pessoas
  private insertPerson(p: PersonRecord): void {
    this.d.run("INSERT INTO person (id, name, sporting_name, birth, nationality, native_of, roles, personality, archetype, lod) VALUES (?,?,?,?,?,?,?,?,?,?)", [
      p.id, p.name, p.sportingName, p.birth, p.nationality, p.birthCity ?? null, JSON.stringify(p.roles), JSON.stringify(p.personality), p.archetype, p.lod,
    ]);
  }
  private insertPlayer(j: PlayerRecord): void {
    this.d.run("INSERT INTO player (person, positions, attributes, potential, height, weight, foot, club, state) VALUES (?,?,?,?,?,?,?,?,?)", [
      j.person, JSON.stringify(j.positions), JSON.stringify(j.attributes), j.potential, j.heightCm, j.weightKg, j.pe, j.club ?? null, j.state,
    ]);
  }
  saveWorld(batch: WorldBatchRecord, onProgress?: (done: number, total: number) => void): void {
    this.transaction(() => {
      if (this.peopleTotal() > 0) throw new Error("O save já tem pessoas");
      const total = batch.people.length + batch.players.length + batch.contracts.length + batch.roles.length;
      let done = 0;
      const tick = () => {
        if (++done % 500 === 0) onProgress?.(done, total);
      };
      for (const p of batch.people) {
        this.insertPerson(p);
        tick();
      }
      for (const j of batch.players) {
        this.insertPlayer(j);
        tick();
      }
      for (const c of batch.contracts) {
        this.d.run("INSERT INTO contract (person, club, monthly_wage, start_date, end_date) VALUES (?,?,?,?,?)", [c.person, c.club, c.monthlyWage, c.start, c.end]);
        tick();
      }
      for (const c of batch.roles) {
        this.d.run("INSERT INTO role (person, role_function, club, city, quality) VALUES (?,?,?,?,?)", [c.person, c.fn, c.club ?? null, c.city ?? null, c.quality ? JSON.stringify(c.quality) : null]);
        tick();
      }
      onProgress?.(total, total);
    });
  }
  private companyOf(r: SqlLine): CompanyRecord {
    return {
      id: txt(r.id), name: txt(r.name), sector: txt(r.sector), scale: txt(r.scale) as CompanyScale, city: txt(r.city),
      ...(r.owner !== null ? { owner: txt(r.owner) } : {}), capital: within(r.capital), founded: within(r.founded), state: txt(r.state) as CompanyState,
    };
  }
  saveCompanies(companies: readonly CompanyRecord[]): void {
    this.transaction(() => {
      for (const c of companies) {
        this.d.run("INSERT INTO company (id, name, sector, scale, city, owner, capital, founded, state) VALUES (?,?,?,?,?,?,?,?,?)", [c.id, c.name, c.sector, c.scale, c.city, c.owner ?? null, c.capital, c.founded, c.state]);
      }
    });
  }
  company(id: string): CompanyRecord | undefined {
    const r = this.d.all("SELECT * FROM company WHERE id = ?", [id])[0];
    return r ? this.companyOf(r) : undefined;
  }
  companies(filter: { city?: string; state?: CompanyState } = {}): CompanyRecord[] {
    const where: string[] = [];
    const args: (string | number | null)[] = [];
    if (filter.city !== undefined) { where.push("city = ?"); args.push(filter.city); }
    if (filter.state !== undefined) { where.push("state = ?"); args.push(filter.state); }
    return this.d.all(`SELECT * FROM company ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY id`, args).map((r) => this.companyOf(r));
  }
  updateCompany(id: string, patch: CompanyPatch): void {
    const before = this.company(id);
    if (!before) throw new Error(`Unknown company: ${id}`);
    const next: CompanyRecord = { ...before };
    if (patch.capital !== undefined) next.capital = patch.capital;
    if (patch.state) next.state = patch.state;
    if (patch.scale) next.scale = patch.scale;
    if (patch.owner === null) delete next.owner;
    else if (patch.owner !== undefined) next.owner = patch.owner;
    this.d.run("UPDATE company SET capital = ?, state = ?, scale = ?, owner = ? WHERE id = ?", [next.capital, next.state, next.scale, next.owner ?? null, id]);
  }
  private sponsorshipOf(r: SqlLine): SponsorshipRecord {
    return {
      id: within(r.id), company: txt(r.company), club: txt(r.club), kind: txt(r.kind) as SponsorshipKind, annualValue: within(r.annual_value),
      start: txt(r.start_date), end: txt(r.end_date), ...(r.ended !== null ? { ended: txt(r.ended) } : {}),
    };
  }
  addSponsorship(s: NewSponsorship): number {
    this.d.run("INSERT INTO sponsorship (company, club, kind, annual_value, start_date, end_date) VALUES (?,?,?,?,?,?)", [s.company, s.club, s.kind, s.annualValue, s.start, s.end]);
    return within(this.d.all("SELECT last_insert_rowid() AS id")[0]?.id);
  }
  endSponsorship(id: number, date: IsoDate): void {
    if (this.d.all("SELECT id FROM sponsorship WHERE id = ?", [id]).length === 0) throw new Error(`Unknown sponsorship: ${id}`);
    this.d.run("UPDATE sponsorship SET ended = ? WHERE id = ?", [date, id]);
  }
  private sponsorshipsWhere(column: "club" | "company" | null, value: string | null, on?: IsoDate): SponsorshipRecord[] {
    const where: string[] = [];
    const args: (string | number | null)[] = [];
    if (column) { where.push(`${column} = ?`); args.push(value); }
    if (on === undefined) where.push("ended IS NULL");
    else { where.push("start_date <= ? AND ? <= end_date AND (ended IS NULL OR ? < ended)"); args.push(on, on, on); }
    return this.d.all(`SELECT * FROM sponsorship WHERE ${where.join(" AND ")} ORDER BY id`, args).map((r) => this.sponsorshipOf(r));
  }
  clubSponsorships(club: string, on?: IsoDate): SponsorshipRecord[] {
    return this.sponsorshipsWhere("club", club, on);
  }
  companySponsorships(company: string, on?: IsoDate): SponsorshipRecord[] {
    return this.sponsorshipsWhere("company", company, on);
  }
  activeSponsorships(on: IsoDate): SponsorshipRecord[] {
    return this.sponsorshipsWhere(null, null, on);
  }
  addPeople(batch: WorldBatchRecord): void {
    this.transaction(() => {
      for (const p of batch.people) this.insertPerson(p);
      for (const j of batch.players) this.insertPlayer(j);
      for (const c of batch.contracts) this.saveContract(c);
      for (const c of batch.roles) this.d.run("INSERT INTO role (person, role_function, club, city, quality) VALUES (?,?,?,?,?)", [c.person, c.fn, c.club ?? null, c.city ?? null, c.quality ? JSON.stringify(c.quality) : null]);
    });
  }
  updatePlayer(person: string, patch: PlayerPatch): void {
    const before = this.player(person);
    if (!before) throw new Error(`Unknown player: ${person}`);
    const next: PlayerRecord = { ...before };
    if (patch.attributes) next.attributes = { ...patch.attributes };
    if (patch.potential !== undefined) next.potential = patch.potential;
    if (patch.positions) next.positions = patch.positions.map((x) => ({ ...x }));
    if (patch.state) next.state = patch.state;
    if (patch.club === null) delete next.club;
    else if (patch.club !== undefined) next.club = patch.club;
    this.d.run("UPDATE player SET positions = ?, attributes = ?, potential = ?, club = ?, state = ? WHERE person = ?", [
      JSON.stringify(next.positions), JSON.stringify(next.attributes), next.potential, next.club ?? null, next.state, person,
    ]);
  }
  saveContract(c: ContractRecord): void {
    this.d.run("INSERT INTO contract (person, club, monthly_wage, start_date, end_date) VALUES (?,?,?,?,?)", [c.person, c.club, c.monthlyWage, c.start, c.end]);
  }
  playersByState(state: PlayerState): PlayerRecord[] {
    return this.d.all("SELECT * FROM player WHERE state = ? ORDER BY person", [state]).map((r) => this.playerOf(r));
  }
  peopleTotal(): number {
    return within(this.d.all("SELECT COUNT(*) AS n FROM person")[0]?.n);
  }
  peopleIndex(): PersonIndex[] {
    return this.d
      .all(
        "SELECT p.id, p.name, p.sporting_name, j.positions, j.club AS player_club, c.role_function, c.club AS role_club FROM person p LEFT JOIN player j ON j.person = p.id LEFT JOIN role c ON c.person = p.id ORDER BY p.id",
      )
      .map((r) => {
        const club = r.player_club ?? r.role_club;
        const pos = r.positions === null ? undefined : (JSON.parse(txt(r.positions)) as { pos: string }[])[0]?.pos;
        return {
          id: txt(r.id), name: txt(r.name), sportingName: txt(r.sporting_name),
          ...(club !== null ? { club: txt(club) } : {}), ...(pos !== undefined ? { position: pos } : {}), ...(r.role_function !== null ? { fn: txt(r.role_function) } : {}),
        };
      });
  }
  private exposed(r: SqlLine): PublicPerson {
    const pos = r.positions === null || r.positions === undefined ? undefined : (JSON.parse(txt(r.positions)) as { pos: string }[])[0]?.pos;
    const club = r.player_club ?? r.role_club;
    return {
      id: txt(r.id),
      name: txt(r.name),
      sportingName: txt(r.sporting_name),
      birth: txt(r.birth),
      nationality: txt(r.nationality),
      ...(r.native_of !== null && r.native_of !== undefined ? { birthCity: txt(r.native_of) } : {}),
      roles: JSON.parse(txt(r.roles)) as string[],
      ...(club !== null && club !== undefined ? { club: txt(club) } : {}),
      ...(r.role_function !== null && r.role_function !== undefined ? { fn: txt(r.role_function) } : {}),
      ...(pos !== undefined
        ? { player: { position: pos, heightCm: within(r.height), weightKg: within(r.weight), pe: txt(r.foot) as "D" | "E" | "A", state: txt(r.state) as PlayerState } }
        : {}),
    };
  }
  private static readonly PUBLIC_SELECT =
    "SELECT p.id, p.name, p.sporting_name, p.birth, p.nationality, p.native_of, p.roles, j.positions, j.height, j.weight, j.foot, j.state, j.club AS player_club, c.role_function, c.club AS role_club " +
    "FROM person p LEFT JOIN player j ON j.person = p.id LEFT JOIN role c ON c.person = p.id";
  publicPerson(id: string): PublicPerson | undefined {
    const r = this.d.all(`${SqliteRepository.PUBLIC_SELECT} WHERE p.id = ?`, [id])[0];
    return r ? this.exposed(r) : undefined;
  }
  publicSquad(club: string): PublicPerson[] {
    return this.d
      .all(`${SqliteRepository.PUBLIC_SELECT} WHERE j.club = ? AND j.state = 'active' ORDER BY p.sporting_name, p.id`, [club])
      .map((r) => this.exposed(r));
  }
  publicRoles(filter: { club?: string; city?: string }): PublicPerson[] {
    const where: string[] = [];
    const params: SqlValue[] = [];
    if (filter.club !== undefined) { where.push("c.club = ?"); params.push(filter.club); }
    if (filter.city !== undefined) { where.push("c.city = ?"); params.push(filter.city); }
    if (where.length === 0) return [];
    return this.d.all(`${SqliteRepository.PUBLIC_SELECT} WHERE ${where.join(" AND ")} ORDER BY c.role_function, p.id`, params).map((r) => this.exposed(r));
  }
  person(id: string): PersonRecord | undefined {
    const r = this.d.all("SELECT * FROM person WHERE id = ?", [id])[0];
    if (!r) return undefined;
    return {
      id: txt(r.id), name: txt(r.name), sportingName: txt(r.sporting_name), birth: txt(r.birth), nationality: txt(r.nationality),
      ...(r.native_of !== null ? { birthCity: txt(r.native_of) } : {}),
      roles: JSON.parse(txt(r.roles)) as string[], personality: JSON.parse(txt(r.personality)) as Record<string, number>,
      archetype: txt(r.archetype), lod: within(r.lod) as 1 | 2 | 3,
    };
  }
  private playerOf(r: SqlLine): PlayerRecord {
    return {
      person: txt(r.person), positions: JSON.parse(txt(r.positions)) as { pos: string; aptitude: number }[], attributes: JSON.parse(txt(r.attributes)) as Record<string, number>,
      potential: within(r.potential), heightCm: within(r.height), weightKg: within(r.weight), pe: txt(r.foot) as "D" | "E" | "A",
      ...(r.club !== null ? { club: txt(r.club) } : {}), state: txt(r.state) as PlayerState,
    };
  }
  player(person: string): PlayerRecord | undefined {
    const r = this.d.all("SELECT * FROM player WHERE person = ?", [person])[0];
    return r ? this.playerOf(r) : undefined;
  }
  clubPlayers(club: string): PlayerRecord[] {
    return this.d.all("SELECT * FROM player WHERE club = ? ORDER BY person", [club]).map((r) => this.playerOf(r));
  }
  contract(person: string): ContractRecord | undefined {
    const r = this.d.all("SELECT * FROM contract WHERE person = ? ORDER BY id DESC LIMIT 1", [person])[0];
    return r ? { person: txt(r.person), club: txt(r.club), monthlyWage: within(r.monthly_wage), start: txt(r.start_date), end: txt(r.end_date) } : undefined;
  }
  role(person: string): RoleRecord | undefined {
    const r = this.d.all("SELECT * FROM role WHERE person = ?", [person])[0];
    if (!r) return undefined;
    return {
      person: txt(r.person), fn: txt(r.role_function),
      ...(r.club !== null ? { club: txt(r.club) } : {}), ...(r.city !== null ? { city: txt(r.city) } : {}),
      ...(r.quality !== null ? { quality: JSON.parse(txt(r.quality)) as Record<string, number> } : {}),
    };
  }

  // ---------- calendário
  saveCalendar(matches: readonly ScheduledMatch[], byes: readonly ScheduledBye[]): void {
    const keys = new Set([...matches, ...byes].map((x) => `${x.competition}\u0000${x.season}\u0000${x.round}`));
    this.transaction(() => {
      for (const k of keys) {
        const [c, e, r] = k.split("\u0000") as [string, string, string];
        if (within(this.d.all("SELECT COUNT(*) AS n FROM scheduled_match WHERE competition = ? AND season = ? AND round = ?", [c, Number(e), Number(r)])[0]?.n) > 0)
          throw new Error(`Já existe calendário de ${c} na época ${e}, jornada ${r}`);
      }
      for (const j of matches)
        this.d.run("INSERT INTO scheduled_match (id, competition, season, round, date, home, away, knockout, neutral, venue, first_leg) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
          [j.id, j.competition, j.season, j.round, j.date, j.home, j.away, j.knockout ? 1 : 0, j.neutral ? 1 : 0, j.venue ?? null, j.firstLeg ?? null]);
      for (const f of byes)
        this.d.run("INSERT INTO scheduled_bye (competition, season, round, club) VALUES (?,?,?,?)", [f.competition, f.season, f.round, f.club]);
    });
  }
  private scheduledMatch(r: SqlLine): ScheduledMatch {
    return {
      id: txt(r.id), competition: txt(r.competition), season: within(r.season), round: within(r.round), date: txt(r.date), home: txt(r.home), away: txt(r.away),
      ...(within(r.knockout) ? { knockout: true } : {}), ...(within(r.neutral) ? { neutral: true } : {}),
      ...(r.venue !== null ? { venue: txt(r.venue) } : {}), ...(r.first_leg !== null ? { firstLeg: txt(r.first_leg) } : {}),
    };
  }
  calendar(competition: string, season: number): { matches: ScheduledMatch[]; byes: ScheduledBye[] } {
    const matches = this.d.all("SELECT * FROM scheduled_match WHERE competition = ? AND season = ? ORDER BY round, id", [competition, season]).map((r) => this.scheduledMatch(r));
    const byes = this.d
      .all("SELECT * FROM scheduled_bye WHERE competition = ? AND season = ? ORDER BY round", [competition, season])
      .map((r) => ({ competition: txt(r.competition), season: within(r.season), round: within(r.round), club: txt(r.club) }));
    return { matches, byes };
  }
  clubCalendar(club: string, season: number): ScheduledMatch[] {
    return this.d.all("SELECT * FROM scheduled_match WHERE season = ? AND (home = ? OR away = ?) ORDER BY date, id", [season, club, club]).map((r) => this.scheduledMatch(r));
  }
  dayMatches(date: IsoDate): ScheduledMatch[] {
    return this.d.all("SELECT * FROM scheduled_match WHERE date = ? ORDER BY id", [date]).map((r) => this.scheduledMatch(r));
  }
  nextMatch(club: string, since: IsoDate): ScheduledMatch | undefined {
    const r = this.d.all("SELECT * FROM scheduled_match WHERE (home = ? OR away = ?) AND date >= ? ORDER BY date, id LIMIT 1", [club, club, since])[0];
    return r ? this.scheduledMatch(r) : undefined;
  }

  // ---------- história
  appendEvent(e: NewEvent): number {
    validateNewEvent(e);
    return this.transaction(() => {
      const { lastId } = this.d.run(
        "INSERT INTO event (type, v, date, season, round, visibility, cause, corrects, origin, data) VALUES (?,?,?,?,?,?,?,?,?,?)",
        [e.type, e.v ?? 1, e.date, e.season, e.round ?? null, visibilityIn(e.visibility), e.cause ?? null, e.fixes ?? null, e.origin ?? "match", JSON.stringify(e.data)],
      );
      for (const x of e.entities)
        this.d.run("INSERT INTO event_entity (k, id, event, role_kind) VALUES (?,?,?,?)", [x.k, x.id, lastId, x.roleKind ?? null]);
      return lastId;
    });
  }

  private forEvents(lines: SqlLine[]): HistoryEvent[] {
    const entities = new Map<number, RefEntity[]>();
    for (let i = 0; i < lines.length; i += 400) {
      const ids = lines.slice(i, i + 400).map((l) => within(l.id));
      const rs = this.d.all(
        `SELECT event, k, id, role_kind FROM event_entity WHERE event IN (${ids.map(() => "?").join(",")}) ORDER BY event, k, id`,
        ids,
      );
      for (const r of rs) {
        const list = entities.get(within(r.event)) ?? [];
        list.push({ k: txt(r.k) as EntityType, id: txt(r.id), ...(r.role_kind !== null ? { roleKind: txt(r.role_kind) } : {}) });
        entities.set(within(r.event), list);
      }
    }
    return lines.map((l) => ({
      id: within(l.id),
      type: txt(l.type),
      v: within(l.v),
      date: txt(l.date),
      season: within(l.season),
      ...(l.round !== null ? { round: within(l.round) } : {}),
      visibility: Visibility[within(l.visibility)] as Visibility,
      entities: entities.get(within(l.id)) ?? [],
      ...(l.cause !== null ? { cause: within(l.cause) } : {}),
      ...(l.corrects !== null ? { fixes: within(l.corrects) } : {}),
      origin: txt(l.origin) as HistoryEvent["origin"],
      data: JSON.parse(txt(l.data)) as Record<string, unknown>,
    }));
  }

  event(id: number): HistoryEvent | undefined {
    return this.forEvents(this.d.all("SELECT * FROM event WHERE id = ?", [id]))[0];
  }

  eventsTotal(): number {
    return within(this.d.all("SELECT COUNT(*) AS n FROM event")[0]?.n);
  }

  eventsOf(entity: Pick<RefEntity, "k" | "id">, f: EventsFilter = {}): HistoryEvent[] {
    const where = ["x.k = ?", "x.id = ?"];
    const p: SqlValue[] = [entity.k, entity.id];
    if (f.publicOnly) where.push("e.visibility = 0");
    if (f.visibility) {
      where.push(`e.visibility IN (${f.visibility.map(() => "?").join(",") || "NULL"})`);
      p.push(...f.visibility.map(visibilityIn));
    }
    if (f.type !== undefined) {
      where.push("e.type = ?");
      p.push(f.type);
    }
    if (f.seasonSince !== undefined) {
      where.push("e.season >= ?");
      p.push(f.seasonSince);
    }
    if (f.untilSeason !== undefined) {
      where.push("e.season <= ?");
      p.push(f.untilSeason);
    }
    if (f.afterOf !== undefined) { where.push("e.id > ?"); p.push(f.afterOf); }
    if (f.beforeOf !== undefined) { where.push("e.id < ?"); p.push(f.beforeOf); }
    p.push(f.limit ?? -1);
    return this.forEvents(
      this.d.all(`SELECT e.* FROM event_entity x JOIN event e ON e.id = x.event WHERE ${where.join(" AND ")} ORDER BY e.id DESC LIMIT ?`, p),
    );
  }

  recentEvents(f: RecentFilter = {}): HistoryEvent[] {
    const where: string[] = ["1 = 1"];
    const p: SqlValue[] = [];
    if (f.publicOnly) where.push("visibility = 0");
    if (f.types) {
      where.push(`type IN (${f.types.map(() => "?").join(",") || "NULL"})`);
      p.push(...f.types);
    }
    if (f.afterOf !== undefined) { where.push("id > ?"); p.push(f.afterOf); }
    if (f.beforeOf !== undefined) { where.push("id < ?"); p.push(f.beforeOf); }
    p.push(f.limit ?? -1);
    return this.forEvents(this.d.all(`SELECT * FROM event WHERE ${where.join(" AND ")} ORDER BY id DESC LIMIT ?`, p));
  }

  count(type: string, entity?: Pick<RefEntity, "k" | "id">, i: { seasonSince?: number; untilSeason?: number } = {}): number {
    const where = ["e.type = ?"];
    const p: SqlValue[] = [type];
    if (entity) {
      where.push("e.id IN (SELECT event FROM event_entity WHERE k = ? AND id = ?)");
      p.push(entity.k, entity.id);
    }
    if (i.seasonSince !== undefined) {
      where.push("e.season >= ?");
      p.push(i.seasonSince);
    }
    if (i.untilSeason !== undefined) {
      where.push("e.season <= ?");
      p.push(i.untilSeason);
    }
    return within(this.d.all(`SELECT COUNT(*) AS n FROM event e WHERE ${where.join(" AND ")}`, p)[0]?.n);
  }

  last(type: string, entity: Pick<RefEntity, "k" | "id">): HistoryEvent | undefined {
    return this.eventsOf(entity, { type, limit: 1 })[0];
  }
  lastN(type: string, entity: Pick<RefEntity, "k" | "id">, n: number): HistoryEvent[] {
    return this.eventsOf(entity, { type, limit: n });
  }

  chain(eventId: number): HistoryEvent[] {
    return this.forEvents(
      this.d.all(
        `WITH RECURSIVE
           acima(id, cause) AS (SELECT id, cause FROM event WHERE id = ? UNION ALL SELECT e.id, e.cause FROM event e JOIN acima a ON e.id = a.cause),
           abaixo(id) AS (SELECT id FROM event WHERE id = ? UNION ALL SELECT e.id FROM event e JOIN abaixo b ON e.cause = b.id)
         SELECT * FROM event WHERE id IN (SELECT id FROM acima UNION SELECT id FROM abaixo) ORDER BY id`,
        [eventId, eventId],
      ),
    );
  }

  exportNdjson(): string {
    const lines: string[] = [];
    for (let since = 0; ; ) {
      const batch = this.d.all("SELECT * FROM event WHERE id > ? ORDER BY id LIMIT 1000", [since]);
      if (batch.length === 0) break;
      for (const e of this.forEvents(batch)) lines.push(JSON.stringify(e));
      since = within(batch[batch.length - 1]?.id);
    }
    return lines.length === 0 ? "" : lines.join("\n") + "\n";
  }

  // ---------- jogos
  recordMatch(j: NewMatch, facts: FactMatch[], appearances: Appearance[]): { event: number } {
    validateMatch(j, facts, appearances);
    return this.transaction(() => {
      if (this.d.all("SELECT 1 AS x FROM match WHERE id = ?", [j.id]).length > 0) throw new Error(`Jogo ${j.id} já existe`);
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
      this.d.run(
        `INSERT INTO match (id, competition, season, round, date, home, away, home_goals, away_goals, home_xg, away_xg, home_possession,
           attendance, revenue, importance, referee, event, extra_time, home_penalties, away_penalties) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [j.id, j.competition, j.season, j.round, j.date, j.home, j.away, j.homeGoals, j.awayGoals, j.homeXg ?? 0, j.awayXg ?? 0,
         j.homePossession ?? 0.5, j.attendance ?? 0, j.revenue ?? 0, j.importance ?? 0, j.referee ?? "", event,
         j.extraTime ? 1 : 0, j.homePenalties ?? null, j.awayPenalties ?? null],
      );
      for (const f of facts)
        this.d.run("INSERT INTO match_fact (match, minute, type, player, club, extra) VALUES (?,?,?,?,?,?)", [j.id, f.minute, f.type, f.player, f.club, f.extra ?? ""]);
      for (const p of appearances)
        this.d.run("INSERT INTO appearance (match, player, club, starter, minutes, rating) VALUES (?,?,?,?,?,?)", [j.id, p.player, p.club, p.starter ? 1 : 0, p.minutes, p.rating ?? null]);
      this.updateDerived(j, facts, appearances);
      return { event };
    });
  }

  private updateDerived(j: NewMatch, facts: FactMatch[], appearances: Appearance[]): void {
    const side = (club: string, gm: number, gs: number) => {
      const v = gm > gs ? 1 : 0;
      const e = gm === gs ? 1 : 0;
      this.d.run(
        `INSERT INTO standings (competition, season, club, matches, wins, draws, losses, goals_for, goals_against, match_points)
         VALUES (?,?,?,1,?,?,?,?,?,?)
         ON CONFLICT(competition, season, club) DO UPDATE SET matches = matches + 1, wins = wins + excluded.wins,
           draws = draws + excluded.draws, losses = losses + excluded.losses, goals_for = goals_for + excluded.goals_for,
           goals_against = goals_against + excluded.goals_against, match_points = match_points + excluded.match_points`,
        [j.competition, j.season, club, v, e, gm < gs ? 1 : 0, gm, gs, v * this.points.win + e * this.points.draw],
      );
    };
    side(j.home, j.homeGoals, j.awayGoals);
    side(j.away, j.awayGoals, j.homeGoals);

    type Acc = { club: string; player: string; matches: number; minutes: number; goals: number; assist: number; am: number; see: number };
    const acc = new Map<string, Acc>();
    const line = (player: string, club: string): Acc => {
      const k = `${player}\u0000${club}`;
      let a = acc.get(k);
      if (!a) acc.set(k, (a = { club, player, matches: 0, minutes: 0, goals: 0, assist: 0, am: 0, see: 0 }));
      return a;
    };
    for (const p of appearances) {
      const a = line(p.player, p.club);
      a.matches += p.minutes > 0 ? 1 : 0;
      a.minutes += p.minutes;
    }
    for (const f of facts) {
      if (f.type === "G" && f.extra !== "auto") line(f.player, f.club).goals++;
      else if (f.type === "A") line(f.player, f.club).assist++;
      else if (f.type === "CA") line(f.player, f.club).am++;
      else if (f.type === "CV") line(f.player, f.club).see++;
    }
    for (const a of acc.values())
      this.d.run(
        `INSERT INTO player_season_stat (player, season, club, competition, matches, minutes, goals, assists, yellows, reds)
         VALUES (?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(player, season, club, competition) DO UPDATE SET matches = matches + excluded.matches, minutes = minutes + excluded.minutes,
           goals = goals + excluded.goals, assists = assists + excluded.assists,
           yellows = yellows + excluded.yellows, reds = reds + excluded.reds`,
        [a.player, j.season, a.club, j.competition, a.matches, a.minutes, a.goals, a.assist, a.am, a.see],
      );
  }

  match(id: string): Match | undefined {
    const r = this.d.all("SELECT * FROM match WHERE id = ?", [id])[0];
    if (!r) return undefined;
    return {
      id: txt(r.id), competition: txt(r.competition), season: within(r.season), round: within(r.round), date: txt(r.date),
      home: txt(r.home), away: txt(r.away), homeGoals: within(r.home_goals), awayGoals: within(r.away_goals),
      homeXg: within(r.home_xg), awayXg: within(r.away_xg), homePossession: within(r.home_possession), attendance: within(r.attendance),
      revenue: within(r.revenue), importance: within(r.importance), referee: txt(r.referee), event: within(r.event), extraTime: within(r.extra_time) === 1,
      ...(r.home_penalties !== null ? { homePenalties: within(r.home_penalties) } : {}), ...(r.away_penalties !== null ? { awayPenalties: within(r.away_penalties) } : {}),
    };
  }

  meetings(a: string, b: string, limit: number): Match[] {
    return this.d
      .all("SELECT id FROM match WHERE (home = ? AND away = ?) OR (home = ? AND away = ?) ORDER BY date DESC, id DESC LIMIT ?", [a, b, b, a, Math.max(0, limit)])
      .map((r) => this.match(txt(r.id)) as Match);
  }

  competitionMatches(competition: string, season: number): Match[] {
    return this.d
      .all("SELECT id FROM match WHERE competition = ? AND season = ? ORDER BY round, date, id", [competition, season])
      .map((r) => this.match(txt(r.id)) as Match);
  }

  scorers(competition: string, season: number, round: number): Scorer[] {
    return this.d
      .all(
        `SELECT f.player, f.club, f.minute, f.match FROM match_fact f JOIN match j ON j.id = f.match
         WHERE j.competition = ? AND j.season = ? AND j.round = ? AND f.type = 'G' ORDER BY j.date, j.id, f.minute, f.rowid`,
        [competition, season, round],
      )
      .map((r) => ({ player: txt(r.player), club: txt(r.club), minute: within(r.minute), match: txt(r.match) }));
  }

  cards(competition: string, season: number, players: readonly string[]): CardRecord[] {
    if (players.length === 0) return [];
    return this.d
      .all(
        `SELECT f.player, f.match, j.round, f.minute, f.type, f.extra FROM match_fact f JOIN match j ON j.id = f.match
         WHERE j.competition = ? AND j.season = ? AND f.type IN ('CA', 'CV') AND f.player IN (${players.map(() => "?").join(",")})
         ORDER BY j.round, j.date, j.id, f.minute, f.rowid`,
        [competition, season, ...players],
      )
      .map((r) => ({ player: txt(r.player), match: txt(r.match), round: within(r.round), minute: within(r.minute), type: txt(r.type) as "CA" | "CV", extra: txt(r.extra) }));
  }

  playedMinutes(players: readonly string[], since: IsoDate, until: IsoDate): Map<string, number> {
    const out = new Map<string, number>();
    if (players.length === 0) return out;
    for (const r of this.d.all(
      `SELECT p.player, SUM(p.minutes) AS minutes FROM appearance p JOIN match j ON j.id = p.match
       WHERE p.player IN (${players.map(() => "?").join(",")}) AND j.date >= ? AND j.date < ? AND p.minutes > 0 GROUP BY p.player`,
      [...players, since, until],
    )) out.set(txt(r.player), within(r.minutes));
    return out;
  }

  playedRounds(club: string, competition: string, season: number): number[] {
    return this.d
      .all("SELECT DISTINCT round FROM match WHERE competition = ? AND season = ? AND (home = ? OR away = ?) ORDER BY round", [competition, season, club, club])
      .map((r) => within(r.round));
  }

  standings(competition: string, season: number): StandingsLine[] {
    return this.d
      .all(
        `SELECT *, match_points + adjustment AS points FROM standings WHERE competition = ? AND season = ?
         ORDER BY points DESC, goals_for - goals_against DESC, goals_for DESC, club`,
        [competition, season],
      )
      .map((r) => ({
        club: txt(r.club), matches: within(r.matches), wins: within(r.wins), draws: within(r.draws), losses: within(r.losses),
        scoredGoals: within(r.goals_for), concededGoals: within(r.goals_against), matchesPoints: within(r.match_points), adjustment: within(r.adjustment), points: within(r.points),
      }));
  }

  playerStats(player: string): PlayerStatLine[] {
    return this.d
      .all("SELECT * FROM player_season_stat WHERE player = ? ORDER BY season, competition, club", [player])
      .map((r) => ({
        player: txt(r.player), season: within(r.season), club: txt(r.club), competition: txt(r.competition), matches: within(r.matches),
        minutes: within(r.minutes), goals: within(r.goals), assists: within(r.assists), yellows: within(r.yellows), reds: within(r.reds),
      }));
  }

  playerStatsForCompetition(competition: string, season: number): PlayerCompetitionStats[] {
    const ratings = new Map(
      this.d
        .all("SELECT p.player AS player, AVG(p.rating) AS mean, COUNT(p.rating) AS n FROM appearance p JOIN match j ON j.id = p.match WHERE j.competition = ? AND j.season = ? AND p.rating IS NOT NULL GROUP BY p.player", [competition, season])
        .map((r) => [txt(r.player), { mean: within(r.mean), n: within(r.n) }] as const),
    );
    return this.d
      .all("SELECT * FROM player_season_stat WHERE competition = ? AND season = ? ORDER BY player", [competition, season])
      .map((r) => {
        const n = ratings.get(txt(r.player));
        return {
          player: txt(r.player), season: within(r.season), club: txt(r.club), competition: txt(r.competition), matches: within(r.matches),
          minutes: within(r.minutes), goals: within(r.goals), assists: within(r.assists), yellows: within(r.yellows), reds: within(r.reds),
          ratedGames: n?.n ?? 0, ...(n ? { avgRating: n.mean } : {}),
        };
      });
  }

  adjustStandings(a: StandingsAdjustment): void {
    this.transaction(() => {
      this.d.run("INSERT INTO standings_adjustment (competition, season, club, points, event) VALUES (?,?,?,?,?)", [a.competition, a.season, a.club, a.points, a.event]);
      this.d.run("INSERT INTO standings (competition, season, club) VALUES (?,?,?) ON CONFLICT DO NOTHING", [a.competition, a.season, a.club]);
      this.d.run("UPDATE standings SET adjustment = adjustment + ? WHERE competition = ? AND season = ? AND club = ?", [a.points, a.competition, a.season, a.club]);
    });
  }

  rebuildDerived(): void {
    this.transaction(() => {
      this.d.run("DELETE FROM standings");
      this.d.run(
        `INSERT INTO standings (competition, season, club, matches, wins, draws, losses, goals_for, goals_against, match_points)
         SELECT competition, season, club, COUNT(*), SUM(v), SUM(e), SUM(d), SUM(goals_for), SUM(goals_against), SUM(v) * ? + SUM(e) * ? FROM (
           SELECT competition, season, home AS club, home_goals AS goals_for, away_goals AS goals_against,
                  home_goals > away_goals AS v, home_goals = away_goals AS e, home_goals < away_goals AS d FROM match
           UNION ALL
           SELECT competition, season, away, away_goals, home_goals,
                  away_goals > home_goals, away_goals = home_goals, away_goals < home_goals FROM match
         ) GROUP BY competition, season, club`,
        [this.points.win, this.points.draw],
      );
      this.d.run(
        `INSERT INTO standings (competition, season, club) SELECT DISTINCT competition, season, club FROM standings_adjustment WHERE true ON CONFLICT DO NOTHING`,
      );
      this.d.run(
        `UPDATE standings SET adjustment = COALESCE((SELECT SUM(a.points) FROM standings_adjustment a
           WHERE a.competition = standings.competition AND a.season = standings.season AND a.club = standings.club), 0)`,
      );
      this.d.run("DELETE FROM player_season_stat");
      this.d.run(
        `INSERT INTO player_season_stat (player, season, club, competition, matches, minutes, goals, assists, yellows, reds)
         SELECT player, season, club, competition, SUM(matches), SUM(minutes), SUM(goals), SUM(assist), SUM(am), SUM(ver) FROM (
           SELECT p.player, j.season, p.club, j.competition, p.minutes > 0 AS matches, p.minutes, 0 AS goals, 0 AS assist, 0 AS am, 0 AS ver
             FROM appearance p JOIN match j ON j.id = p.match
           UNION ALL
           SELECT f.player, j.season, f.club, j.competition, 0, 0, f.type = 'G' AND f.extra <> 'auto', f.type = 'A', f.type = 'CA', f.type = 'CV'
             FROM match_fact f JOIN match j ON j.id = f.match WHERE f.type IN ('A', 'CA', 'CV') OR (f.type = 'G' AND f.extra <> 'auto')
         ) GROUP BY player, season, club, competition`,
      );
    });
  }

  // ---------- conhecimento
  appendObservation(o: NewObservation): number {
    return this.d.run(
      "INSERT INTO observation (observer, target_k, target_id, group_name, values_json, quality, source, date, season) VALUES (?,?,?,?,?,?,?,?,?)",
      [o.observer, o.targetK, o.targetId, o.group, JSON.stringify(o.values), o.quality, o.source, o.date, o.season],
    ).lastId;
  }

  observations(observer: string, target: Pick<RefEntity, "k" | "id">, group?: string): Observation[] {
    const p: SqlValue[] = [observer, target.k, target.id];
    if (group !== undefined) p.push(group);
    return this.d
      .all(`SELECT * FROM observation WHERE observer = ? AND target_k = ? AND target_id = ?${group !== undefined ? " AND group_name = ?" : ""} ORDER BY id DESC`, p)
      .map((r) => ({
        id: within(r.id), observer: txt(r.observer), targetK: txt(r.target_k) as EntityType, targetId: txt(r.target_id), group: txt(r.group_name),
        values: JSON.parse(txt(r.values_json)) as Record<string, unknown>, quality: within(r.quality), source: txt(r.source), date: txt(r.date), season: within(r.season),
      }));
  }
}
