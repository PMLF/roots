/**
 * Repositório sobre SQLite (RZ-128). Recebe um `DriverSql` já aberto; chama `migrar` ao criar.
 * Quem fala SQL é só este ficheiro e o esquema.
 */
import type { DriverSql, LinhaSql, ValorSql } from "./driver";
import { migrar, VERSAO_ESQUEMA } from "./esquema";
import type { FiltroEventos, FiltroRecentes, Repositorio } from "./repositorio";
import type {
  AjusteClassificacao,
  CargoReg,
  ContratoReg,
  Data,
  EntidadeRef,
  Evento,
  EventoNovo,
  FolgaAgendada,
  Jogo,
  JogoAgendado,
  JogoFacto,
  JogadorReg,
  JogoNovo,
  LinhaClassificacao,
  LinhaStatJogador,
  PlayerCompetitionStats,
  Marcador,
  RegistoCartao,
  Observacao,
  ObservacaoNova,
  LoteMundoReg,
  LocalidadeReg,
  AtualizacaoLocalidade,
  Participacao,
  PessoaIndice,
  PessoaPublica,
  PessoaReg,
  PontosPorResultado,
  TipoEntidade,
  Visibilidade,
} from "./tipos";
import { validarEventoNovo, validarJogo } from "./validacao";

const VIS: Visibilidade[] = ["publico", "privado", "secreto"];
const visNum = (v: Visibilidade) => VIS.indexOf(v);
const num = (v: ValorSql | undefined) => Number(v);
const txt = (v: ValorSql | undefined) => String(v);

export class RepositorioSqlite implements Repositorio {
  readonly versaoEsquema = VERSAO_ESQUEMA;
  private prof = 0;

  constructor(
    private readonly d: DriverSql,
    private readonly pontos: PontosPorResultado = { vitoria: 3, empate: 1 },
  ) {
    migrar(d);
  }

  /** Bytes do ficheiro `.sqlite` completo (RZ-134 comprime e dá o nome .raizes). */
  exportarSqlite(): Uint8Array {
    return this.d.exportar();
  }
  fechar(): void {
    this.d.fechar();
  }

  reiniciar(): void {
    if (this.prof > 0) throw new Error("reiniciar() não pode correr dentro de uma transação");
    const tabelas = this.d.todos("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").map((r) => txt(r.name));
    this.d.executarScript("PRAGMA foreign_keys = OFF");
    this.d.executarScript("BEGIN");
    try {
      for (const t of tabelas) this.d.executarScript(`DROP TABLE IF EXISTS "${t}"`);
      this.d.executarScript("PRAGMA user_version = 0");
      this.d.executarScript("COMMIT");
    } catch (e) {
      this.d.executarScript("ROLLBACK");
      throw e;
    } finally {
      this.d.executarScript("PRAGMA foreign_keys = ON");
    }
    migrar(this.d);
  }

  transacao<T>(fn: () => T): T {
    const nivel = this.prof;
    const sp = `sp${nivel}`;
    this.d.executarScript(nivel === 0 ? "BEGIN IMMEDIATE" : `SAVEPOINT ${sp}`);
    this.prof++;
    try {
      const r = fn();
      this.prof--;
      this.d.executarScript(nivel === 0 ? "COMMIT" : `RELEASE ${sp}`);
      return r;
    } catch (e) {
      this.prof--;
      this.d.executarScript(nivel === 0 ? "ROLLBACK" : `ROLLBACK TO ${sp}; RELEASE ${sp}`);
      throw e;
    }
  }

  // ---------- meta
  meta(chave: string): string | undefined {
    const r = this.d.todos("SELECT valor FROM meta WHERE chave = ?", [chave])[0];
    return r ? txt(r.valor) : undefined;
  }
  definirMeta(chave: string, valor: string): void {
    this.d.executar("INSERT INTO meta (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor", [chave, valor]);
  }

