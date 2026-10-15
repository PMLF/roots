/**
 * Repositório em memória (RZ-128): mesmo comportamento que o SQLite, sem dependências nativas.
 * Serve para testes rápidos do motor e como referência executável do contrato (ambos passam na mesma bateria).
 */
import { VERSAO_ESQUEMA } from "./esquema";
import type { FiltroEventos, Repositorio } from "./repositorio";
import type {
  AjusteClassificacao,
  EntidadeRef,
  Evento,
  EventoNovo,
  Jogo,
  JogoFacto,
  JogoNovo,
  LinhaClassificacao,
  LinhaStatJogador,
  Marcador,
  Observacao,
  ObservacaoNova,
  Participacao,
  PontosPorResultado,
} from "./tipos";
import { cmp, validarEventoNovo, validarJogo } from "./validacao";

type RegJogo = { jogo: Jogo; factos: JogoFacto[]; part: Participacao[] };
type ClassRow = { jogos: number; vitorias: number; empates: number; derrotas: number; gm: number; gs: number; pontosJogos: number; ajuste: number };
type StatRow = Omit<LinhaStatJogador, "jogador" | "epoca" | "clube" | "competicao">;

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const chaveEnt = (e: Pick<EntidadeRef, "k" | "id">) => `${e.k}\u0000${e.id}`;
const linhaVazia = (): ClassRow => ({ jogos: 0, vitorias: 0, empates: 0, derrotas: 0, gm: 0, gs: 0, pontosJogos: 0, ajuste: 0 });
const statVazia = (): StatRow => ({ jogos: 0, minutos: 0, golos: 0, assistencias: 0, amarelos: 0, vermelhos: 0 });

export class RepositorioMemoria implements Repositorio {
  readonly versaoEsquema = VERSAO_ESQUEMA;

  private eventos: Evento[] = [];
  private porEntidade = new Map<string, number[]>();
  private filhos = new Map<number, number[]>();
  private jogos = new Map<string, RegJogo>();
  private ajustes: AjusteClassificacao[] = [];
  private classif = new Map<string, ClassRow>();
  private stats = new Map<string, StatRow>();
  private obs: Observacao[] = [];
  private metaMap = new Map<string, string>();
  private diario: (() => void)[][] = [];

  constructor(private readonly pontos: PontosPorResultado = { vitoria: 3, empate: 1 }) {}

  private desfazer(fn: () => void): void {
    this.diario[this.diario.length - 1]?.push(fn);
  }

  transacao<T>(fn: () => T): T {
    const quadro: (() => void)[] = [];
    this.diario.push(quadro);
    try {
      const r = fn();
      this.diario.pop();
      // confirmar um quadro interno: passa os seus desfazeres para o quadro de fora (que ainda pode falhar)
      const fora = this.diario[this.diario.length - 1];
      if (fora) for (const u of quadro) fora.push(u);
      return r;
    } catch (e) {
      this.diario.pop();
      for (const u of quadro.reverse()) u();
      throw e;
    }
  }

  meta(chave: string): string | undefined {
    return this.metaMap.get(chave);
  }
  definirMeta(chave: string, valor: string): void {
    const antes = this.metaMap.get(chave);
    this.metaMap.set(chave, valor);
    this.desfazer(() => {
      if (antes === undefined) this.metaMap.delete(chave);
      else this.metaMap.set(chave, antes);
    });
  }

  // ---------- história
  acrescentarEvento(e: EventoNovo): number {
    validarEventoNovo(e);
    const sem = (id: number | undefined, nome: string) => {
      if (id !== undefined && (id < 1 || id > this.eventos.length)) throw new Error(`${nome} aponta para um evento inexistente (${id})`);
    };
    sem(e.causa, "causa");
    sem(e.corrige, "corrige");
    const id = this.eventos.length + 1;
    const ev: Evento = clone({
      id,
      tipo: e.tipo,
      v: e.v ?? 1,
      data: e.data,
      epoca: e.epoca,
      ...(e.jornada !== undefined ? { jornada: e.jornada } : {}),
      vis: e.vis,
      entidades: [...e.entidades].sort((a, b) => cmp(a.k, b.k) || cmp(a.id, b.id)).map((x) => ({ k: x.k, id: x.id, ...(x.papel !== undefined ? { papel: x.papel } : {}) })),
      ...(e.causa !== undefined ? { causa: e.causa } : {}),
      ...(e.corrige !== undefined ? { corrige: e.corrige } : {}),
      origem: e.origem ?? "jogo",
      dados: e.dados,
    });
    this.eventos.push(ev);
    this.desfazer(() => this.eventos.pop());
    for (const x of ev.entidades) {
      const k = chaveEnt(x);
      const lista = this.porEntidade.get(k) ?? [];
      lista.push(id);
      this.porEntidade.set(k, lista);
      this.desfazer(() => {
        lista.pop();
        if (lista.length === 0) this.porEntidade.delete(k);
      });
    }
    if (ev.causa !== undefined) {
      const lista = this.filhos.get(ev.causa) ?? [];
      lista.push(id);
      this.filhos.set(ev.causa, lista);
      this.desfazer(() => {
        lista.pop();
        if (lista.length === 0) this.filhos.delete(ev.causa as number);
      });
    }
    return id;
  }

