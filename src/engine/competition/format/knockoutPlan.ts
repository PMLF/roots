/**
 * Planeamento de uma fase a eliminar (RZ-140): quantas rondas há, quando entra cada vaga de clubes e quantas
 * eliminatórias/folgas tem cada ronda. Só depende dos tamanhos das vagas, por isso cada época sabe de antemão quantas
 * datas precisa.
 *
 * Regras (pensadas para a Taça, mas gerais):
 *  - depois de entrar a última vaga, o campo é uma potência de 2 (chave limpa até à final);
 *  - antes de cada vaga entrar, o campo reduz-se ao que falta para esse tamanho; quando o número de clubes não permite
 *    uma ronda completa, os melhores clubes ficam de folga (ronda preliminar só para os de baixo);
 *  - cada ronda elimina o máximo possível (metade, arredondada para cima): o plano tem o mínimo de rondas.
 */
export type RoundPlan = {
  /** Vagas que entram antes desta ronda (a 0 entra na primeira). */
  waves: number[];
  /** Clubes na ronda, já com os que entraram. */
  field: number;
  /** Eliminatórias (duas equipas cada); os restantes, `field − 2·ties`, ficam de folga. */
  ties: number;
  /** Rondas que faltam depois desta até à final: 0 = final, 1 = meias-finais… */
  fromEnd: number;
};

const nextPowerOf2 = (n: number) => 2 ** Math.ceil(Math.log2(Math.max(1, n)));

/** Rondas para reduzir `field` clubes a `target` (≥ 1): cada uma elimina o máximo possível. */
function reduceTo(field: number, target: number): { field: number; ties: number }[] {
  const out: { field: number; ties: number }[] = [];
  let f = field;
  while (f > Math.max(1, target)) {
    const next = Math.max(Math.max(1, target), Math.ceil(f / 2));
    out.push({ field: f, ties: f - next });
    f = next;
  }
  return out;
}

/** `sizes[g]` = clubes da vaga `g` (0 = campo inicial). Vagas vazias são ignoradas. */
export function planKnockout(sizes: readonly number[]): RoundPlan[] {
  const indexes = sizes.map((n, i) => (n > 0 ? i : -1)).filter((i) => i >= 0);
  const counts = indexes.map((i) => sizes[i] as number);
  const G = counts.length;
  if (counts.reduce((a, b) => a + b, 0) < 2) return [];
  // campo depois de entrar cada vaga (de trás para a frente) e sobreviventes necessários à chegada de cada vaga
  const after: number[] = new Array(G).fill(0);
  const need: number[] = new Array(G).fill(0);
  after[G - 1] = G === 1 ? (counts[0] as number) : nextPowerOf2((counts[G - 1] as number) + 1);
  for (let g = G - 1; g >= 1; g--) {
    need[g] = (after[g] as number) - (counts[g] as number);
    if (g - 1 >= 1) {
      let f = need[g] as number;
      do f *= 2; while (f < (counts[g - 1] as number) + 1);
      after[g - 1] = f;
    }
  }
  const plan: RoundPlan[] = [];
  let carried = 0;
  let pending: number[] = [];
  for (let g = 0; g < G; g++) {
    pending.push(indexes[g] as number);
    const field = carried + (counts[g] as number);
    const target = g === G - 1 ? 1 : Math.min(need[g + 1] as number, field);
    const rounds = reduceTo(field, target);
    if (rounds.length === 0) {
      carried = field; // nada a jogar antes da vaga seguinte: entram na mesma ronda
      continue;
    }
    rounds.forEach((r, k) => plan.push({ waves: k === 0 ? pending : [], field: r.field, ties: r.ties, fromEnd: 0 }));
    pending = [];
    const last = rounds[rounds.length - 1] as { field: number; ties: number };
    carried = last.field - last.ties;
  }
  plan.forEach((r, i) => (r.fromEnd = plan.length - 1 - i));
  return plan;
}