  // ---------- localidades
  private localidadeReg(r: LinhaSql): LocalidadeReg {
    return { id: txt(r.id), nome: txt(r.nome), cidade: txt(r.cidade), populacao: num(r.populacao), estatuto: txt(r.estatuto) as LocalidadeReg["estatuto"], desde: txt(r.desde) };
  }
  guardarLocalidades(localidades: readonly LocalidadeReg[]): void {
    this.transacao(() => {
      if (num(this.d.todos("SELECT COUNT(*) AS n FROM localidade")[0]?.n) > 0) throw new Error("O save já tem localidades");
      for (const l of localidades)
        this.d.executar("INSERT INTO localidade (id, nome, cidade, populacao, estatuto, desde) VALUES (?,?,?,?,?,?)", [l.id, l.nome, l.cidade, l.populacao, l.estatuto, l.desde]);
    });
  }
  localidade(id: string): LocalidadeReg | undefined {
    const r = this.d.todos("SELECT * FROM localidade WHERE id = ?", [id])[0];
    return r ? this.localidadeReg(r) : undefined;
  }
  localidades(filtro: { cidade?: string } = {}): LocalidadeReg[] {
    const rs = filtro.cidade === undefined ? this.d.todos("SELECT * FROM localidade ORDER BY id") : this.d.todos("SELECT * FROM localidade WHERE cidade = ? ORDER BY id", [filtro.cidade]);
    return rs.map((r) => this.localidadeReg(r));
  }
  atualizarLocalidade(id: string, a: AtualizacaoLocalidade): { evento?: number } {
    return this.transacao(() => {
      const antes = this.localidade(id);
      if (!antes) throw new Error(`Localidade inexistente: ${id}`);
      if (!(a.populacao >= 0)) throw new Error("população inválida");
      if (a.estatuto === antes.estatuto) {
        this.d.executar("UPDATE localidade SET populacao = ? WHERE id = ?", [a.populacao, id]);
        return {};
      }
      const evento = this.acrescentarEvento({
        tipo: "LOCALIDADE_ESTATUTO", data: a.data, epoca: a.epoca, vis: "publico",
        entidades: [{ k: "localidade", id }, { k: "cidade", id: antes.cidade }],
        ...(a.causa !== undefined ? { causa: a.causa } : {}),
        dados: { de: antes.estatuto, para: a.estatuto, populacao: a.populacao },
      });
      this.d.executar("UPDATE localidade SET populacao = ?, estatuto = ?, desde = ? WHERE id = ?", [a.populacao, a.estatuto, a.data, id]);
      return { evento };
    });
  }