  evento(id: number): Evento | undefined {
    const e = this.eventos[id - 1];
    return e ? clone(e) : undefined;
  }

  totalEventos(): number {
    return this.eventos.length;
  }

  eventosDe(entidade: Pick<EntidadeRef, "k" | "id">, f: FiltroEventos = {}): Evento[] {
    const ids = this.porEntidade.get(chaveEnt(entidade)) ?? [];
    const out: Evento[] = [];
    for (let i = ids.length - 1; i >= 0 && (f.limite === undefined || out.length < f.limite); i--) {
      const e = this.eventos[(ids[i] as number) - 1] as Evento;
      if (f.apenasPublicos && e.vis !== "publico") continue;
      if (f.tipo !== undefined && e.tipo !== f.tipo) continue;
      if (f.desdeEpoca !== undefined && e.epoca < f.desdeEpoca) continue;
      if (f.ateEpoca !== undefined && e.epoca > f.ateEpoca) continue;
      out.push(clone(e));
    }
    return out;
  }

  contar(tipo: string, entidade?: Pick<EntidadeRef, "k" | "id">, i: { desdeEpoca?: number; ateEpoca?: number } = {}): number {
    const fonte = entidade ? (this.porEntidade.get(chaveEnt(entidade)) ?? []).map((id) => this.eventos[id - 1] as Evento) : this.eventos;
    return fonte.filter((e) => e.tipo === tipo && (i.desdeEpoca === undefined || e.epoca >= i.desdeEpoca) && (i.ateEpoca === undefined || e.epoca <= i.ateEpoca)).length;
  }

  ultimo(tipo: string, entidade: Pick<EntidadeRef, "k" | "id">): Evento | undefined {
    return this.eventosDe(entidade, { tipo, limite: 1 })[0];
  }
  ultimos(tipo: string, entidade: Pick<EntidadeRef, "k" | "id">, n: number): Evento[] {
    return this.eventosDe(entidade, { tipo, limite: n });
  }

  cadeia(eventoId: number): Evento[] {
    const ids = new Set<number>();
    if (!this.eventos[eventoId - 1]) return [];
    for (let id: number | undefined = eventoId; id !== undefined; id = this.eventos[id - 1]?.causa) ids.add(id);
    const fila = [eventoId];
    while (fila.length > 0) {
      const id = fila.pop() as number;
      ids.add(id);
      fila.push(...(this.filhos.get(id) ?? []));
    }
    return [...ids].sort((a, b) => a - b).map((id) => clone(this.eventos[id - 1] as Evento));
  }

  exportarNdjson(): string {
    return this.eventos.length === 0 ? "" : this.eventos.map((e) => JSON.stringify(e)).join("\n") + "\n";
  }

  // ---------- jogos
  registarJogo(j: JogoNovo, factos: JogoFacto[], participacoes: Participacao[]): { evento: number } {
    validarJogo(j, factos, participacoes);
    return this.transacao(() => {
      if (this.jogos.has(j.id)) throw new Error(`Jogo ${j.id} já existe`);
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
      const jogo: Jogo = {
        id: j.id, competicao: j.competicao, epoca: j.epoca, jornada: j.jornada, data: j.data, casa: j.casa, fora: j.fora,
        golosCasa: j.golosCasa, golosFora: j.golosFora, xgCasa: j.xgCasa ?? 0, xgFora: j.xgFora ?? 0, posseCasa: j.posseCasa ?? 0.5,
        assistencia: j.assistencia ?? 0, receita: j.receita ?? 0, importancia: j.importancia ?? 0, arbitro: j.arbitro ?? "", evento,
      };
      this.jogos.set(j.id, { jogo, factos: clone(factos), part: clone(participacoes) });
      this.desfazer(() => this.jogos.delete(j.id));
      this.aplicarJogo(jogo, factos, participacoes);
      return { evento };
    });
  }

  private upsert<V>(mapa: Map<string, V>, chave: string, vazio: () => V): V {
    let v = mapa.get(chave);
    if (v === undefined) {
      v = vazio();
      mapa.set(chave, v);
      this.desfazer(() => mapa.delete(chave));
    } else {
      const antes = clone(v);
      this.desfazer(() => mapa.set(chave, antes));
    }
    return v;
  }

