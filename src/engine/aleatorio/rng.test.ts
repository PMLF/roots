import { describe, expect, it } from "vitest";
import { Rng, limitar } from "./rng";

const amostra = (r: Rng, n: number, f: (r: Rng) => number) => Array.from({ length: n }, () => f(r));
const media = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const desvio = (xs: number[]) => Math.sqrt(media(xs.map((x) => (x - media(xs)) ** 2)));

describe("Rng", () => {
  it("é determinístico para a mesma seed e diferente para outra", () => {
    expect(amostra(new Rng("a"), 5, (r) => r.float())).toEqual(amostra(new Rng("a"), 5, (r) => r.float()));
    expect(amostra(new Rng("a"), 5, (r) => r.float())).not.toEqual(amostra(new Rng("b"), 5, (r) => r.float()));
  });

  it("derivar dá fluxos estáveis e independentes da ordem de consumo", () => {
    const r1 = new Rng("mundo");
    const a1 = r1.derivar("clube:A").float();
    const b1 = r1.derivar("clube:B").float();
    const r2 = new Rng("mundo");
    r2.float();
    r2.float(); // consumir o fluxo principal não muda os derivados
    const b2 = r2.derivar("clube:B").float();
    const a2 = r2.derivar("clube:A").float();
    expect([a1, b1]).toEqual([a2, b2]);
    expect(a1).not.toBe(b1);
  });

  it("float em [0,1) e inteiro dentro dos limites com todos os valores a sair", () => {
    const r = new Rng("x");
    const fs = amostra(r, 5000, (q) => q.float());
    expect(Math.min(...fs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...fs)).toBeLessThan(1);
    const is = new Set(amostra(r, 2000, (q) => q.inteiro(3, 6)));
    expect([...is].sort()).toEqual([3, 4, 5, 6]);
  });

  it("gauss tem a média e o desvio pedidos", () => {
    const xs = amostra(new Rng("g"), 20000, (r) => r.gauss(10, 3));
    expect(media(xs)).toBeCloseTo(10, 1);
    expect(desvio(xs)).toBeCloseTo(3, 1);
  });

  it("prob e ponderado respeitam as frequências", () => {
    const r = new Rng("p");
    const n = 20000;
    expect(amostra(r, n, (q) => (q.prob(0.25) ? 1 : 0)).reduce((a, b) => a + b, 0) / n).toBeCloseTo(0.25, 1);
    const contagem = { a: 0, b: 0, c: 0 };
    for (let i = 0; i < n; i++) contagem[r.ponderado(["a", "b", "c"] as const, (x) => ({ a: 1, b: 3, c: 0 })[x])]++;
    expect(contagem.c).toBe(0);
    expect(contagem.b / contagem.a).toBeGreaterThan(2.6);
    expect(contagem.b / contagem.a).toBeLessThan(3.4);
  });

  it("baralhar é uma permutação e pareto ≥ 1", () => {
    const r = new Rng("b");
    const xs = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(r.baralhar(xs).sort()).toEqual(xs);
    expect(Math.min(...amostra(r, 2000, (q) => q.pareto(2)))).toBeGreaterThanOrEqual(1);
  });

  it("recusa listas vazias e pesos nulos; limitar", () => {
    expect(() => new Rng("e").escolher([])).toThrow();
    expect(() => new Rng("e").ponderado([1], () => 0)).toThrow();
    expect(limitar(25, 1, 20)).toBe(20);
  });
});