  // ---------- pessoas
  guardarMundo(lote: LoteMundoReg, aoProgredir?: (feito: number, total: number) => void): void {
    this.transacao(() => {
      if (this.totalPessoas() > 0) throw new Error("O save já tem pessoas");
      const total = lote.pessoas.length + lote.jogadores.length + lote.contratos.length + lote.cargos.length;
      let feito = 0;
      const tick = () => {
        if (++feito % 500 === 0) aoProgredir?.(feito, total);
      };
      for (const p of lote.pessoas) {
        this.d.executar("INSERT INTO pessoa (id, nome, nome_desportivo, nascimento, nacionalidade, natural_de, papeis, personalidade, arquetipo, lod) VALUES (?,?,?,?,?,?,?,?,?,?)", [
          p.id, p.nome, p.nomeDesportivo, p.nascimento, p.nacionalidade, p.naturalDe ?? null, JSON.stringify(p.papeis), JSON.stringify(p.personalidade), p.arquetipo, p.lod,
        ]);
        tick();
      }
      for (const j of lote.jogadores) {
        this.d.executar("INSERT INTO jogador (pessoa, posicoes, atributos, potencial, altura, peso, pe, clube, estado) VALUES (?,?,?,?,?,?,?,?,?)", [
          j.pessoa, JSON.stringify(j.posicoes), JSON.stringify(j.atributos), j.potencial, j.alturaCm, j.pesoKg, j.pe, j.clube ?? null, j.estado,
        ]);
        tick();
      }
      for (const c of lote.contratos) {
        this.d.executar("INSERT INTO contrato (pessoa, clube, salario_mensal, inicio, fim) VALUES (?,?,?,?,?)", [c.pessoa, c.clube, c.salarioMensal, c.inicio, c.fim]);
        tick();
      }
      for (const c of lote.cargos) {
        this.d.executar("INSERT INTO cargo (pessoa, funcao, clube, cidade, qualidade) VALUES (?,?,?,?,?)", [c.pessoa, c.funcao, c.clube ?? null, c.cidade ?? null, c.qualidade ? JSON.stringify(c.qualidade) : null]);
        tick();
      }
      aoProgredir?.(total, total);
    });
  }
  totalPessoas(): number {
    return num(this.d.todos("SELECT COUNT(*) AS n FROM pessoa")[0]?.n);
  }
  indicePessoas(): PessoaIndice[] {
    return this.d
      .todos(
        "SELECT p.id, p.nome, p.nome_desportivo, j.posicoes, j.clube AS jclube, c.funcao, c.clube AS cclube FROM pessoa p LEFT JOIN jogador j ON j.pessoa = p.id LEFT JOIN cargo c ON c.pessoa = p.id ORDER BY p.id",
      )
      .map((r) => {
        const clube = r.jclube ?? r.cclube;
        const pos = r.posicoes === null ? undefined : (JSON.parse(txt(r.posicoes)) as { pos: string }[])[0]?.pos;
        return {
          id: txt(r.id), nome: txt(r.nome), nomeDesportivo: txt(r.nome_desportivo),
          ...(clube !== null ? { clube: txt(clube) } : {}), ...(pos !== undefined ? { posicao: pos } : {}), ...(r.funcao !== null ? { funcao: txt(r.funcao) } : {}),
        };
      });
  }
  private publica(r: LinhaSql): PessoaPublica {
    const pos = r.posicoes === null || r.posicoes === undefined ? undefined : (JSON.parse(txt(r.posicoes)) as { pos: string }[])[0]?.pos;
    const clube = r.jclube ?? r.cclube;
    return {
      id: txt(r.id),
      nome: txt(r.nome),
      nomeDesportivo: txt(r.nome_desportivo),
      nascimento: txt(r.nascimento),
      nacionalidade: txt(r.nacionalidade),
      ...(r.natural_de !== null && r.natural_de !== undefined ? { naturalDe: txt(r.natural_de) } : {}),
      papeis: JSON.parse(txt(r.papeis)) as string[],
      ...(clube !== null && clube !== undefined ? { clube: txt(clube) } : {}),
      ...(r.funcao !== null && r.funcao !== undefined ? { funcao: txt(r.funcao) } : {}),
      ...(pos !== undefined
        ? { jogador: { posicao: pos, alturaCm: num(r.altura), pesoKg: num(r.peso), pe: txt(r.pe) as "D" | "E" | "A", estado: txt(r.estado) as "ativo" | "livre" } }
        : {}),
    };
  }
  private static readonly SELECT_PUBLICO =
    "SELECT p.id, p.nome, p.nome_desportivo, p.nascimento, p.nacionalidade, p.natural_de, p.papeis, j.posicoes, j.altura, j.peso, j.pe, j.estado, j.clube AS jclube, c.funcao, c.clube AS cclube " +
    "FROM pessoa p LEFT JOIN jogador j ON j.pessoa = p.id LEFT JOIN cargo c ON c.pessoa = p.id";
  pessoaPublica(id: string): PessoaPublica | undefined {
    const r = this.d.todos(`${RepositorioSqlite.SELECT_PUBLICO} WHERE p.id = ?`, [id])[0];
    return r ? this.publica(r) : undefined;
  }
  plantelPublico(clube: string): PessoaPublica[] {
    return this.d
      .todos(`${RepositorioSqlite.SELECT_PUBLICO} WHERE j.clube = ? AND j.estado = 'ativo' ORDER BY p.nome_desportivo, p.id`, [clube])
      .map((r) => this.publica(r));
  }
  cargosPublicos(filtro: { clube?: string; cidade?: string }): PessoaPublica[] {
    const onde: string[] = [];
    const params: ValorSql[] = [];
    if (filtro.clube !== undefined) { onde.push("c.clube = ?"); params.push(filtro.clube); }
    if (filtro.cidade !== undefined) { onde.push("c.cidade = ?"); params.push(filtro.cidade); }
    if (onde.length === 0) return [];
    return this.d.todos(`${RepositorioSqlite.SELECT_PUBLICO} WHERE ${onde.join(" AND ")} ORDER BY c.funcao, p.id`, params).map((r) => this.publica(r));
  }
  pessoa(id: string): PessoaReg | undefined {
    const r = this.d.todos("SELECT * FROM pessoa WHERE id = ?", [id])[0];
    if (!r) return undefined;
    return {
      id: txt(r.id), nome: txt(r.nome), nomeDesportivo: txt(r.nome_desportivo), nascimento: txt(r.nascimento), nacionalidade: txt(r.nacionalidade),
      ...(r.natural_de !== null ? { naturalDe: txt(r.natural_de) } : {}),
      papeis: JSON.parse(txt(r.papeis)) as string[], personalidade: JSON.parse(txt(r.personalidade)) as Record<string, number>,
      arquetipo: txt(r.arquetipo), lod: num(r.lod) as 1 | 2 | 3,
    };
  }
  private jogadorDe(r: LinhaSql): JogadorReg {
    return {
      pessoa: txt(r.pessoa), posicoes: JSON.parse(txt(r.posicoes)) as { pos: string; aptidao: number }[], atributos: JSON.parse(txt(r.atributos)) as Record<string, number>,
      potencial: num(r.potencial), alturaCm: num(r.altura), pesoKg: num(r.peso), pe: txt(r.pe) as "D" | "E" | "A",
      ...(r.clube !== null ? { clube: txt(r.clube) } : {}), estado: txt(r.estado) as "ativo" | "livre",
    };
  }
  jogador(pessoa: string): JogadorReg | undefined {
    const r = this.d.todos("SELECT * FROM jogador WHERE pessoa = ?", [pessoa])[0];
    return r ? this.jogadorDe(r) : undefined;
  }
  jogadoresDoClube(clube: string): JogadorReg[] {
    return this.d.todos("SELECT * FROM jogador WHERE clube = ? ORDER BY pessoa", [clube]).map((r) => this.jogadorDe(r));
  }
  contrato(pessoa: string): ContratoReg | undefined {
    const r = this.d.todos("SELECT * FROM contrato WHERE pessoa = ? ORDER BY id DESC LIMIT 1", [pessoa])[0];
    return r ? { pessoa: txt(r.pessoa), clube: txt(r.clube), salarioMensal: num(r.salario_mensal), inicio: txt(r.inicio), fim: txt(r.fim) } : undefined;
  }
  cargo(pessoa: string): CargoReg | undefined {
    const r = this.d.todos("SELECT * FROM cargo WHERE pessoa = ?", [pessoa])[0];
    if (!r) return undefined;
    return {
      pessoa: txt(r.pessoa), funcao: txt(r.funcao),
      ...(r.clube !== null ? { clube: txt(r.clube) } : {}), ...(r.cidade !== null ? { cidade: txt(r.cidade) } : {}),
      ...(r.qualidade !== null ? { qualidade: JSON.parse(txt(r.qualidade)) as Record<string, number> } : {}),
    };
  }

