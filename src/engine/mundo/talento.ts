/**
 * Curvas de talento por país com cauda rara (RZ-132, MODELO_DADOS §15).
 * Qualidade de um jogador do país: N(μ(índice), σ) + (com prob. ε) escala × (Pareto − 1).
 * ε nunca é zero: qualquer país pode produzir um craque, mas a probabilidade difere muito.
 */
import type { Rng } from "../aleatorio/rng";
import { limitar } from "../aleatorio/rng";
import type { Parametros } from "../config/parametros";
import { probCauda, type Pais } from "./paises";

type T = Parametros["mundo"]["talento"];

export const mu = (pais: Pais, t: T): number => t.muIndice0 + (t.muIndice100 - t.muIndice0) * limitar(pais.indice / 100, 0, 1);

/** Qualidade (1-20, contínua) de um jogador nascido no país. */
export function amostrarQualidade(rng: Rng, pais: Pais, t: T): number {
  let q = rng.gauss(mu(pais, t), t.sigma);
  if (rng.prob(probCauda(pais, t))) q += t.paretoEscala * (rng.pareto(t.paretoAlfa) - 1);
  return limitar(q, 1, 20);
}

const PASSO = 0.5;
const N = 39; // q = 1, 1.5 … 20
const gaussPdf = (x: number, m: number, s: number) => Math.exp(-0.5 * ((x - m) / s) ** 2) / (s * Math.sqrt(2 * Math.PI));

/**
 * Densidade da qualidade `q` para um país (tabela de 39 pontos, passo 0,5).
 * Mistura: (1−ε)·N(μ, σ) + ε·convolução de N(μ, σ) com a cauda de Pareto (integração numérica).
 */
export function tabelaDensidade(pais: Pais, t: T): Float64Array {
  const m = mu(pais, t);
  const eps = probCauda(pais, t);
  const out = new Float64Array(N);
  // cauda: s = escala·(pareto−1) tem densidade (α/escala)·(1 + s/escala)^(−α−1)
  const ss = Array.from({ length: 160 }, (_, i) => (i + 0.5) * 0.25);
  const pesoS = ss.map((s) => (t.paretoAlfa / t.paretoEscala) * (1 + s / t.paretoEscala) ** (-t.paretoAlfa - 1) * 0.25);
  const soma = pesoS.reduce((a, b) => a + b, 0) || 1;
  for (let i = 0; i < N; i++) {
    const q = 1 + i * PASSO;
    const base = gaussPdf(q, m, t.sigma);
    let cauda = 0;
    for (let k = 0; k < ss.length; k++) cauda += gaussPdf(q, m + (ss[k] as number), t.sigma) * ((pesoS[k] as number) / soma);
    out[i] = (1 - eps) * base + eps * cauda;
  }
  return out;
}

export const densidadeEm = (tabela: Float64Array, q: number): number => tabela[Math.round((limitar(q, 1, 20) - 1) / PASSO)] as number;
