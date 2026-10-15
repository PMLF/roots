import { describe, expect, it } from "vitest";
import { PARAMETROS_PADRAO as P, validarParametros } from "../config/parametros";
import type { LinhaClassificacao } from "../persistencia/tipos";
import { ordenarClassificacao, type ContextoClassificacao, type JogoResultado } from "./classificacao";

const ctx: ContextoClassificacao = { pontosVitoria: 3, pontosEmpate: 1, seed: "s", competicao: "PL", epoca: 1 };
const j = (casa: string, fora: string, golosCasa: number, golosFora: number): JogoResultado => ({ casa, fora, golosCasa, golosFora });

/** Constrói as linhas a partir dos jogos (como faz a derivada do repositório). */
function linhas(jogos: JogoResultado[], ajustes: Record<string, number> = {}): LinhaClassificacao[] {
  const m = new Map<string, LinhaClassificacao>();
  const l = (c: string) => m.get(c) ?? m.set(c, { clube: c, jogos: 0, vitorias: 0, empates: 0, derrotas: 0, golosMarcados: 0, golosSofridos: 0, pontosJogos: 0, ajuste: ajustes[c] ?? 0, pontos: 0 }).get(c)!;
  for (const x of jogos) {
    const a = l(x.casa), b = l(x.fora);
    a.jogos++; b.jogos++;
    a.golosMarcados += x.golosCasa; a.golosSofridos += x.golosFora;
    b.golosMarcados += x.golosFora; b.golosSofridos += x.golosCasa;
    if (x.golosCasa > x.golosFora) { a.vitorias++; b.derrotas++; a.pontosJogos += 3; }
    else if (x.golosCasa < x.golosFora) { b.vitorias++; a.derrotas++; b.pontosJogos += 3; }
    else { a.empates++; b.empates++; a.pontosJogos++; b.pontosJogos++; }
  }
  for (const v of m.values()) v.pontos = v.pontosJogos + v.ajuste;
  return [...m.values()];
}
const ordem = (js: JogoResultado[], crit = P.desempate.liga, extra: Partial<ContextoClassificacao> = {}, ajustes: Record<string, number> = {}) =>
  ordenarClassificacao(linhas(js, ajustes), js, crit, { ...ctx, ...extra }).map((l) => l.clube);

