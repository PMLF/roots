/**
 * Como se mostra o que sabes e o que não sabes (TOM_E_UX §3.7, HISTORICO_EVENTOS §5):
 *  - exato:       14
 *  - estimado:    ≈ 14-16   (intervalo da Vista, arredondado às unidades)
 *  - desatualizado: ≈ 14-16 · visto há 2 épocas
 */
export type State = "exact" | "estimated" | "outdated";

export type ShownValue = { state: State; text: string; sinceSeasons?: number };

export function showExact(v: number): ShownValue {
  return { state: "exact", text: String(Math.round(v * 10) / 10) };
}

export function showEstimate(e: { value: number; margin: number; halfTime: [number, number] }, freshness?: { outdated: boolean; sinceSeasons: number }): ShownValue {
  const lo = Math.round(e.halfTime[0]);
  const hi = Math.round(e.halfTime[1]);
  const text = lo === hi ? `≈ ${lo}` : `≈ ${lo}-${hi}`;
  if (freshness?.outdated) return { state: "outdated", text, sinceSeasons: freshness.sinceSeasons };
  return { state: "estimated", text };
}
