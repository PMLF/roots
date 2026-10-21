/**
 * Curvas de talento por país com cauda rara (RZ-132, MODELO_DADOS §15).
 * Qualidade de um jogador do país: N(μ(índice), σ) + (com prob. ε) escala × (Pareto − 1).
 * ε nunca é zero: qualquer país pode produzir um craque, mas a probabilidade difere muito.
 */
import type { Rng } from "../random/rng";
import { clamp } from "../random/rng";
import type { Params } from "../config/parameters";
import { tailProb, type Country } from "./countries";

type T = Params["world"]["talent"];

const mu = (country: Country, t: T): number => t.muIndex0 + (t.muIndex100 - t.muIndex0) * clamp(country.index / 100, 0, 1);

/** Qualidade (1-20, contínua) de um jogador nascido no país. */
export function sampleQuality(rng: Rng, country: Country, t: T): number {
  let q = rng.gauss(mu(country, t), t.sigma);
  if (rng.prob(tailProb(country, t))) q += t.scalePareto * (rng.pareto(t.alphaPareto) - 1);
  return clamp(q, 1, 20);
}

const STEP = 0.5;
const N = 39; // q = 1, 1.5 … 20
const gaussPdf = (x: number, m: number, s: number) => Math.exp(-0.5 * ((x - m) / s) ** 2) / (s * Math.sqrt(2 * Math.PI));

/**
 * Densidade da qualidade `q` para um país (tabela de 39 pontos, passo 0,5).
 * Mistura: (1−ε)·N(μ, σ) + ε·convolução de N(μ, σ) com a cauda de Pareto (integração numérica).
 */
export function densityTable(country: Country, t: T): Float64Array {
  const m = mu(country, t);
  const seasons = tailProb(country, t);
  const out = new Float64Array(N);
  // cauda: s = escala·(pareto−1) tem densidade (α/escala)·(1 + s/escala)^(−α−1)
  const ss = Array.from({ length: 160 }, (_, i) => (i + 0.5) * 0.25);
  const sWeight = ss.map((s) => (t.alphaPareto / t.scalePareto) * (1 + s / t.scalePareto) ** (-t.alphaPareto - 1) * 0.25);
  const sum = sWeight.reduce((a, b) => a + b, 0) || 1;
  for (let i = 0; i < N; i++) {
    const q = 1 + i * STEP;
    const base = gaussPdf(q, m, t.sigma);
    let tail = 0;
    for (let k = 0; k < ss.length; k++) tail += gaussPdf(q, m + (ss[k] as number), t.sigma) * ((sWeight[k] as number) / sum);
    out[i] = (1 - seasons) * base + seasons * tail;
  }
  return out;
}

export const densityIn = (table: Float64Array, q: number): number => table[Math.round((clamp(q, 1, 20) - 1) / STEP)] as number;