  private aplicarJogo(j: Jogo, factos: JogoFacto[], participacoes: Participacao[]): void {
    const lado = (clube: string, gm: number, gs: number) => {
      const r = this.upsert(this.classif, [j.competicao, j.epoca, clube].join("\u0000"), linhaVazia);
      const v = gm > gs ? 1 : 0;
      const e = gm === gs ? 1 : 0;
      r.jogos++;
      r.vitorias += v;
      r.empates += e;
      r.derrotas += gm < gs ? 1 : 0;
      r.gm += gm;
      r.gs += gs;
      r.pontosJogos += v * this.pontos.vitoria + e * this.pontos.empate;
    };
    lado(j.casa, j.golosCasa, j.golosFora);
    lado(j.fora, j.golosFora, j.golosCasa);
    const stat = (jogador: string, clube: string) => this.upsert(this.stats, [jogador, j.epoca, clube, j.competicao].join("\u0000"), statVazia);
    for (const p of participacoes) {
      const s = stat(p.jogador, p.clube);
      s.jogos += p.minutos > 0 ? 1 : 0;
      s.minutos += p.minutos;
    }
    for (const f of factos) {
      if (f.tipo === "G" && f.extra !== "auto") stat(f.jogador, f.clube).golos++;
      else if (f.tipo === "A") stat(f.jogador, f.clube).assistencias++;
      else if (f.tipo === "CA") stat(f.jogador, f.clube).amarelos++;
      else if (f.tipo === "CV") stat(f.jogador, f.clube).vermelhos++;
    }
  }

  jogo(id: string): Jogo | undefined {
    const r = this.jogos.get(id);
    return r ? { ...r.jogo } : undefined;
  }

  marcadores(competicao: string, epoca: number, jornada: number): Marcador[] {
    return [...this.jogos.values()]
      .filter((r) => r.jogo.competicao === competicao && r.jogo.epoca === epoca && r.jogo.jornada === jornada)
      .sort((a, b) => cmp(a.jogo.data, b.jogo.data) || cmp(a.jogo.id, b.jogo.id))
      .flatMap((r) =>
        r.factos
          .filter((f) => f.tipo === "G")
          .map((f, i) => ({ f, i }))
          .sort((a, b) => a.f.minuto - b.f.minuto || a.i - b.i)
          .map(({ f }) => ({ jogador: f.jogador, clube: f.clube, minuto: f.minuto, jogo: r.jogo.id })),
      );
  }

  classificacao(competicao: string, epoca: number): LinhaClassificacao[] {
    const prefixo = `${competicao}\u0000${epoca}\u0000`;
    return [...this.classif.entries()]
      .filter(([k]) => k.startsWith(prefixo))
      .map(([k, r]) => ({
        clube: k.slice(prefixo.length), jogos: r.jogos, vitorias: r.vitorias, empates: r.empates, derrotas: r.derrotas,
        golosMarcados: r.gm, golosSofridos: r.gs, pontosJogos: r.pontosJogos, ajuste: r.ajuste, pontos: r.pontosJogos + r.ajuste,
      }))
      .sort((a, b) => b.pontos - a.pontos || b.golosMarcados - b.golosSofridos - (a.golosMarcados - a.golosSofridos) || b.golosMarcados - a.golosMarcados || cmp(a.clube, b.clube));
  }

  statsJogador(jogador: string): LinhaStatJogador[] {
    return [...this.stats.entries()]
      .map(([k, s]) => {
        const [jog, epoca, clube, competicao] = k.split("\u0000") as [string, string, string, string];
        return { jogador: jog, epoca: Number(epoca), clube, competicao, ...s };
      })
      .filter((l) => l.jogador === jogador)
      .sort((a, b) => a.epoca - b.epoca || cmp(a.competicao, b.competicao) || cmp(a.clube, b.clube));
  }

  ajustarClassificacao(a: AjusteClassificacao): void {
    if (a.evento < 1 || a.evento > this.eventos.length) throw new Error(`ajuste aponta para um evento inexistente (${a.evento})`);
    this.transacao(() => {
      this.ajustes.push({ ...a });
      this.desfazer(() => this.ajustes.pop());
      this.upsert(this.classif, [a.competicao, a.epoca, a.clube].join("\u0000"), linhaVazia).ajuste += a.pontos;
    });
  }

  reconstruirDerivadas(): void {
    this.transacao(() => {
      const classifAntes = this.classif;
      const statsAntes = this.stats;
      this.desfazer(() => ((this.classif = classifAntes), (this.stats = statsAntes)));
      this.classif = new Map();
      this.stats = new Map();
      for (const r of this.jogos.values()) this.aplicarJogo(r.jogo, r.factos, r.part);
      for (const a of this.ajustes) this.upsert(this.classif, [a.competicao, a.epoca, a.clube].join("\u0000"), linhaVazia).ajuste += a.pontos;
    });
  }

  // ---------- conhecimento
  acrescentarObservacao(o: ObservacaoNova): number {
    const id = this.obs.length + 1;
    this.obs.push({ ...clone(o), id });
    this.desfazer(() => this.obs.pop());
    return id;
  }

  observacoes(observador: string, alvo: Pick<EntidadeRef, "k" | "id">, grupo?: string): Observacao[] {
    return this.obs
      .filter((o) => o.observador === observador && o.alvoK === alvo.k && o.alvoId === alvo.id && (grupo === undefined || o.grupo === grupo))
      .reverse()
      .map((o) => clone(o));
  }
}
