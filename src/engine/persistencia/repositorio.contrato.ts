/**
 * Bateria de testes comum a todos os adaptadores de `Repositorio` (RZ-128).
 * Cada adaptador chama `contratoRepositorio(nome, criar)` no seu ficheiro de testes.
 */
import { describe, expect, it } from "vitest";
import type { Repositorio } from "./repositorio";
import type { EventoNovo, JogoFacto, JogoNovo, LoteMundoReg, Participacao } from "./tipos";

export const ev = (tipo: string, extra: Partial<EventoNovo> = {}): EventoNovo => ({
  tipo,
  data: "2026-08-15",
  epoca: 1,
  vis: "publico",
  entidades: [],
  dados: {},
  ...extra,
});

export type GolosEmJogo = { casa: string; fora: string; golosCasa: number; golosFora: number };

/** Um jogo coerente: golos distribuídos por marcadores fixos do plantel `<clube>-1..11`. */
export function jogoSintetico(
  id: string,
  g: GolosEmJogo & { competicao?: string; epoca?: number; jornada?: number; data?: string },
  opcoes: { autoGolo?: boolean; cartoes?: boolean } = {},
): { jogo: JogoNovo; factos: JogoFacto[]; part: Participacao[] } {
  const factos: JogoFacto[] = [];
  for (let i = 0; i < g.golosCasa; i++) factos.push({ minuto: 10 + i * 20, tipo: "G", jogador: `${g.casa}-${(i % 3) + 9}`, clube: g.casa });
  for (let i = 0; i < g.golosFora; i++) factos.push({ minuto: 15 + i * 20, tipo: "G", jogador: `${g.fora}-${(i % 3) + 9}`, clube: g.fora });
  if (g.golosCasa > 0) factos.push({ minuto: 10, tipo: "A", jogador: `${g.casa}-8`, clube: g.casa });
  if (opcoes.autoGolo && g.golosFora > 0) {
    const i = factos.findIndex((f) => f.tipo === "G" && f.clube === g.fora);
    factos[i] = { minuto: 15, tipo: "G", jogador: `${g.casa}-3`, clube: g.fora, extra: "auto" };
  }
  if (opcoes.cartoes) {
    factos.push({ minuto: 33, tipo: "CA", jogador: `${g.casa}-4`, clube: g.casa });
    factos.push({ minuto: 70, tipo: "CV", jogador: `${g.fora}-5`, clube: g.fora });
  }
  const part: Participacao[] = [];
  for (const c of [g.casa, g.fora]) for (let n = 1; n <= 11; n++) part.push({ jogador: `${c}-${n}`, clube: c, titular: true, minutos: n === 5 && c === g.fora && opcoes.cartoes ? 70 : 90 });
  part.push({ jogador: `${g.casa}-12`, clube: g.casa, titular: false, minutos: 0 });
  return {
    jogo: {
      id, competicao: g.competicao ?? "PL", epoca: g.epoca ?? 1, jornada: g.jornada ?? 1, data: g.data ?? "2026-08-16",
      casa: g.casa, fora: g.fora, golosCasa: g.golosCasa, golosFora: g.golosFora,
    },
    factos,
    part,
  };
}