  // ---------- calendário
  guardarCalendario(jogos: readonly JogoAgendado[], folgas: readonly FolgaAgendada[]): void {
    const chaves = new Set([...jogos, ...folgas].map((x) => `${x.competicao}\u0000${x.epoca}`));
    this.transacao(() => {
      for (const k of chaves) {
        const [c, e] = k.split("\u0000") as [string, string];
        if (num(this.d.todos("SELECT COUNT(*) AS n FROM calendario_jogo WHERE competicao = ? AND epoca = ?", [c, Number(e)])[0]?.n) > 0)
          throw new Error(`Já existe calendário de ${c} na época ${e}`);
      }
      for (const j of jogos)
        this.d.executar("INSERT INTO calendario_jogo (id, competicao, epoca, jornada, data, casa, fora) VALUES (?,?,?,?,?,?,?)", [j.id, j.competicao, j.epoca, j.jornada, j.data, j.casa, j.fora]);
      for (const f of folgas)
        this.d.executar("INSERT INTO calendario_folga (competicao, epoca, jornada, clube) VALUES (?,?,?,?)", [f.competicao, f.epoca, f.jornada, f.clube]);
    });
  }
  private jogoAgendado(r: LinhaSql): JogoAgendado {
    return { id: txt(r.id), competicao: txt(r.competicao), epoca: num(r.epoca), jornada: num(r.jornada), data: txt(r.data), casa: txt(r.casa), fora: txt(r.fora) };
  }
  calendario(competicao: string, epoca: number): { jogos: JogoAgendado[]; folgas: FolgaAgendada[] } {
    const jogos = this.d.todos("SELECT * FROM calendario_jogo WHERE competicao = ? AND epoca = ? ORDER BY jornada, id", [competicao, epoca]).map((r) => this.jogoAgendado(r));
    const folgas = this.d
      .todos("SELECT * FROM calendario_folga WHERE competicao = ? AND epoca = ? ORDER BY jornada", [competicao, epoca])
      .map((r) => ({ competicao: txt(r.competicao), epoca: num(r.epoca), jornada: num(r.jornada), clube: txt(r.clube) }));
    return { jogos, folgas };
  }
  calendarioDoClube(clube: string, epoca: number): JogoAgendado[] {
    return this.d.todos("SELECT * FROM calendario_jogo WHERE epoca = ? AND (casa = ? OR fora = ?) ORDER BY data, id", [epoca, clube, clube]).map((r) => this.jogoAgendado(r));
  }
  jogosDoDia(data: Data): JogoAgendado[] {
    return this.d.todos("SELECT * FROM calendario_jogo WHERE data = ? ORDER BY id", [data]).map((r) => this.jogoAgendado(r));
  }
  proximoJogo(clube: string, desde: Data): JogoAgendado | undefined {
    const r = this.d.todos("SELECT * FROM calendario_jogo WHERE (casa = ? OR fora = ?) AND data >= ? ORDER BY data, id LIMIT 1", [clube, clube, desde])[0];
    return r ? this.jogoAgendado(r) : undefined;
  }

  // ---------- história
  acrescentarEvento(e: EventoNovo): number {
    validarEventoNovo(e);
    return this.transacao(() => {
      const { ultimoId } = this.d.executar(
        "INSERT INTO evento (tipo, v, data, epoca, jornada, vis, causa, corrige, origem, dados) VALUES (?,?,?,?,?,?,?,?,?,?)",
        [e.tipo, e.v ?? 1, e.data, e.epoca, e.jornada ?? null, visNum(e.vis), e.causa ?? null, e.corrige ?? null, e.origem ?? "jogo", JSON.stringify(e.dados)],
      );
      for (const x of e.entidades)
        this.d.executar("INSERT INTO evento_entidade (k, id, evento, papel) VALUES (?,?,?,?)", [x.k, x.id, ultimoId, x.papel ?? null]);
      return ultimoId;
    });
  }

  private paraEventos(linhas: LinhaSql[]): Evento[] {
    const ents = new Map<number, EntidadeRef[]>();
    for (let i = 0; i < linhas.length; i += 400) {
      const ids = linhas.slice(i, i + 400).map((l) => num(l.id));
      const rs = this.d.todos(
        `SELECT evento, k, id, papel FROM evento_entidade WHERE evento IN (${ids.map(() => "?").join(",")}) ORDER BY evento, k, id`,
        ids,
      );
      for (const r of rs) {
        const lista = ents.get(num(r.evento)) ?? [];
        lista.push({ k: txt(r.k) as TipoEntidade, id: txt(r.id), ...(r.papel !== null ? { papel: txt(r.papel) } : {}) });
        ents.set(num(r.evento), lista);
      }
    }
    return linhas.map((l) => ({
      id: num(l.id),
      tipo: txt(l.tipo),
      v: num(l.v),
      data: txt(l.data),
      epoca: num(l.epoca),
      ...(l.jornada !== null ? { jornada: num(l.jornada) } : {}),
      vis: VIS[num(l.vis)] as Visibilidade,
      entidades: ents.get(num(l.id)) ?? [],
      ...(l.causa !== null ? { causa: num(l.causa) } : {}),
      ...(l.corrige !== null ? { corrige: num(l.corrige) } : {}),
      origem: txt(l.origem) as Evento["origem"],
      dados: JSON.parse(txt(l.dados)) as Record<string, unknown>,
    }));
  }