describe("classificação e desempates", () => {
  it("os parâmetros de desempate são válidos", () => {
    expect(validarParametros(P)).toEqual([]);
    expect(validarParametros({ ...P, desempate: { ...P.desempate, liga: ["diferenca", "pontos"] } })).not.toEqual([]);
    expect(validarParametros({ ...P, desempate: { ...P.desempate, liga: ["pontos", "diferenca"] } })).not.toEqual([]); // sem desempate final
  });

  it("ordena por pontos; posições 1..n", () => {
    const js = [j("A", "B", 1, 0), j("B", "C", 2, 0), j("C", "A", 0, 3)];
    const t = ordenarClassificacao(linhas(js), js, P.desempate.liga, ctx);
    expect(t.map((l) => l.clube)).toEqual(["A", "B", "C"]);
    expect(t.map((l) => l.posicao)).toEqual([1, 2, 3]);
    expect(t[0]?.diferenca).toBe(4);
    expect(t.every((l) => l.desempatePor === undefined)).toBe(true);
  });

  it("os ajustes (sanções) contam nos pontos", () => {
    const js = [j("A", "B", 1, 0), j("B", "C", 2, 0), j("C", "A", 0, 3)];
    expect(ordem(js, P.desempate.liga, {}, { A: -4 })).toEqual(["B", "A", "C"]);
  });

  it("confronto direto antes da diferença de golos", () => {
    // A e B terminam com 3 pontos; B tem melhor diferença de golos, mas A ganhou o jogo entre os dois
    const js = [j("A", "B", 1, 0), j("Z", "A", 1, 0), j("B", "Y", 5, 0), j("Z", "Q", 1, 0)];
    const t = ordenarClassificacao(linhas(js), js, P.desempate.liga, ctx);
    const A = t.find((l) => l.clube === "A")!, B = t.find((l) => l.clube === "B")!;
    expect(A.pontos).toBe(B.pontos);
    expect(B.diferenca).toBeGreaterThan(A.diferenca);
    expect(t.findIndex((l) => l.clube === "A")).toBeLessThan(t.findIndex((l) => l.clube === "B"));
    expect(A.desempatePor).toBe("confrontoDireto");
    // sem confronto direto na lista, ganha a diferença
    expect(ordem(js, ["pontos", "diferenca", "golosMarcados", "sorteio"]).indexOf("B")).toBeLessThan(ordem(js, ["pontos", "diferenca", "golosMarcados", "sorteio"]).indexOf("A"));
  });

  it("de três empatados, o confronto direto reaplica-se aos que continuam empatados", () => {
    // mini-liga A, B, C, todos com 3 pontos entre si (A>B, B>C, C>A); mas com diferenças de golos entre si
    // A 2-0 B, B 1-0 C, C 1-0 A → A: 3 pts dif +1; B: 3 pts dif -1; C: 3 pts dif 0 → A, C, B
    const js = [j("A", "B", 2, 0), j("B", "C", 1, 0), j("C", "A", 1, 0)];
    expect(ordem(js)).toEqual(["A", "C", "B"]);
    // mini-liga em que um fica à frente e os outros dois se medem só entre si
    // D bate E, F e E empatam; D 1-0 E, D 1-0 F, E 2-1 F, mas F-D e E-D ... usar jogo de ida e volta
    const js2 = [j("D", "E", 1, 0), j("D", "F", 1, 0), j("E", "D", 0, 0), j("F", "D", 0, 0), j("E", "F", 3, 0), j("F", "E", 1, 0)];
    const t = ordem(js2);
    expect(t[0]).toBe("D");
  });

  it("empate total em golos e pontos entre os dois: diferença global, golos marcados, vitórias, depois sorteio estável", () => {
    // A e B com o mesmo registo exato em tudo, sem jogos entre si
    const js = [j("A", "X", 1, 0), j("B", "Y", 1, 0)];
    const a = ordem(js, ["pontos", "confrontoDireto", "diferenca", "golosMarcados", "vitorias", "sorteio"]);
    expect(a.slice(0, 2).sort()).toEqual(["A", "B"]);
    // estável
    expect(ordem(js, ["pontos", "confrontoDireto", "diferenca", "golosMarcados", "vitorias", "sorteio"])).toEqual(a);
    // outra seed, pode mudar; e ao longo de várias seeds os dois ficam à frente do outro vezes semelhantes
    let aFrente = 0;
    for (let i = 0; i < 400; i++) if (ordem(js, ["pontos", "sorteio"], { seed: `s${i}` }).indexOf("A") < ordem(js, ["pontos", "sorteio"], { seed: `s${i}` }).indexOf("B")) aFrente++;
    expect(aFrente).toBeGreaterThan(140);
    expect(aFrente).toBeLessThan(260);
  });

  it("promoção: em empate total ganha o clube de menor reputação", () => {
    const js = [j("A", "X", 1, 0), j("B", "Y", 1, 0)];
    const reputacao = new Map([["A", 5000], ["B", 3000], ["X", 1], ["Y", 1]]);
    const t = ordenarClassificacao(linhas(js), js, P.desempate.promocao, { ...ctx, reputacao });
    expect(t.map((l) => l.clube).slice(0, 2)).toEqual(["B", "A"]);
    expect(t[0]?.desempatePor).toBe("reputacaoMenor");
    expect(ordenarClassificacao(linhas(js), js, P.desempate.promocao, { ...ctx, reputacao: new Map([["A", 100], ["B", 900]]) }).map((l) => l.clube).slice(0, 2)).toEqual(["A", "B"]);
  });

  it("clubes que ainda não jogaram entram a zeros, e o desempate de começo de época é estável", () => {
    const t = ordenarClassificacao([], [], P.desempate.liga, { ...ctx, clubes: ["C", "A", "B"] });
    expect(t).toHaveLength(3);
    expect(t.every((l) => l.pontos === 0 && l.jogos === 0)).toBe(true);
    expect(t.map((l) => l.posicao)).toEqual([1, 2, 3]);
    expect(ordenarClassificacao([], [], P.desempate.liga, { ...ctx, clubes: ["B", "C", "A"] }).map((l) => l.clube)).toEqual(t.map((l) => l.clube));
  });

  it("invariantes: com jogos aleatórios, a tabela é uma permutação, ordenada por pontos, e não depende da ordem de entrada", () => {
    const clubes = ["A", "B", "C", "D", "E", "F"];
    for (let k = 0; k < 40; k++) {
      let x = k * 7919 + 13;
      const rnd = () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648;
      const js: JogoResultado[] = [];
      for (const a of clubes) for (const b of clubes) if (a !== b) js.push(j(a, b, Math.floor(rnd() * 3), Math.floor(rnd() * 3)));
      const t = ordenarClassificacao(linhas(js), js, P.desempate.liga, ctx);
      expect(t.map((l) => l.clube).sort()).toEqual(clubes);
      for (let i = 1; i < t.length; i++) expect(t[i - 1]!.pontos).toBeGreaterThanOrEqual(t[i]!.pontos);
      const baralhado = [...js].reverse();
      expect(ordenarClassificacao([...linhas(baralhado)].reverse(), baralhado, P.desempate.liga, ctx).map((l) => l.clube)).toEqual(t.map((l) => l.clube));
    }
  });
});