export function contratoRepositorio(nome: string, criar: () => Repositorio): void {
  describe(`Repositorio (${nome}): eventos`, () => {
    it("guarda e devolve um evento com entidades por ordem estável", () => {
      const r = criar();
      const id = r.acrescentarEvento(
        ev("TRANSFERENCIA", {
          jornada: 3, v: 2, vis: "privado", origem: "gerado",
          entidades: [{ k: "pessoa", id: "p1", papel: "jogador" }, { k: "clube", id: "c2", papel: "destino" }, { k: "clube", id: "c1" }],
          dados: { valor: 120000, clausulas: ["bónus", { x: 1 }] },
        }),
      );
      expect(id).toBe(1);
      expect(r.evento(1)).toEqual({
        id: 1, tipo: "TRANSFERENCIA", v: 2, data: "2026-08-15", epoca: 1, jornada: 3, vis: "privado", origem: "gerado",
        entidades: [{ k: "clube", id: "c1" }, { k: "clube", id: "c2", papel: "destino" }, { k: "pessoa", id: "p1", papel: "jogador" }],
        dados: { valor: 120000, clausulas: ["bónus", { x: 1 }] },
      });
      expect(r.evento(99)).toBeUndefined();
    });

    it("ids sequenciais e eventosDe devolve os mais recentes primeiro, com filtros", () => {
      const r = criar();
      const c = { k: "clube" as const, id: "c1" };
      r.acrescentarEvento(ev("SUBIDA", { epoca: 1, entidades: [c] }));
      r.acrescentarEvento(ev("LESAO", { epoca: 2, vis: "privado", entidades: [c] }));
      r.acrescentarEvento(ev("SUBIDA", { epoca: 3, entidades: [c] }));
      r.acrescentarEvento(ev("SUBIDA", { epoca: 3, entidades: [{ k: "clube", id: "c9" }] }));
      expect(r.eventosDe(c).map((e) => e.id)).toEqual([3, 2, 1]);
      expect(r.eventosDe(c, { apenasPublicos: true }).map((e) => e.id)).toEqual([3, 1]);
      expect(r.eventosDe(c, { vis: ["privado", "secreto"] }).map((e) => e.id)).toEqual([2]);
      expect(r.eventosDe(c, { vis: [] })).toEqual([]);
      expect(r.eventosDe(c, { tipo: "SUBIDA", limite: 1 }).map((e) => e.id)).toEqual([3]);
      expect(r.eventosDe(c, { desdeEpoca: 2, ateEpoca: 2 }).map((e) => e.id)).toEqual([2]);
      expect(r.eventosDe({ k: "clube", id: "ninguem" })).toEqual([]);
      expect(r.totalEventos()).toBe(4);
    });

    it("contar, ultimo e ultimos", () => {
      const r = criar();
      const c = { k: "clube" as const, id: "c1" };
      for (const epoca of [1, 4, 9]) r.acrescentarEvento(ev("SUBIDA", { epoca, entidades: [c] }));
      r.acrescentarEvento(ev("SUBIDA", { epoca: 2, entidades: [{ k: "clube", id: "c2" }] }));
      expect(r.contar("SUBIDA")).toBe(4);
      expect(r.contar("SUBIDA", c)).toBe(3);
      expect(r.contar("SUBIDA", c, { desdeEpoca: 2, ateEpoca: 8 })).toBe(1);
      expect(r.contar("DESCIDA", c)).toBe(0);
      expect(r.ultimo("SUBIDA", c)?.epoca).toBe(9);
      expect(r.ultimos("SUBIDA", c, 2).map((e) => e.epoca)).toEqual([9, 4]);
      expect(r.ultimo("DESCIDA", c)).toBeUndefined();
    });

    it("cadeia devolve causas e efeitos por ordem", () => {
      const r = criar();
      const a = r.acrescentarEvento(ev("PROMESSA_FEITA"));
      const b = r.acrescentarEvento(ev("PROMESSA_FALHADA", { causa: a }));
      const x = r.acrescentarEvento(ev("OUTRO"));
      const c = r.acrescentarEvento(ev("PEDIDO_SAIDA", { causa: b }));
      const d = r.acrescentarEvento(ev("TRANSFERENCIA", { causa: c }));
      const lateral = r.acrescentarEvento(ev("QUEIXA", { causa: a }));
      expect(r.cadeia(c).map((e) => e.id)).toEqual([a, b, c, d]);
      expect(r.cadeia(a).map((e) => e.id)).toEqual([a, b, c, d, lateral]);
      expect(r.cadeia(x).map((e) => e.id)).toEqual([x]);
      expect(r.cadeia(999)).toEqual([]);
    });

    it("rejeita eventos inválidos sem deixar rasto", () => {
      const r = criar();
      expect(() => r.acrescentarEvento(ev("X", { data: "15/08/2026" }))).toThrow(/data inválida/);
      expect(() => r.acrescentarEvento(ev("X", { corrige: 1 }))).toThrow(/CORRECAO/);
      expect(() => r.acrescentarEvento(ev("CORRECAO"))).toThrow(/exige/);
      expect(() => r.acrescentarEvento(ev("X", { causa: 42 }))).toThrow();
      expect(() => r.acrescentarEvento(ev("X", { entidades: [{ k: "clube", id: "a" }, { k: "clube", id: "a" }] }))).toThrow(/repetida/);
      expect(r.contar("X")).toBe(0);
      expect(r.acrescentarEvento(ev("OK"))).toBe(1); // nenhum id foi consumido
    });

    it("CORRECAO liga ao evento corrigido sem o alterar", () => {
      const r = criar();
      const a = r.acrescentarEvento(ev("RESULTADO", { dados: { golos: 2 } }));
      const c = r.acrescentarEvento(ev("CORRECAO", { corrige: a, dados: { golos: 3 } }));
      expect(r.evento(a)?.dados).toEqual({ golos: 2 });
      expect(r.evento(c)?.corrige).toBe(a);
    });

    it("exporta NDJSON, uma linha por evento, por ordem de id", () => {
      const r = criar();
      expect(r.exportarNdjson()).toBe("");
      r.acrescentarEvento(ev("A", { entidades: [{ k: "clube", id: "c1" }], dados: { n: 1 } }));
      r.acrescentarEvento(ev("B", { jornada: 2, causa: 1 }));
      const linhas = r.exportarNdjson().trimEnd().split("\n");
      expect(linhas).toHaveLength(2);
      expect(JSON.parse(linhas[1] as string)).toMatchObject({ id: 2, tipo: "B", jornada: 2, causa: 1 });
    });
  });

  describe(`Repositorio (${nome}): transações e meta`, () => {
    it("desfaz tudo quando a transação falha, incluindo transações internas", () => {
      const r = criar();
      r.acrescentarEvento(ev("ANTES"));
      expect(() =>
        r.transacao(() => {
          r.acrescentarEvento(ev("DENTRO", { entidades: [{ k: "clube", id: "c1" }] }));
          r.transacao(() => r.acrescentarEvento(ev("INTERNA")));
          r.definirMeta("x", "1");
          throw new Error("falhou");
        }),
      ).toThrow("falhou");
      expect(r.contar("DENTRO")).toBe(0);
      expect(r.contar("INTERNA")).toBe(0);
      expect(r.meta("x")).toBeUndefined();
      expect(r.eventosDe({ k: "clube", id: "c1" })).toEqual([]);
      expect(r.acrescentarEvento(ev("DEPOIS"))).toBe(2);
    });

    it("uma transação interna que falha só desfaz o seu trabalho", () => {
      const r = criar();
      r.transacao(() => {
        r.acrescentarEvento(ev("FORA"));
        expect(() => r.transacao(() => (r.acrescentarEvento(ev("INTERNA")), (() => { throw new Error("x"); })()))).toThrow("x");
        r.acrescentarEvento(ev("FORA2"));
      });
      expect(r.contar("FORA")).toBe(1);
      expect(r.contar("FORA2")).toBe(1);
      expect(r.contar("INTERNA")).toBe(0);
    });

    it("meta guarda e substitui valores", () => {
      const r = criar();
      expect(r.meta("seed")).toBeUndefined();
      r.definirMeta("seed", "abc");
      r.definirMeta("seed", "def");
      expect(r.meta("seed")).toBe("def");
    });
  });

  describe(`Repositorio (${nome}): jogos e derivadas`, () => {
    it("regista o jogo, o evento JOGO_JOGADO e atualiza classificação e estatísticas", () => {
      const r = criar();
      const j = jogoSintetico("j1", { casa: "A", fora: "B", golosCasa: 2, golosFora: 1 }, { cartoes: true });
      const { evento } = r.registarJogo(j.jogo, j.factos, j.part);
      expect(r.evento(evento)).toMatchObject({ tipo: "JOGO_JOGADO", vis: "publico", jornada: 1, dados: { golosCasa: 2, golosFora: 1 } });
      expect(r.eventosDe({ k: "clube", id: "B" }).map((e) => e.tipo)).toEqual(["JOGO_JOGADO"]);
      expect(r.jogo("j1")).toMatchObject({ casa: "A", golosCasa: 2, evento });
      expect(r.classificacao("PL", 1)).toEqual([
        { clube: "A", jogos: 1, vitorias: 1, empates: 0, derrotas: 0, golosMarcados: 2, golosSofridos: 1, pontosJogos: 3, ajuste: 0, pontos: 3 },
        { clube: "B", jogos: 1, vitorias: 0, empates: 0, derrotas: 1, golosMarcados: 1, golosSofridos: 2, pontosJogos: 0, ajuste: 0, pontos: 0 },
      ]);
      expect(r.statsJogador("A-9")).toEqual([{ jogador: "A-9", epoca: 1, clube: "A", competicao: "PL", jogos: 1, minutos: 90, golos: 1, assistencias: 0, amarelos: 0, vermelhos: 0 }]);
      expect(r.statsJogador("A-8")[0]).toMatchObject({ assistencias: 1 });
      expect(r.statsJogador("A-4")[0]).toMatchObject({ amarelos: 1 });
      expect(r.statsJogador("B-5")[0]).toMatchObject({ vermelhos: 1, minutos: 70 });
      expect(r.statsJogador("A-12")[0]).toMatchObject({ jogos: 0, minutos: 0 }); // suplente não utilizado
    });

    it("auto-golo conta para o resultado mas não para o marcador", () => {
      const r = criar();
      const j = jogoSintetico("j1", { casa: "A", fora: "B", golosCasa: 0, golosFora: 1 }, { autoGolo: true });
      r.registarJogo(j.jogo, j.factos, j.part);
      expect(r.classificacao("PL", 1)[0]?.clube).toBe("B");
      expect(r.statsJogador("A-3")[0]?.golos).toBe(0);
      expect(r.marcadores("PL", 1, 1)).toEqual([{ jogador: "A-3", clube: "B", minuto: 15, jogo: "j1" }]);
    });

    it("desempata a classificação por pontos, diferença e golos marcados", () => {
      const r = criar();
      const g = (id: string, casa: string, fora: string, a: number, b: number, jornada: number) => {
        const j = jogoSintetico(id, { casa, fora, golosCasa: a, golosFora: b, jornada });
        r.registarJogo(j.jogo, j.factos, j.part);
      };
      g("1", "A", "B", 1, 0, 1); // A: 3 pts, dif +1, 1 golo
      g("2", "C", "D", 3, 2, 1); // C: 3 pts, dif +1, 3 golos → à frente do A
      g("3", "B", "D", 1, 1, 2); // B e D: 1 pt, dif -1; D marcou mais golos
      expect(r.classificacao("PL", 1).map((l) => l.clube)).toEqual(["C", "A", "D", "B"]);
    });

    it("marcadores de uma jornada por data, jogo e minuto", () => {
      const r = criar();
      const a = jogoSintetico("jb", { casa: "C", fora: "D", golosCasa: 1, golosFora: 1, data: "2026-08-17" });
      const b = jogoSintetico("ja", { casa: "A", fora: "B", golosCasa: 2, golosFora: 0, data: "2026-08-16" });
      r.registarJogo(a.jogo, a.factos, a.part);
      r.registarJogo(b.jogo, b.factos, b.part);
      expect(r.marcadores("PL", 1, 1).map((m) => `${m.jogo}:${m.minuto}`)).toEqual(["ja:10", "ja:30", "jb:10", "jb:15"]);
      expect(r.marcadores("PL", 1, 2)).toEqual([]);
    });

    it("recusa jogos incoerentes ou repetidos sem deixar rasto", () => {
      const r = criar();
      const j = jogoSintetico("j1", { casa: "A", fora: "B", golosCasa: 1, golosFora: 0 });
      expect(() => r.registarJogo({ ...j.jogo, golosCasa: 2 }, j.factos, j.part)).toThrow(/não batem/);
      expect(() => r.registarJogo(j.jogo, j.factos, [...j.part, j.part[0] as Participacao])).toThrow(/repetido/);
      expect(r.jogo("j1")).toBeUndefined();
      expect(r.contar("JOGO_JOGADO")).toBe(0);
      r.registarJogo(j.jogo, j.factos, j.part);
      expect(() => r.registarJogo(j.jogo, j.factos, j.part)).toThrow(/já existe/);
      expect(r.contar("JOGO_JOGADO")).toBe(1);
      expect(r.classificacao("PL", 1).find((l) => l.clube === "A")?.jogos).toBe(1);
    });

    it("sanção retroativa ajusta a classificação passada sem reescrever jogos nem eventos", () => {
      const r = criar();
      const j1 = jogoSintetico("j1", { casa: "A", fora: "B", golosCasa: 1, golosFora: 0, epoca: 3 });
      r.registarJogo(j1.jogo, j1.factos, j1.part);
      const jogosAntes = JSON.stringify(r.jogo("j1"));
      const eventosAntes = r.exportarNdjson();
      const sancao = r.acrescentarEvento(ev("SANCAO_APLICADA", { epoca: 5, vis: "publico", entidades: [{ k: "clube", id: "A" }] }));
      r.ajustarClassificacao({ competicao: "PL", epoca: 3, clube: "A", pontos: -6, evento: sancao });
      r.ajustarClassificacao({ competicao: "PL", epoca: 3, clube: "Z", pontos: -1, evento: sancao }); // clube sem jogos
      const t = r.classificacao("PL", 3);
      expect(t.map((l) => [l.clube, l.pontosJogos, l.ajuste, l.pontos])).toEqual([["B", 0, 0, 0], ["Z", 0, -1, -1], ["A", 3, -6, -3]]);
      expect(JSON.stringify(r.jogo("j1"))).toBe(jogosAntes);
      expect(r.exportarNdjson().startsWith(eventosAntes)).toBe(true);
      r.reconstruirDerivadas();
      expect(r.classificacao("PL", 3)).toEqual(t);
      expect(() => r.ajustarClassificacao({ competicao: "PL", epoca: 3, clube: "A", pontos: 1, evento: 999 })).toThrow();
    });

    it("reconstruir as derivadas dá exatamente o que o incremental calculou", () => {
      const r = criar();
      let n = 0;
      for (let epoca = 1; epoca <= 3; epoca++)
        for (let jornada = 1; jornada <= 6; jornada++)
          for (const [casa, fora] of [["A", "B"], ["C", "D"]] as const) {
            n++;
            const j = jogoSintetico(`j${n}`, { casa: jornada % 2 ? casa : fora, fora: jornada % 2 ? fora : casa, golosCasa: n % 4, golosFora: (n * 7) % 3, epoca, jornada, competicao: epoca === 2 ? "SL" : "PL" }, { cartoes: n % 2 === 0, autoGolo: n % 5 === 0 });
            r.registarJogo(j.jogo, j.factos, j.part);
          }
      const antes = [1, 2, 3].flatMap((e) => [r.classificacao("PL", e), r.classificacao("SL", e)]).concat(
        ["A", "B", "C", "D"].flatMap((c) => [1, 2, 3, 4, 5, 8, 9, 11, 12].map((p) => r.statsJogador(`${c}-${p}`))) as never,
      );
      r.reconstruirDerivadas();
      const depois = [1, 2, 3].flatMap((e) => [r.classificacao("PL", e), r.classificacao("SL", e)]).concat(
        ["A", "B", "C", "D"].flatMap((c) => [1, 2, 3, 4, 5, 8, 9, 11, 12].map((p) => r.statsJogador(`${c}-${p}`))) as never,
      );
      expect(depois).toEqual(antes);
      expect(antes.flat().length).toBeGreaterThan(50);
    });

    it("respeita os pontos por resultado configurados", () => {
      // o adaptador criado por `criar` usa 3/1; aqui só confirmamos o valor por omissão
      const r = criar();
      const j = jogoSintetico("e", { casa: "A", fora: "B", golosCasa: 0, golosFora: 0 });
      r.registarJogo(j.jogo, j.factos, j.part);
      expect(r.classificacao("PL", 1).map((l) => l.pontos)).toEqual([1, 1]);
    });
  });

  describe(`Repositorio (${nome}): observações`, () => {
    it("guarda observações e devolve as mais recentes primeiro", () => {
      const r = criar();
      const base = { observador: "c1", alvoK: "pessoa" as const, alvoId: "p1", fonte: "olheiro", data: "2026-09-01", epoca: 1, qualidade: 0.6 };
      r.acrescentarObservacao({ ...base, grupo: "atributos", valores: { finalizacao: [10, 14] } });
      r.acrescentarObservacao({ ...base, grupo: "personalidade", valores: { rotulos: ["Leal"] } });
      r.acrescentarObservacao({ ...base, grupo: "atributos", valores: { finalizacao: [12, 13] }, data: "2026-10-01" });
      r.acrescentarObservacao({ ...base, observador: "c2", grupo: "atributos", valores: {} });
      expect(r.observacoes("c1", { k: "pessoa", id: "p1" }).map((o) => o.id)).toEqual([3, 2, 1]);
      expect(r.observacoes("c1", { k: "pessoa", id: "p1" }, "atributos")[0]?.valores).toEqual({ finalizacao: [12, 13] });
      expect(r.observacoes("c3", { k: "pessoa", id: "p1" })).toEqual([]);
    });
  });

  describe(`Repositorio (${nome}): calendário`, () => {
    const j = (id: string, jornada: number, data: string, casa: string, fora: string) => ({ id, competicao: "SL", epoca: 1, jornada, data, casa, fora });
    const jogos = [j("a", 1, "2026-08-22", "X", "Y"), j("b", 1, "2026-08-23", "Z", "W"), j("c", 2, "2026-08-29", "Y", "Z")];

    it("guarda e consulta por liga, por clube e próximo jogo", () => {
      const r = criar();
      r.guardarCalendario(jogos, [{ competicao: "SL", epoca: 1, jornada: 2, clube: "X" }]);
      const c = r.calendario("SL", 1);
      expect(c.jogos.map((x) => x.id)).toEqual(["a", "b", "c"]);
      expect(c.folgas).toEqual([{ competicao: "SL", epoca: 1, jornada: 2, clube: "X" }]);
      expect(r.calendarioDoClube("Y", 1).map((x) => x.id)).toEqual(["a", "c"]);
      expect(r.proximoJogo("Y", "2026-08-24")?.id).toBe("c");
      expect(r.proximoJogo("Y", "2026-09-30")).toBeUndefined();
      expect(r.calendario("SL", 2)).toEqual({ jogos: [], folgas: [] });
    });
    it("recusa um segundo calendário da mesma liga e época, sem deixar lixo", () => {
      const r = criar();
      r.guardarCalendario(jogos, []);
      expect(() => r.guardarCalendario([j("d", 1, "2026-08-22", "X", "Y")], [])).toThrow();
      expect(r.calendario("SL", 1).jogos).toHaveLength(3);
    });
    it("é atómico: um id repetido desfaz tudo", () => {
      const r = criar();
      expect(() => r.guardarCalendario([j("q", 1, "2026-08-22", "X", "Y"), j("q", 2, "2026-08-29", "Y", "X")], [])).toThrow();
      expect(r.calendario("SL", 1).jogos).toEqual([]);
    });
  });

  describe(`Repositorio (${nome}): pessoas`, () => {
    const lote = (): LoteMundoReg => ({
      pessoas: [
        { id: "p1", nome: "João Pedro Silva", nomeDesportivo: "João Silva", nascimento: "2000-03-01", nacionalidade: "pt", naturalDe: "porto", papeis: ["jogador"], personalidade: { lealdade: 15, ambicao: 9 }, arquetipo: "lider", lod: 1 },
        { id: "p2", nome: "Ana Costa", nomeDesportivo: "Ana Costa", nascimento: "1975-05-05", nacionalidade: "pt", papeis: ["presidente"], personalidade: { lealdade: 10 }, arquetipo: "comum", lod: 2 },
        { id: "p3", nome: "Luca Rossi", nomeDesportivo: "Luca Rossi", nascimento: "1998-01-01", nacionalidade: "it", papeis: ["jogador"], personalidade: { lealdade: 5 }, arquetipo: "mercenario", lod: 2 },
      ],
      jogadores: [
        { pessoa: "p1", posicoes: [{ pos: "MC", aptidao: 20 }, { pos: "MDC", aptidao: 12 }], atributos: { passe: 14 }, potencial: 15.5, alturaCm: 180, pesoKg: 75, pe: "D", clube: "X", estado: "ativo" },
        { pessoa: "p3", posicoes: [{ pos: "PL", aptidao: 20 }], atributos: { finalizacao: 12 }, potencial: 12, alturaCm: 184, pesoKg: 80, pe: "E", estado: "livre" },
      ],
      contratos: [{ pessoa: "p1", clube: "X", salarioMensal: 1200, inicio: "2025-07-01", fim: "2028-06-30" }],
      cargos: [{ pessoa: "p2", funcao: "presidente", clube: "X", cidade: "porto" }],
    });

    it("guarda e devolve a verdade e os factos públicos", () => {
      const r = criar();
      r.guardarMundo(lote());
      expect(r.totalPessoas()).toBe(3);
      expect(r.pessoa("p1")?.personalidade).toEqual({ lealdade: 15, ambicao: 9 });
      expect(r.jogador("p1")?.potencial).toBe(15.5);
      expect(r.contrato("p1")?.salarioMensal).toBe(1200);
      expect(r.cargo("p2")?.funcao).toBe("presidente");
      expect(r.jogadoresDoClube("X").map((j) => j.pessoa)).toEqual(["p1"]);
      expect(r.pessoa("nada")).toBeUndefined();
    });
    it("a ficha pública não contém atributos, potencial nem personalidade", () => {
      const r = criar();
      r.guardarMundo(lote());
      const f = r.pessoaPublica("p1")!;
      expect(f).toMatchObject({ nomeDesportivo: "João Silva", clube: "X", naturalDe: "porto", jogador: { posicao: "MC", alturaCm: 180, pe: "D", estado: "ativo" } });
      const texto = JSON.stringify(f);
      for (const proibido of ["potencial", "atributos", "personalidade", "lealdade", "aptidao", "arquetipo", "salario"]) expect(texto).not.toContain(proibido);
      expect(r.pessoaPublica("p3")?.jogador?.estado).toBe("livre");
      expect(r.pessoaPublica("p2")).toMatchObject({ funcao: "presidente", clube: "X" });
    });
    it("plantel e cargos públicos", () => {
      const r = criar();
      r.guardarMundo(lote());
      expect(r.plantelPublico("X").map((p) => p.id)).toEqual(["p1"]);
      expect(r.cargosPublicos({ clube: "X" }).map((p) => p.id)).toEqual(["p2"]);
      expect(r.cargosPublicos({ cidade: "porto" }).map((p) => p.id)).toEqual(["p2"]);
      expect(r.cargosPublicos({})).toEqual([]);
    });
    it("recusa um segundo mundo e desfaz tudo se algo falhar", () => {
      const r = criar();
      r.guardarMundo(lote());
      expect(() => r.guardarMundo(lote())).toThrow();
      const r2 = criar();
      const mau = lote();
      mau.jogadores.push({ ...mau.jogadores[0]!, pessoa: "fantasma" });
      expect(() => r2.guardarMundo(mau)).toThrow();
      expect(r2.totalPessoas()).toBe(0);
    });
  });
}