  evento(id: number): Evento | undefined {
    return this.paraEventos(this.d.todos("SELECT * FROM evento WHERE id = ?", [id]))[0];
  }

  totalEventos(): number {
    return num(this.d.todos("SELECT COUNT(*) AS n FROM evento")[0]?.n);
  }

  eventosDe(entidade: Pick<EntidadeRef, "k" | "id">, f: FiltroEventos = {}): Evento[] {
    const onde = ["x.k = ?", "x.id = ?"];
    const p: ValorSql[] = [entidade.k, entidade.id];
    if (f.apenasPublicos) onde.push("e.vis = 0");
    if (f.vis) {
      onde.push(`e.vis IN (${f.vis.map(() => "?").join(",") || "NULL"})`);
      p.push(...f.vis.map(visNum));
    }
    if (f.tipo !== undefined) {
      onde.push("e.tipo = ?");
      p.push(f.tipo);
    }
    if (f.desdeEpoca !== undefined) {
      onde.push("e.epoca >= ?");
      p.push(f.desdeEpoca);
    }
    if (f.ateEpoca !== undefined) {
      onde.push("e.epoca <= ?");
      p.push(f.ateEpoca);
    }
    if (f.depoisDe !== undefined) { onde.push("e.id > ?"); p.push(f.depoisDe); }
    if (f.antesDe !== undefined) { onde.push("e.id < ?"); p.push(f.antesDe); }
    p.push(f.limite ?? -1);
    return this.paraEventos(
      this.d.todos(`SELECT e.* FROM evento_entidade x JOIN evento e ON e.id = x.evento WHERE ${onde.join(" AND ")} ORDER BY e.id DESC LIMIT ?`, p),
    );
  }

  eventosRecentes(f: FiltroRecentes = {}): Evento[] {
    const onde: string[] = ["1 = 1"];
    const p: ValorSql[] = [];
    if (f.apenasPublicos) onde.push("vis = 0");
    if (f.tipos) {
      onde.push(`tipo IN (${f.tipos.map(() => "?").join(",") || "NULL"})`);
      p.push(...f.tipos);
    }
    if (f.depoisDe !== undefined) { onde.push("id > ?"); p.push(f.depoisDe); }
    if (f.antesDe !== undefined) { onde.push("id < ?"); p.push(f.antesDe); }
    p.push(f.limite ?? -1);
    return this.paraEventos(this.d.todos(`SELECT * FROM evento WHERE ${onde.join(" AND ")} ORDER BY id DESC LIMIT ?`, p));
  }

  contar(tipo: string, entidade?: Pick<EntidadeRef, "k" | "id">, i: { desdeEpoca?: number; ateEpoca?: number } = {}): number {
    const onde = ["e.tipo = ?"];
    const p: ValorSql[] = [tipo];
    if (entidade) {
      onde.push("e.id IN (SELECT evento FROM evento_entidade WHERE k = ? AND id = ?)");
      p.push(entidade.k, entidade.id);
    }
    if (i.desdeEpoca !== undefined) {
      onde.push("e.epoca >= ?");
      p.push(i.desdeEpoca);
    }
    if (i.ateEpoca !== undefined) {
      onde.push("e.epoca <= ?");
      p.push(i.ateEpoca);
    }
    return num(this.d.todos(`SELECT COUNT(*) AS n FROM evento e WHERE ${onde.join(" AND ")}`, p)[0]?.n);
  }

  ultimo(tipo: string, entidade: Pick<EntidadeRef, "k" | "id">): Evento | undefined {
    return this.eventosDe(entidade, { tipo, limite: 1 })[0];
  }
  ultimos(tipo: string, entidade: Pick<EntidadeRef, "k" | "id">, n: number): Evento[] {
    return this.eventosDe(entidade, { tipo, limite: n });
  }

  cadeia(eventoId: number): Evento[] {
    return this.paraEventos(
      this.d.todos(
        `WITH RECURSIVE
           acima(id, causa) AS (SELECT id, causa FROM evento WHERE id = ? UNION ALL SELECT e.id, e.causa FROM evento e JOIN acima a ON e.id = a.causa),
           abaixo(id) AS (SELECT id FROM evento WHERE id = ? UNION ALL SELECT e.id FROM evento e JOIN abaixo b ON e.causa = b.id)
         SELECT * FROM evento WHERE id IN (SELECT id FROM acima UNION SELECT id FROM abaixo) ORDER BY id`,
        [eventoId, eventoId],
      ),
    );
  }

