/**
 * Repositório sobre SQLite (RZ-128). Recebe um `DriverSql` já aberto; chama `migrar` ao criar.
 * Quem fala SQL é só este ficheiro e o esquema.
 */
import type { DriverSql, SqlLine, SqlValue } from "./driver";
import { migrar, SCHEMA_VERSION } from "./esquema";
import type { EventsFilter, RecentFilter, Repository } from "./repositorio";
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
  EntityType,
  Visibility,
} from "./tipos";
import { validateNewEvent, validateMatch } from "./validacao";

const Visibility: Visibility[] = ["exposed", "privado", "secreto"];
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
    migrar(d);
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
    migrar(this.d);
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
    const r = this.d.all("SELECT valor FROM meta WHERE chave = ?", [rowKey])[0];
    return r ? txt(r.valor) : undefined;
  }
  setMeta(rowKey: string, value: string): void {
    this.d.run("INSERT INTO meta (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor", [rowKey, value]);
  }

  // ---------- localidades
  private localityRecord(r: SqlLine): LocalityRecord {
    return { id: txt(r.id), name: txt(r.nome), city: txt(r.cidade), population: within(r.populacao), status: txt(r.estatuto) as LocalityRecord["status"], since: txt(r.desde) };
  }
  saveLocalities(localities: readonly LocalityRecord[]): void {
    this.transaction(() => {
      if (within(this.d.all("SELECT COUNT(*) AS n FROM localidade")[0]?.n) > 0) throw new Error("O save já tem localidades");
      for (const l of localities)
        this.d.run("INSERT INTO localidade (id, nome, cidade, populacao, estatuto, desde) VALUES (?,?,?,?,?,?)", [l.id, l.name, l.city, l.population, l.status, l.since]);
    });
  }
  locality(id: string): LocalityRecord | undefined {
    const r = this.d.all("SELECT * FROM localidade WHERE id = ?", [id])[0];
    return r ? this.localityRecord(r) : undefined;
  }
  localities(filter: { city?: string } = {}): LocalityRecord[] {
    const rs = filter.city === undefined ? this.d.all("SELECT * FROM localidade ORDER BY id") : this.d.all("SELECT * FROM localidade WHERE cidade = ? ORDER BY id", [filter.city]);
    return rs.map((r) => this.localityRecord(r));
  }
  updateLocality(id: string, a: LocalityUpdate): { event?: number } {
    return this.transaction(() => {
      const before = this.locality(id);
      if (!before) throw new Error(`Localidade inexistente: ${id}`);
      if (!(a.population >= 0)) throw new Error("população inválida");
      if (a.status === before.status) {
        this.d.run("UPDATE localidade SET populacao = ? WHERE id = ?", [a.population, id]);
        return {};
      }
      const event = this.appendEvent({
        type: "LOCALIDADE_ESTATUTO", date: a.date, season: a.season, visibility: "exposed",
        entities: [{ k: "locality", id }, { k: "city", id: before.city }],
        ...(a.cause !== undefined ? { cause: a.cause } : {}),
        data: { de: before.status, para: a.status, population: a.population },
      });
      this.d.run("UPDATE localidade SET populacao = ?, estatuto = ?, desde = ? WHERE id = ?", [a.population, a.status, a.date, id]);
      return { event };
    });
  }

  // ---------- pessoas
  saveWorld(batch: WorldBatchRecord, onProgress?: (done: number, total: number) => void): void {
    this.transaction(() => {
      if (this.peopleTotal() > 0) throw new Error("O save já tem pessoas");
      const total = batch.people.length + batch.players.length + batch.contracts.length + batch.roles.length;
      let done = 0;
      const tick = () => {
        if (++done % 500 === 0) onProgress?.(done, total);
      };
      for (const p of batch.people) {
        this.d.run("INSERT INTO pessoa (id, nome, nome_desportivo, nascimento, nacionalidade, natural_de, papeis, personalidade, arquetipo, lod) VALUES (?,?,?,?,?,?,?,?,?,?)", [
          p.id, p.name, p.sportingName, p.birth, p.nationality, p.naturalDe ?? null, JSON.stringify(p.roles), JSON.stringify(p.personality), p.archetype, p.lod,
        ]);
        tick();
      }
      for (const j of batch.players) {
        this.d.run("INSERT INTO jogador (pessoa, posicoes, atributos, potencial, altura, peso, pe, clube, estado) VALUES (?,?,?,?,?,?,?,?,?)", [
          j.person, JSON.stringify(j.positions), JSON.stringify(j.attributes), j.potential, j.heightCm, j.weightKg, j.pe, j.club ?? null, j.state,
        ]);
        tick();
      }
      for (const c of batch.contracts) {
        this.d.run("INSERT INTO contrato (pessoa, clube, salario_mensal, inicio, fim) VALUES (?,?,?,?,?)", [c.person, c.club, c.monthlyWage, c.start, c.end]);
        tick();
      }
      for (const c of batch.roles) {
        this.d.run("INSERT INTO cargo (pessoa, funcao, clube, cidade, qualidade) VALUES (?,?,?,?,?)", [c.person, c.fn, c.club ?? null, c.city ?? null, c.quality ? JSON.stringify(c.quality) : null]);
        tick();
      }
      onProgress?.(total, total);
    });
  }
  peopleTotal(): number {
    return within(this.d.all("SELECT COUNT(*) AS n FROM pessoa")[0]?.n);
  }
  peopleIndex(): PersonIndex[] {
    return this.d
      .all(
        "SELECT p.id, p.nome, p.nome_desportivo, j.posicoes, j.clube AS jclube, c.funcao, c.clube AS cclube FROM pessoa p LEFT JOIN jogador j ON j.pessoa = p.id LEFT JOIN cargo c ON c.pessoa = p.id ORDER BY p.id",
      )
      .map((r) => {
        const club = r.jclube ?? r.cclube;
        const pos = r.posicoes === null ? undefined : (JSON.parse(txt(r.posicoes)) as { pos: string }[])[0]?.pos;
        return {
          id: txt(r.id), name: txt(r.nome), sportingName: txt(r.nome_desportivo),
          ...(club !== null ? { club: txt(club) } : {}), ...(pos !== undefined ? { position: pos } : {}), ...(r.funcao !== null ? { fn: txt(r.funcao) } : {}),
        };
      });
  }
  private exposed(r: SqlLine): PublicPerson {
    const pos = r.posicoes === null || r.posicoes === undefined ? undefined : (JSON.parse(txt(r.posicoes)) as { pos: string }[])[0]?.pos;
    const club = r.jclube ?? r.cclube;
    return {
      id: txt(r.id),
      name: txt(r.nome),
      sportingName: txt(r.nome_desportivo),
      birth: txt(r.nascimento),
      nationality: txt(r.nacionalidade),
      ...(r.natural_de !== null && r.natural_de !== undefined ? { naturalDe: txt(r.natural_de) } : {}),
      roles: JSON.parse(txt(r.papeis)) as string[],
      ...(club !== null && club !== undefined ? { club: txt(club) } : {}),
      ...(r.funcao !== null && r.funcao !== undefined ? { fn: txt(r.funcao) } : {}),
      ...(pos !== undefined
        ? { player: { position: pos, heightCm: within(r.altura), weightKg: within(r.peso), pe: txt(r.pe) as "D" | "E" | "A", state: txt(r.estado) as "active" | "free" } }
        : {}),
    };
  }
  private static readonly PUBLIC_SELECT =
    "SELECT p.id, p.nome, p.nome_desportivo, p.nascimento, p.nacionalidade, p.natural_de, p.papeis, j.posicoes, j.altura, j.peso, j.pe, j.estado, j.clube AS jclube, c.funcao, c.clube AS cclube " +
    "FROM pessoa p LEFT JOIN jogador j ON j.pessoa = p.id LEFT JOIN cargo c ON c.pessoa = p.id";
  publicPerson(id: string): PublicPerson | undefined {
    const r = this.d.all(`${SqliteRepository.PUBLIC_SELECT} WHERE p.id = ?`, [id])[0];
    return r ? this.exposed(r) : undefined;
  }
  publicSquad(club: string): PublicPerson[] {
    return this.d
      .all(`${SqliteRepository.PUBLIC_SELECT} WHERE j.clube = ? AND j.estado = 'ativo' ORDER BY p.nome_desportivo, p.id`, [club])
      .map((r) => this.exposed(r));
  }
  publicRoles(filter: { club?: string; city?: string }): PublicPerson[] {
    const where: string[] = [];
    const params: SqlValue[] = [];
    if (filter.club !== undefined) { where.push("c.clube = ?"); params.push(filter.club); }
    if (filter.city !== undefined) { where.push("c.cidade = ?"); params.push(filter.city); }
    if (where.length === 0) return [];
    return this.d.all(`${SqliteRepository.PUBLIC_SELECT} WHERE ${where.join(" AND ")} ORDER BY c.funcao, p.id`, params).map((r) => this.exposed(r));
  }
  person(id: string): PersonRecord | undefined {
    const r = this.d.all("SELECT * FROM pessoa WHERE id = ?", [id])[0];
    if (!r) return undefined;
    return {
      id: txt(r.id), name: txt(r.nome), sportingName: txt(r.nome_desportivo), birth: txt(r.nascimento), nationality: txt(r.nacionalidade),
      ...(r.natural_de !== null ? { naturalDe: txt(r.natural_de) } : {}),
      roles: JSON.parse(txt(r.papeis)) as string[], personality: JSON.parse(txt(r.personalidade)) as Record<string, number>,
      archetype: txt(r.arquetipo), lod: within(r.lod) as 1 | 2 | 3,
    };
  }
  private playerOf(r: SqlLine): PlayerRecord {
    return {
      person: txt(r.pessoa), positions: JSON.parse(txt(r.posicoes)) as { pos: string; aptitude: number }[], attributes: JSON.parse(txt(r.atributos)) as Record<string, number>,
      potential: within(r.potencial), heightCm: within(r.altura), weightKg: within(r.peso), pe: txt(r.pe) as "D" | "E" | "A",
      ...(r.clube !== null ? { club: txt(r.clube) } : {}), state: txt(r.estado) as "active" | "free",
    };
  }
  player(person: string): PlayerRecord | undefined {
    const r = this.d.all("SELECT * FROM jogador WHERE pessoa = ?", [person])[0];
    return r ? this.playerOf(r) : undefined;
  }
  clubPlayers(club: string): PlayerRecord[] {
    return this.d.all("SELECT * FROM jogador WHERE clube = ? ORDER BY pessoa", [club]).map((r) => this.playerOf(r));
  }
  contract(person: string): ContractRecord | undefined {
    const r = this.d.all("SELECT * FROM contrato WHERE pessoa = ? ORDER BY id DESC LIMIT 1", [person])[0];
    return r ? { person: txt(r.pessoa), club: txt(r.clube), monthlyWage: within(r.salario_mensal), start: txt(r.inicio), end: txt(r.fim) } : undefined;
  }
  role(person: string): RoleRecord | undefined {
    const r = this.d.all("SELECT * FROM cargo WHERE pessoa = ?", [person])[0];
    if (!r) return undefined;
    return {
      person: txt(r.pessoa), fn: txt(r.funcao),
      ...(r.clube !== null ? { club: txt(r.clube) } : {}), ...(r.cidade !== null ? { city: txt(r.cidade) } : {}),
      ...(r.qualidade !== null ? { quality: JSON.parse(txt(r.qualidade)) as Record<string, number> } : {}),
    };
  }

  // ---------- calendário
  saveCalendar(matches: readonly ScheduledMatch[], byes: readonly ScheduledBye[]): void {
    const keys = new Set([...matches, ...byes].map((x) => `${x.competition}\u0000${x.season}`));
    this.transaction(() => {
      for (const k of keys) {
        const [c, e] = k.split("\u0000") as [string, string];
        if (within(this.d.all("SELECT COUNT(*) AS n FROM calendario_jogo WHERE competicao = ? AND epoca = ?", [c, Number(e)])[0]?.n) > 0)
          throw new Error(`Já existe calendário de ${c} na época ${e}`);
      }
      for (const j of matches)
        this.d.run("INSERT INTO calendario_jogo (id, competicao, epoca, jornada, data, casa, fora) VALUES (?,?,?,?,?,?,?)", [j.id, j.competition, j.season, j.round, j.date, j.home, j.away]);
      for (const f of byes)
        this.d.run("INSERT INTO calendario_folga (competicao, epoca, jornada, clube) VALUES (?,?,?,?)", [f.competition, f.season, f.round, f.club]);
    });
  }
  private scheduledMatch(r: SqlLine): ScheduledMatch {
    return { id: txt(r.id), competition: txt(r.competicao), season: within(r.epoca), round: within(r.jornada), date: txt(r.data), home: txt(r.casa), away: txt(r.fora) };
  }
  calendar(competition: string, season: number): { matches: ScheduledMatch[]; byes: ScheduledBye[] } {
    const matches = this.d.all("SELECT * FROM calendario_jogo WHERE competicao = ? AND epoca = ? ORDER BY jornada, id", [competition, season]).map((r) => this.scheduledMatch(r));
    const byes = this.d
      .all("SELECT * FROM calendario_folga WHERE competicao = ? AND epoca = ? ORDER BY jornada", [competition, season])
      .map((r) => ({ competition: txt(r.competicao), season: within(r.epoca), round: within(r.jornada), club: txt(r.clube) }));
    return { matches, byes };
  }
  clubCalendar(club: string, season: number): ScheduledMatch[] {
    return this.d.all("SELECT * FROM calendario_jogo WHERE epoca = ? AND (casa = ? OR fora = ?) ORDER BY data, id", [season, club, club]).map((r) => this.scheduledMatch(r));
  }
  dayMatches(date: IsoDate): ScheduledMatch[] {
    return this.d.all("SELECT * FROM calendario_jogo WHERE data = ? ORDER BY id", [date]).map((r) => this.scheduledMatch(r));
  }
  nextMatch(club: string, since: IsoDate): ScheduledMatch | undefined {
    const r = this.d.all("SELECT * FROM calendario_jogo WHERE (casa = ? OR fora = ?) AND data >= ? ORDER BY data, id LIMIT 1", [club, club, since])[0];
    return r ? this.scheduledMatch(r) : undefined;
  }

  // ---------- história
  appendEvent(e: NewEvent): number {
    validateNewEvent(e);
    return this.transaction(() => {
      const { lastId } = this.d.run(
        "INSERT INTO evento (tipo, v, data, epoca, jornada, vis, causa, corrige, origem, dados) VALUES (?,?,?,?,?,?,?,?,?,?)",
        [e.type, e.v ?? 1, e.date, e.season, e.round ?? null, visibilityIn(e.visibility), e.cause ?? null, e.fixes ?? null, e.origin ?? "match", JSON.stringify(e.data)],
      );
      for (const x of e.entities)
        this.d.run("INSERT INTO evento_entidade (k, id, evento, papel) VALUES (?,?,?,?)", [x.k, x.id, lastId, x.roleKind ?? null]);
      return lastId;
    });
  }

  private forEvents(lines: SqlLine[]): HistoryEvent[] {
    const entities = new Map<number, RefEntity[]>();
    for (let i = 0; i < lines.length; i += 400) {
      const ids = lines.slice(i, i + 400).map((l) => within(l.id));
      const rs = this.d.all(
        `SELECT evento, k, id, papel FROM evento_entidade WHERE evento IN (${ids.map(() => "?").join(",")}) ORDER BY evento, k, id`,
        ids,
      );
      for (const r of rs) {
        const list = entities.get(within(r.evento)) ?? [];
        list.push({ k: txt(r.k) as EntityType, id: txt(r.id), ...(r.papel !== null ? { roleKind: txt(r.papel) } : {}) });
        entities.set(within(r.evento), list);
      }
    }
    return lines.map((l) => ({
      id: within(l.id),
      type: txt(l.tipo),
      v: within(l.v),
      date: txt(l.data),
      season: within(l.epoca),
      ...(l.jornada !== null ? { round: within(l.jornada) } : {}),
      visibility: Visibility[within(l.vis)] as Visibility,
      entities: entities.get(within(l.id)) ?? [],
      ...(l.causa !== null ? { cause: within(l.causa) } : {}),
      ...(l.corrige !== null ? { fixes: within(l.corrige) } : {}),
      origin: txt(l.origem) as HistoryEvent["origin"],
      data: JSON.parse(txt(l.dados)) as Record<string, unknown>,
    }));
  }

  event(id: number): HistoryEvent | undefined {
    return this.forEvents(this.d.all("SELECT * FROM evento WHERE id = ?", [id]))[0];
  }

  eventsTotal(): number {
    return within(this.d.all("SELECT COUNT(*) AS n FROM evento")[0]?.n);
  }

  eventsOf(entity: Pick<RefEntity, "k" | "id">, f: EventsFilter = {}): HistoryEvent[] {
    const where = ["x.k = ?", "x.id = ?"];
    const p: SqlValue[] = [entity.k, entity.id];
    if (f.publicOnly) where.push("e.vis = 0");
    if (f.visibility) {
      where.push(`e.vis IN (${f.visibility.map(() => "?").join(",") || "NULL"})`);
      p.push(...f.visibility.map(visibilityIn));
    }
    if (f.type !== undefined) {
      where.push("e.tipo = ?");
      p.push(f.type);
    }
    if (f.seasonSince !== undefined) {
      where.push("e.epoca >= ?");
      p.push(f.seasonSince);
    }
    if (f.untilSeason !== undefined) {
      where.push("e.epoca <= ?");
      p.push(f.untilSeason);
    }
    if (f.afterOf !== undefined) { where.push("e.id > ?"); p.push(f.afterOf); }
    if (f.beforeOf !== undefined) { where.push("e.id < ?"); p.push(f.beforeOf); }
    p.push(f.limit ?? -1);
    return this.forEvents(
      this.d.all(`SELECT e.* FROM evento_entidade x JOIN evento e ON e.id = x.evento WHERE ${where.join(" AND ")} ORDER BY e.id DESC LIMIT ?`, p),
    );
  }

  recentEvents(f: RecentFilter = {}): HistoryEvent[] {
    const where: string[] = ["1 = 1"];
    const p: SqlValue[] = [];
    if (f.publicOnly) where.push("vis = 0");
    if (f.types) {
      where.push(`tipo IN (${f.types.map(() => "?").join(",") || "NULL"})`);
      p.push(...f.types);
    }
    if (f.afterOf !== undefined) { where.push("id > ?"); p.push(f.afterOf); }
    if (f.beforeOf !== undefined) { where.push("id < ?"); p.push(f.beforeOf); }
    p.push(f.limit ?? -1);
    return this.forEvents(this.d.all(`SELECT * FROM evento WHERE ${where.join(" AND ")} ORDER BY id DESC LIMIT ?`, p));
  }

  count(type: string, entity?: Pick<RefEntity, "k" | "id">, i: { seasonSince?: number; untilSeason?: number } = {}): number {
    const where = ["e.tipo = ?"];
    const p: SqlValue[] = [type];
    if (entity) {
      where.push("e.id IN (SELECT evento FROM evento_entidade WHERE k = ? AND id = ?)");
      p.push(entity.k, entity.id);
    }
    if (i.seasonSince !== undefined) {
      where.push("e.epoca >= ?");
      p.push(i.seasonSince);
    }
    if (i.untilSeason !== undefined) {
      where.push("e.epoca <= ?");
      p.push(i.untilSeason);
    }
    return within(this.d.all(`SELECT COUNT(*) AS n FROM evento e WHERE ${where.join(" AND ")}`, p)[0]?.n);
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
           acima(id, causa) AS (SELECT id, causa FROM evento WHERE id = ? UNION ALL SELECT e.id, e.causa FROM evento e JOIN acima a ON e.id = a.causa),
           abaixo(id) AS (SELECT id FROM evento WHERE id = ? UNION ALL SELECT e.id FROM evento e JOIN abaixo b ON e.causa = b.id)
         SELECT * FROM evento WHERE id IN (SELECT id FROM acima UNION SELECT id FROM abaixo) ORDER BY id`,
        [eventId, eventId],
      ),
    );
  }

  exportNdjson(): string {
    const lines: string[] = [];
    for (let since = 0; ; ) {
      const batch = this.d.all("SELECT * FROM evento WHERE id > ? ORDER BY id LIMIT 1000", [since]);
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
      if (this.d.all("SELECT 1 AS x FROM jogo WHERE id = ?", [j.id]).length > 0) throw new Error(`Jogo ${j.id} já existe`);
      const event = this.appendEvent({
        type: "JOGO_JOGADO",
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
        `INSERT INTO jogo (id, competicao, epoca, jornada, data, casa, fora, golos_casa, golos_fora, xg_casa, xg_fora, posse_casa,
           assistencia, receita, importancia, arbitro, evento) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [j.id, j.competition, j.season, j.round, j.date, j.home, j.away, j.homeGoals, j.awayGoals, j.homeXg ?? 0, j.awayXg ?? 0,
         j.homePossession ?? 0.5, j.attendance ?? 0, j.revenue ?? 0, j.importance ?? 0, j.referee ?? "", event],
      );
      for (const f of facts)
        this.d.run("INSERT INTO jogo_facto (jogo, minuto, tipo, jogador, clube, extra) VALUES (?,?,?,?,?,?)", [j.id, f.minute, f.type, f.player, f.club, f.extra ?? ""]);
      for (const p of appearances)
        this.d.run("INSERT INTO participacao (jogo, jogador, clube, titular, minutos, nota) VALUES (?,?,?,?,?,?)", [j.id, p.player, p.club, p.starter ? 1 : 0, p.minutes, p.rating ?? null]);
      this.updateDerived(j, facts, appearances);
      return { event };
    });
  }

  private updateDerived(j: NewMatch, facts: FactMatch[], appearances: Appearance[]): void {
    const side = (club: string, gm: number, gs: number) => {
      const v = gm > gs ? 1 : 0;
      const e = gm === gs ? 1 : 0;
      this.d.run(
        `INSERT INTO classificacao (competicao, epoca, clube, jogos, vitorias, empates, derrotas, gm, gs, pontos_jogos)
         VALUES (?,?,?,1,?,?,?,?,?,?)
         ON CONFLICT(competicao, epoca, clube) DO UPDATE SET jogos = jogos + 1, vitorias = vitorias + excluded.vitorias,
           empates = empates + excluded.empates, derrotas = derrotas + excluded.derrotas, gm = gm + excluded.gm,
           gs = gs + excluded.gs, pontos_jogos = pontos_jogos + excluded.pontos_jogos`,
        [j.competition, j.season, club, v, e, gm < gs ? 1 : 0, gm, gs, v * this.points.win + e * this.points.draw],
      );
    };
    side(j.home, j.homeGoals, j.awayGoals);
    side(j.away, j.awayGoals, j.homeGoals);

    type Acc = { club: string; player: string; matches: number; minutes: number; goals: number; assist: number; am: number; see: number };
    const acc = new Map<string, Acc>();
    const de = (player: string, club: string): Acc => {
      const k = `${player}\u0000${club}`;
      let a = acc.get(k);
      if (!a) acc.set(k, (a = { club, player, matches: 0, minutes: 0, goals: 0, assist: 0, am: 0, see: 0 }));
      return a;
    };
    for (const p of appearances) {
      const a = de(p.player, p.club);
      a.matches += p.minutes > 0 ? 1 : 0;
      a.minutes += p.minutes;
    }
    for (const f of facts) {
      if (f.type === "G" && f.extra !== "auto") de(f.player, f.club).goals++;
      else if (f.type === "A") de(f.player, f.club).assist++;
      else if (f.type === "CA") de(f.player, f.club).am++;
      else if (f.type === "CV") de(f.player, f.club).see++;
    }
    for (const a of acc.values())
      this.d.run(
        `INSERT INTO stat_jogador_epoca (jogador, epoca, clube, competicao, jogos, minutos, golos, assistencias, amarelos, vermelhos)
         VALUES (?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(jogador, epoca, clube, competicao) DO UPDATE SET jogos = jogos + excluded.jogos, minutos = minutos + excluded.minutos,
           golos = golos + excluded.golos, assistencias = assistencias + excluded.assistencias,
           amarelos = amarelos + excluded.amarelos, vermelhos = vermelhos + excluded.vermelhos`,
        [a.player, j.season, a.club, j.competition, a.matches, a.minutes, a.goals, a.assist, a.am, a.see],
      );
  }

  match(id: string): Match | undefined {
    const r = this.d.all("SELECT * FROM jogo WHERE id = ?", [id])[0];
    if (!r) return undefined;
    return {
      id: txt(r.id), competition: txt(r.competicao), season: within(r.epoca), round: within(r.jornada), date: txt(r.data),
      home: txt(r.casa), away: txt(r.fora), homeGoals: within(r.golos_casa), awayGoals: within(r.golos_fora),
      homeXg: within(r.xg_casa), awayXg: within(r.xg_fora), homePossession: within(r.posse_casa), attendance: within(r.assistencia),
      revenue: within(r.receita), importance: within(r.importancia), referee: txt(r.arbitro), event: within(r.evento),
    };
  }

  meetings(a: string, b: string, limit: number): Match[] {
    return this.d
      .all("SELECT id FROM jogo WHERE (casa = ? AND fora = ?) OR (casa = ? AND fora = ?) ORDER BY data DESC, id DESC LIMIT ?", [a, b, b, a, Math.max(0, limit)])
      .map((r) => this.match(txt(r.id)) as Match);
  }

  competitionMatches(competition: string, season: number): Match[] {
    return this.d
      .all("SELECT id FROM jogo WHERE competicao = ? AND epoca = ? ORDER BY jornada, data, id", [competition, season])
      .map((r) => this.match(txt(r.id)) as Match);
  }

  scorers(competition: string, season: number, round: number): Scorer[] {
    return this.d
      .all(
        `SELECT f.jogador, f.clube, f.minuto, f.jogo FROM jogo_facto f JOIN jogo j ON j.id = f.jogo
         WHERE j.competicao = ? AND j.epoca = ? AND j.jornada = ? AND f.tipo = 'G' ORDER BY j.data, j.id, f.minuto, f.rowid`,
        [competition, season, round],
      )
      .map((r) => ({ player: txt(r.jogador), club: txt(r.clube), minute: within(r.minuto), match: txt(r.jogo) }));
  }

  cards(competition: string, season: number, players: readonly string[]): CardRecord[] {
    if (players.length === 0) return [];
    return this.d
      .all(
        `SELECT f.jogador, f.jogo, j.jornada, f.minuto, f.tipo, f.extra FROM jogo_facto f JOIN jogo j ON j.id = f.jogo
         WHERE j.competicao = ? AND j.epoca = ? AND f.tipo IN ('CA', 'CV') AND f.jogador IN (${players.map(() => "?").join(",")})
         ORDER BY j.jornada, j.data, j.id, f.minuto, f.rowid`,
        [competition, season, ...players],
      )
      .map((r) => ({ player: txt(r.jogador), match: txt(r.jogo), round: within(r.jornada), minute: within(r.minuto), type: txt(r.tipo) as "CA" | "CV", extra: txt(r.extra) }));
  }

  playedMinutes(players: readonly string[], since: IsoDate, until: IsoDate): Map<string, number> {
    const out = new Map<string, number>();
    if (players.length === 0) return out;
    for (const r of this.d.all(
      `SELECT p.jogador, SUM(p.minutos) AS minutos FROM participacao p JOIN jogo j ON j.id = p.jogo
       WHERE p.jogador IN (${players.map(() => "?").join(",")}) AND j.data >= ? AND j.data < ? AND p.minutos > 0 GROUP BY p.jogador`,
      [...players, since, until],
    )) out.set(txt(r.jogador), within(r.minutos));
    return out;
  }

  playedRounds(club: string, competition: string, season: number): number[] {
    return this.d
      .all("SELECT DISTINCT jornada FROM jogo WHERE competicao = ? AND epoca = ? AND (casa = ? OR fora = ?) ORDER BY jornada", [competition, season, club, club])
      .map((r) => within(r.jornada));
  }

  standings(competition: string, season: number): StandingsLine[] {
    return this.d
      .all(
        `SELECT *, pontos_jogos + ajuste AS pontos FROM classificacao WHERE competicao = ? AND epoca = ?
         ORDER BY pontos DESC, gm - gs DESC, gm DESC, clube`,
        [competition, season],
      )
      .map((r) => ({
        club: txt(r.clube), matches: within(r.jogos), wins: within(r.vitorias), draws: within(r.empates), losses: within(r.derrotas),
        scoredGoals: within(r.gm), concededGoals: within(r.gs), matchesPoints: within(r.pontos_jogos), adjustment: within(r.ajuste), points: within(r.pontos),
      }));
  }

  playerStats(player: string): PlayerStatLine[] {
    return this.d
      .all("SELECT * FROM stat_jogador_epoca WHERE jogador = ? ORDER BY epoca, competicao, clube", [player])
      .map((r) => ({
        player: txt(r.jogador), season: within(r.epoca), club: txt(r.clube), competition: txt(r.competicao), matches: within(r.jogos),
        minutes: within(r.minutos), goals: within(r.golos), assists: within(r.assistencias), yellows: within(r.amarelos), reds: within(r.vermelhos),
      }));
  }

  playerStatsForCompetition(competition: string, season: number): PlayerCompetitionStats[] {
    const ratings = new Map(
      this.d
        .all("SELECT p.jogador AS jogador, AVG(p.nota) AS media, COUNT(p.nota) AS n FROM participacao p JOIN jogo j ON j.id = p.jogo WHERE j.competicao = ? AND j.epoca = ? AND p.nota IS NOT NULL GROUP BY p.jogador", [competition, season])
        .map((r) => [txt(r.jogador), { mean: within(r.media), n: within(r.n) }] as const),
    );
    return this.d
      .all("SELECT * FROM stat_jogador_epoca WHERE competicao = ? AND epoca = ? ORDER BY jogador", [competition, season])
      .map((r) => {
        const n = ratings.get(txt(r.jogador));
        return {
          player: txt(r.jogador), season: within(r.epoca), club: txt(r.clube), competition: txt(r.competicao), matches: within(r.jogos),
          minutes: within(r.minutos), goals: within(r.golos), assists: within(r.assistencias), yellows: within(r.amarelos), reds: within(r.vermelhos),
          ratedGames: n?.n ?? 0, ...(n ? { avgRating: n.mean } : {}),
        };
      });
  }

  adjustStandings(a: StandingsAdjustment): void {
    this.transaction(() => {
      this.d.run("INSERT INTO classificacao_ajuste (competicao, epoca, clube, pontos, evento) VALUES (?,?,?,?,?)", [a.competition, a.season, a.club, a.points, a.event]);
      this.d.run("INSERT INTO classificacao (competicao, epoca, clube) VALUES (?,?,?) ON CONFLICT DO NOTHING", [a.competition, a.season, a.club]);
      this.d.run("UPDATE classificacao SET ajuste = ajuste + ? WHERE competicao = ? AND epoca = ? AND clube = ?", [a.points, a.competition, a.season, a.club]);
    });
  }

  rebuildDerived(): void {
    this.transaction(() => {
      this.d.run("DELETE FROM classificacao");
      this.d.run(
        `INSERT INTO classificacao (competicao, epoca, clube, jogos, vitorias, empates, derrotas, gm, gs, pontos_jogos)
         SELECT competicao, epoca, clube, COUNT(*), SUM(v), SUM(e), SUM(d), SUM(gm), SUM(gs), SUM(v) * ? + SUM(e) * ? FROM (
           SELECT competicao, epoca, casa AS clube, golos_casa AS gm, golos_fora AS gs,
                  golos_casa > golos_fora AS v, golos_casa = golos_fora AS e, golos_casa < golos_fora AS d FROM jogo
           UNION ALL
           SELECT competicao, epoca, fora, golos_fora, golos_casa,
                  golos_fora > golos_casa, golos_fora = golos_casa, golos_fora < golos_casa FROM jogo
         ) GROUP BY competicao, epoca, clube`,
        [this.points.win, this.points.draw],
      );
      this.d.run(
        `INSERT INTO classificacao (competicao, epoca, clube) SELECT DISTINCT competicao, epoca, clube FROM classificacao_ajuste WHERE true ON CONFLICT DO NOTHING`,
      );
      this.d.run(
        `UPDATE classificacao SET ajuste = COALESCE((SELECT SUM(a.pontos) FROM classificacao_ajuste a
           WHERE a.competicao = classificacao.competicao AND a.epoca = classificacao.epoca AND a.clube = classificacao.clube), 0)`,
      );
      this.d.run("DELETE FROM stat_jogador_epoca");
      this.d.run(
        `INSERT INTO stat_jogador_epoca (jogador, epoca, clube, competicao, jogos, minutos, golos, assistencias, amarelos, vermelhos)
         SELECT jogador, epoca, clube, competicao, SUM(jogos), SUM(minutos), SUM(golos), SUM(assist), SUM(am), SUM(ver) FROM (
           SELECT p.jogador, j.epoca, p.clube, j.competicao, p.minutos > 0 AS jogos, p.minutos, 0 AS golos, 0 AS assist, 0 AS am, 0 AS ver
             FROM participacao p JOIN jogo j ON j.id = p.jogo
           UNION ALL
           SELECT f.jogador, j.epoca, f.clube, j.competicao, 0, 0, f.tipo = 'G' AND f.extra <> 'auto', f.tipo = 'A', f.tipo = 'CA', f.tipo = 'CV'
             FROM jogo_facto f JOIN jogo j ON j.id = f.jogo WHERE f.tipo IN ('A', 'CA', 'CV') OR (f.tipo = 'G' AND f.extra <> 'auto')
         ) GROUP BY jogador, epoca, clube, competicao`,
      );
    });
  }

  // ---------- conhecimento
  appendObservation(o: NewObservation): number {
    return this.d.run(
      "INSERT INTO observacao (observador, alvo_k, alvo_id, grupo, valores, qualidade, fonte, data, epoca) VALUES (?,?,?,?,?,?,?,?,?)",
      [o.observer, o.targetK, o.targetId, o.group, JSON.stringify(o.values), o.quality, o.source, o.date, o.season],
    ).lastId;
  }

  observations(observer: string, target: Pick<RefEntity, "k" | "id">, group?: string): Observation[] {
    const p: SqlValue[] = [observer, target.k, target.id];
    if (group !== undefined) p.push(group);
    return this.d
      .all(`SELECT * FROM observacao WHERE observador = ? AND alvo_k = ? AND alvo_id = ?${group !== undefined ? " AND grupo = ?" : ""} ORDER BY id DESC`, p)
      .map((r) => ({
        id: within(r.id), observer: txt(r.observador), targetK: txt(r.alvo_k) as EntityType, targetId: txt(r.alvo_id), group: txt(r.grupo),
        values: JSON.parse(txt(r.valores)) as Record<string, unknown>, quality: within(r.qualidade), source: txt(r.fonte), date: txt(r.data), season: within(r.epoca),
      }));
  }
}
