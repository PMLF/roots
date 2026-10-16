import { describe, expect, it } from "vitest";
import { Rng, clamp } from "./rng";

const swatch = (r: Rng, n: number, f: (r: Rng) => number) => Array.from({ length: n }, () => f(r));
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const deviation = (xs: number[]) => Math.sqrt(mean(xs.map((x) => (x - mean(xs)) ** 2)));

describe("Rng", () => {
  it("é determinístico para a mesma seed e diferente para outra", () => {
    expect(swatch(new Rng("a"), 5, (r) => r.float())).toEqual(swatch(new Rng("a"), 5, (r) => r.float()));
    expect(swatch(new Rng("a"), 5, (r) => r.float())).not.toEqual(swatch(new Rng("b"), 5, (r) => r.float()));
  });

  it("derivar dá fluxos estáveis e independentes da ordem de consumo", () => {
    const r1 = new Rng("world");
    const a1 = r1.derive("clube:A").float();
    const b1 = r1.derive("clube:B").float();
    const r2 = new Rng("world");
    r2.float();
    r2.float(); // consumir o fluxo principal não muda os derivados
    const b2 = r2.derive("clube:B").float();
    const a2 = r2.derive("clube:A").float();
    expect([a1, b1]).toEqual([a2, b2]);
    expect(a1).not.toBe(b1);
  });

  it("float em [0,1) e inteiro dentro dos limites com todos os valores a sair", () => {
    const r = new Rng("x");
    const fs = swatch(r, 5000, (q) => q.float());
    expect(Math.min(...fs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...fs)).toBeLessThan(1);
    const is = new Set(swatch(r, 2000, (q) => q.integer(3, 6)));
    expect([...is].sort()).toEqual([3, 4, 5, 6]);
  });

  it("gauss tem a média e o desvio pedidos", () => {
    const xs = swatch(new Rng("g"), 20000, (r) => r.gauss(10, 3));
    expect(mean(xs)).toBeCloseTo(10, 1);
    expect(deviation(xs)).toBeCloseTo(3, 1);
  });

  it("prob e ponderado respeitam as frequências", () => {
    const r = new Rng("p");
    const n = 20000;
    expect(swatch(r, n, (q) => (q.prob(0.25) ? 1 : 0)).reduce((a, b) => a + b, 0) / n).toBeCloseTo(0.25, 1);
    const count = { a: 0, b: 0, c: 0 };
    for (let i = 0; i < n; i++) count[r.weighted(["a", "b", "c"] as const, (x) => ({ a: 1, b: 3, c: 0 })[x])]++;
    expect(count.c).toBe(0);
    expect(count.b / count.a).toBeGreaterThan(2.6);
    expect(count.b / count.a).toBeLessThan(3.4);
  });

  it("baralhar é uma permutação e pareto ≥ 1", () => {
    const r = new Rng("b");
    const xs = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(r.shuffle(xs).sort()).toEqual(xs);
    expect(Math.min(...swatch(r, 2000, (q) => q.pareto(2)))).toBeGreaterThanOrEqual(1);
  });

  it("recusa listas vazias e pesos nulos; limitar", () => {
    expect(() => new Rng("e").choose([])).toThrow();
    expect(() => new Rng("e").weighted([1], () => 0)).toThrow();
    expect(clamp(25, 1, 20)).toBe(20);
  });
});