  exportarNdjson(): string {
    const linhas: string[] = [];
    for (let desde = 0; ; ) {
      const lote = this.d.todos("SELECT * FROM evento WHERE id > ? ORDER BY id LIMIT 1000", [desde]);
      if (lote.length === 0) break;
      for (const e of this.paraEventos(lote)) linhas.push(JSON.stringify(e));
      desde = num(lote[lote.length - 1]?.id);
    }
    return linhas.length === 0 ? "" : linhas.join("\n") + "\n";
  }

  // ---------- jogos
  registarJogo(j: JogoNovo, factos: JogoFacto[], participacoes: Participacao[]): { evento: number } {
    validarJogo(j, factos, participacoes);
    return this.transacao(() => {
      if (this.d.todos("SELECT 1 AS x FROM jogo WHERE id = ?", [j.id]).length > 0) throw new Error(`Jogo ${j.id} já existe`);
      const evento = this.acrescentarEvento({
        tipo: "JOGO_JOGADO",
        data: j.data,
        epoca: j.epoca,
        jornada: j.jornada,
        vis: "publico",
        entidades: [
          { k: "clube", id: j.casa, papel: "casa" },
          { k: "clube", id: j.fora, papel: "fora" },
          { k: "competicao", id: j.competicao },
          { k: "jogo", id: j.id },
        ],
        ...(j.causa !== undefined ? { causa: j.causa } : {}),
        dados: { golosCasa: j.golosCasa, golosFora: j.golosFora },
      });
      this.d.executar(
        `INSERT INTO jogo (id, competicao, epoca, jornada, data, casa, fora, golos_casa, golos_fora, xg_casa, xg_fora, posse_casa,
           assistencia, receita, importancia, arbitro, evento) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [j.id, j.competicao, j.epoca, j.jornada, j.data, j.casa, j.fora, j.golosCasa, j.golosFora, j.xgCasa ?? 0, j.xgFora ?? 0,
         j.posseCasa ?? 0.5, j.assistencia ?? 0, j.receita ?? 0, j.importancia ?? 0, j.arbitro ?? "", evento],
      );
      for (const f of factos)
        this.d.executar("INSERT INTO jogo_facto (jogo, minuto, tipo, jogador, clube, extra) VALUES (?,?,?,?,?,?)", [j.id, f.minuto, f.tipo, f.jogador, f.clube, f.extra ?? ""]);
      for (const p of participacoes)
        this.d.executar("INSERT INTO participacao (jogo, jogador, clube, titular, minutos, nota) VALUES (?,?,?,?,?,?)", [j.id, p.jogador, p.clube, p.titular ? 1 : 0, p.minutos, p.nota ?? null]);
      this.atualizarDerivadas(j, factos, participacoes);
      return { evento };
    });
  }

  private atualizarDerivadas(j: JogoNovo, factos: JogoFacto[], participacoes: Participacao[]): void {
    const lado = (clube: string, gm: number, gs: number) => {
      const v = gm > gs ? 1 : 0;
      const e = gm === gs ? 1 : 0;
      this.d.executar(
        `INSERT INTO classificacao (competicao, epoca, clube, jogos, vitorias, empates, derrotas, gm, gs, pontos_jogos)
         VALUES (?,?,?,1,?,?,?,?,?,?)
         ON CONFLICT(competicao, epoca, clube) DO UPDATE SET jogos = jogos + 1, vitorias = vitorias + excluded.vitorias,
           empates = empates + excluded.empates, derrotas = derrotas + excluded.derrotas, gm = gm + excluded.gm,
           gs = gs + excluded.gs, pontos_jogos = pontos_jogos + excluded.pontos_jogos`,
        [j.competicao, j.epoca, clube, v, e, gm < gs ? 1 : 0, gm, gs, v * this.pontos.vitoria + e * this.pontos.empate],
      );
    };
    lado(j.casa, j.golosCasa, j.golosFora);
    lado(j.fora, j.golosFora, j.golosCasa);

    type Acc = { clube: string; jogador: string; jogos: number; minutos: number; golos: number; assist: number; am: number; ver: number };
    const acc = new Map<string, Acc>();
    const de = (jogador: string, clube: string): Acc => {
      const k = `${jogador}\u0000${clube}`;
      let a = acc.get(k);
      if (!a) acc.set(k, (a = { clube, jogador, jogos: 0, minutos: 0, golos: 0, assist: 0, am: 0, ver: 0 }));
      return a;
    };
    for (const p of participacoes) {
      const a = de(p.jogador, p.clube);
      a.jogos += p.minutos > 0 ? 1 : 0;
      a.minutos += p.minutos;
    }
    for (const f of factos) {
      if (f.tipo === "G" && f.extra !== "auto") de(f.jogador, f.clube).golos++;
      else if (f.tipo === "A") de(f.jogador, f.clube).assist++;
      else if (f.tipo === "CA") de(f.jogador, f.clube).am++;
      else if (f.tipo === "CV") de(f.jogador, f.clube).ver++;
    }
    for (const a of acc.values())
      this.d.executar(
        `INSERT INTO stat_jogador_epoca (jogador, epoca, clube, competicao, jogos, minutos, golos, assistencias, amarelos, vermelhos)
         VALUES (?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(jogador, epoca, clube, competicao) DO UPDATE SET jogos = jogos + excluded.jogos, minutos = minutos + excluded.minutos,
           golos = golos + excluded.golos, assistencias = assistencias + excluded.assistencias,
           amarelos = amarelos + excluded.amarelos, vermelhos = vermelhos + excluded.vermelhos`,
        [a.jogador, j.epoca, a.clube, j.competicao, a.jogos, a.minutos, a.golos, a.assist, a.am, a.ver],
      );
  }

  jogo(id: string): Jogo | undefined {
    const r = this.d.todos("SELECT * FROM jogo WHERE id = ?", [id])[0];
    if (!r) return undefined;
    return {
      id: txt(r.id), competicao: txt(r.competicao), epoca: num(r.epoca), jornada: num(r.jornada), data: txt(r.data),
      casa: txt(r.casa), fora: txt(r.fora), golosCasa: num(r.golos_casa), golosFora: num(r.golos_fora),
      xgCasa: num(r.xg_casa), xgFora: num(r.xg_fora), posseCasa: num(r.posse_casa), assistencia: num(r.assistencia),
      receita: num(r.receita), importancia: num(r.importancia), arbitro: txt(r.arbitro), evento: num(r.evento),
    };
  }

  jogosDaCompeticao(competicao: string, epoca: number): Jogo[] {
    return this.d
      .todos("SELECT id FROM jogo WHERE competicao = ? AND epoca = ? ORDER BY jornada, data, id", [competicao, epoca])
      .map((r) => this.jogo(txt(r.id)) as Jogo);
  }

  marcadores(competicao: string, epoca: number, jornada: number): Marcador[] {
    return this.d
      .todos(
        `SELECT f.jogador, f.clube, f.minuto, f.jogo FROM jogo_facto f JOIN jogo j ON j.id = f.jogo
         WHERE j.competicao = ? AND j.epoca = ? AND j.jornada = ? AND f.tipo = 'G' ORDER BY j.data, j.id, f.minuto, f.rowid`,
        [competicao, epoca, jornada],
      )
      .map((r) => ({ jogador: txt(r.jogador), clube: txt(r.clube), minuto: num(r.minuto), jogo: txt(r.jogo) }));
  }

  cartoes(competicao: string, epoca: number, jogadores: readonly string[]): RegistoCartao[] {
    if (jogadores.length === 0) return [];
    return this.d
      .todos(
        `SELECT f.jogador, f.jogo, j.jornada, f.minuto, f.tipo, f.extra FROM jogo_facto f JOIN jogo j ON j.id = f.jogo
         WHERE j.competicao = ? AND j.epoca = ? AND f.tipo IN ('CA', 'CV') AND f.jogador IN (${jogadores.map(() => "?").join(",")})
         ORDER BY j.jornada, j.data, j.id, f.minuto, f.rowid`,
        [competicao, epoca, ...jogadores],
      )
      .map((r) => ({ jogador: txt(r.jogador), jogo: txt(r.jogo), jornada: num(r.jornada), minuto: num(r.minuto), tipo: txt(r.tipo) as "CA" | "CV", extra: txt(r.extra) }));
  }

  jornadasJogadas(clube: string, competicao: string, epoca: number): number[] {
    return this.d
      .todos("SELECT DISTINCT jornada FROM jogo WHERE competicao = ? AND epoca = ? AND (casa = ? OR fora = ?) ORDER BY jornada", [competicao, epoca, clube, clube])
      .map((r) => num(r.jornada));
  }

  classificacao(competicao: string, epoca: number): LinhaClassificacao[] {
    return this.d
      .todos(
        `SELECT *, pontos_jogos + ajuste AS pontos FROM classificacao WHERE competicao = ? AND epoca = ?
         ORDER BY pontos DESC, gm - gs DESC, gm DESC, clube`,
        [competicao, epoca],
      )
      .map((r) => ({
        clube: txt(r.clube), jogos: num(r.jogos), vitorias: num(r.vitorias), empates: num(r.empates), derrotas: num(r.derrotas),
        golosMarcados: num(r.gm), golosSofridos: num(r.gs), pontosJogos: num(r.pontos_jogos), ajuste: num(r.ajuste), pontos: num(r.pontos),
      }));
  }

  statsJogador(jogador: string): LinhaStatJogador[] {
    return this.d
      .todos("SELECT * FROM stat_jogador_epoca WHERE jogador = ? ORDER BY epoca, competicao, clube", [jogador])
      .map((r) => ({
        jogador: txt(r.jogador), epoca: num(r.epoca), clube: txt(r.clube), competicao: txt(r.competicao), jogos: num(r.jogos),
        minutos: num(r.minutos), golos: num(r.golos), assistencias: num(r.assistencias), amarelos: num(r.amarelos), vermelhos: num(r.vermelhos),
      }));
  }

  playerStatsForCompetition(competition: string, season: number): PlayerCompetitionStats[] {
    const notas = new Map(
      this.d
        .todos("SELECT p.jogador AS jogador, AVG(p.nota) AS media, COUNT(p.nota) AS n FROM participacao p JOIN jogo j ON j.id = p.jogo WHERE j.competicao = ? AND j.epoca = ? AND p.nota IS NOT NULL GROUP BY p.jogador", [competition, season])
        .map((r) => [txt(r.jogador), { media: num(r.media), n: num(r.n) }] as const),
    );
    return this.d
      .todos("SELECT * FROM stat_jogador_epoca WHERE competicao = ? AND epoca = ? ORDER BY jogador", [competition, season])
      .map((r) => {
        const n = notas.get(txt(r.jogador));
        return {
          jogador: txt(r.jogador), epoca: num(r.epoca), clube: txt(r.clube), competicao: txt(r.competicao), jogos: num(r.jogos),
          minutos: num(r.minutos), golos: num(r.golos), assistencias: num(r.assistencias), amarelos: num(r.amarelos), vermelhos: num(r.vermelhos),
          ratedGames: n?.n ?? 0, ...(n ? { avgRating: n.media } : {}),
        };
      });
  }

  ajustarClassificacao(a: AjusteClassificacao): void {
    this.transacao(() => {
      this.d.executar("INSERT INTO classificacao_ajuste (competicao, epoca, clube, pontos, evento) VALUES (?,?,?,?,?)", [a.competicao, a.epoca, a.clube, a.pontos, a.evento]);
      this.d.executar("INSERT INTO classificacao (competicao, epoca, clube) VALUES (?,?,?) ON CONFLICT DO NOTHING", [a.competicao, a.epoca, a.clube]);
      this.d.executar("UPDATE classificacao SET ajuste = ajuste + ? WHERE competicao = ? AND epoca = ? AND clube = ?", [a.pontos, a.competicao, a.epoca, a.clube]);
    });
  }

  reconstruirDerivadas(): void {
    this.transacao(() => {
      this.d.executar("DELETE FROM classificacao");
      this.d.executar(
        `INSERT INTO classificacao (competicao, epoca, clube, jogos, vitorias, empates, derrotas, gm, gs, pontos_jogos)
         SELECT competicao, epoca, clube, COUNT(*), SUM(v), SUM(e), SUM(d), SUM(gm), SUM(gs), SUM(v) * ? + SUM(e) * ? FROM (
           SELECT competicao, epoca, casa AS clube, golos_casa AS gm, golos_fora AS gs,
                  golos_casa > golos_fora AS v, golos_casa = golos_fora AS e, golos_casa < golos_fora AS d FROM jogo
           UNION ALL
           SELECT competicao, epoca, fora, golos_fora, golos_casa,
                  golos_fora > golos_casa, golos_fora = golos_casa, golos_fora < golos_casa FROM jogo
         ) GROUP BY competicao, epoca, clube`,
        [this.pontos.vitoria, this.pontos.empate],
      );
      this.d.executar(
        `INSERT INTO classificacao (competicao, epoca, clube) SELECT DISTINCT competicao, epoca, clube FROM classificacao_ajuste WHERE true ON CONFLICT DO NOTHING`,
      );
      this.d.executar(
        `UPDATE classificacao SET ajuste = COALESCE((SELECT SUM(a.pontos) FROM classificacao_ajuste a
           WHERE a.competicao = classificacao.competicao AND a.epoca = classificacao.epoca AND a.clube = classificacao.clube), 0)`,
      );
      this.d.executar("DELETE FROM stat_jogador_epoca");
      this.d.executar(
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
  acrescentarObservacao(o: ObservacaoNova): number {
    return this.d.executar(
      "INSERT INTO observacao (observador, alvo_k, alvo_id, grupo, valores, qualidade, fonte, data, epoca) VALUES (?,?,?,?,?,?,?,?,?)",
      [o.observador, o.alvoK, o.alvoId, o.grupo, JSON.stringify(o.valores), o.qualidade, o.fonte, o.data, o.epoca],
    ).ultimoId;
  }

  observacoes(observador: string, alvo: Pick<EntidadeRef, "k" | "id">, grupo?: string): Observacao[] {
    const p: ValorSql[] = [observador, alvo.k, alvo.id];
    if (grupo !== undefined) p.push(grupo);
    return this.d
      .todos(`SELECT * FROM observacao WHERE observador = ? AND alvo_k = ? AND alvo_id = ?${grupo !== undefined ? " AND grupo = ?" : ""} ORDER BY id DESC`, p)
      .map((r) => ({
        id: num(r.id), observador: txt(r.observador), alvoK: txt(r.alvo_k) as TipoEntidade, alvoId: txt(r.alvo_id), grupo: txt(r.grupo),
        valores: JSON.parse(txt(r.valores)) as Record<string, unknown>, qualidade: num(r.qualidade), fonte: txt(r.fonte), data: txt(r.data), epoca: num(r.epoca),
      }));
  }
}
