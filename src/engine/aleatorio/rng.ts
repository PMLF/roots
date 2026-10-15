/**
 * Gerador pseudo-aleatório determinístico (mulberry32) com sub-fluxos nomeados.
 * Toda a aleatoriedade do motor vem daqui (MODELO_DADOS §0): mesma seed → mesmo mundo.
 * `derivar("clube:sc-cascais")` dá um fluxo independente e estável, para que mudar a ordem
 * em que as coisas se geram (ou acrescentar um passo) não altere o que já estava gerado.
 */

function hashTexto(s: string): number {
  // xmur3: espalha bem textos curtos
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

export class Rng {
  private estado: number;
  private reserva: number | undefined;

  constructor(
    readonly semente: string,
    private readonly caminho: string = "",
  ) {
    this.estado = hashTexto(`${semente}|${caminho}`);
  }

  /** Fluxo independente e estável, identificado por `nome`. */
  derivar(nome: string): Rng {
    return new Rng(this.semente, `${this.caminho}/${nome}`);
  }

  /** Uniforme em [0, 1). */
  float(): number {
    this.estado = (this.estado + 0x6d2b79f5) >>> 0;
    let t = this.estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Inteiro em [min, max] (ambos incluídos). */
  inteiro(min: number, max: number): number {
    return min + Math.floor(this.float() * (max - min + 1));
  }

  /** Verdadeiro com probabilidade p. */
  prob(p: number): boolean {
    return this.float() < p;
  }

  /** Normal (Box-Muller). */
  gauss(media = 0, desvio = 1): number {
    if (this.reserva !== undefined) {
      const r = this.reserva;
      this.reserva = undefined;
      return media + desvio * r;
    }
    let u = 0;
    while (u === 0) u = this.float();
    const v = this.float();
    const m = Math.sqrt(-2 * Math.log(u));
    this.reserva = m * Math.sin(2 * Math.PI * v);
    return media + desvio * m * Math.cos(2 * Math.PI * v);
  }

  /** Pareto com mínimo 1 e expoente alfa (cauda pesada). */
  pareto(alfa: number): number {
    return Math.pow(1 - this.float(), -1 / alfa);
  }

  escolher<T>(xs: readonly T[]): T {
    if (xs.length === 0) throw new Error("escolher: lista vazia");
    return xs[Math.floor(this.float() * xs.length)] as T;
  }

  /** Escolha com pesos (não precisam de somar 1). */
  ponderado<T>(xs: readonly T[], peso: (x: T) => number): T {
    let total = 0;
    for (const x of xs) total += Math.max(0, peso(x));
    if (!(total > 0)) throw new Error("ponderado: pesos todos nulos");
    let r = this.float() * total;
    for (const x of xs) {
      r -= Math.max(0, peso(x));
      if (r < 0) return x;
    }
    return xs[xs.length - 1] as T;
  }

  /** Baralha uma cópia (Fisher-Yates). */
  baralhar<T>(xs: readonly T[]): T[] {
    const a = [...xs];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.float() * (i + 1));
      [a[i], a[j]] = [a[j] as T, a[i] as T];
    }
    return a;
  }
}

export const limitar = (x: number, min: number, max: number): number => Math.min(max, Math.max(min, x));
