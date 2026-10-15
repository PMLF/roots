/**
 * Como se mostra o que sabes e o que não sabes (TOM_E_UX §3.7, HISTORICO_EVENTOS §5):
 *  - exato:       14
 *  - estimado:    ≈ 14-16   (intervalo da Vista, arredondado às unidades)
 *  - desatualizado: ≈ 14-16 · visto há 2 épocas
 */
export type Estado = "exato" | "estimado" | "desatualizado";

export type ValorMostrado = { estado: Estado; texto: string; epocasDesde?: number };

export function mostrarExato(v: number): ValorMostrado {
  return { estado: "exato", texto: String(Math.round(v * 10) / 10) };
}

export function mostrarEstimativa(e: { valor: number; margem: number; intervalo: [number, number] }, frescura?: { desatualizado: boolean; epocasDesde: number }): ValorMostrado {
  const lo = Math.round(e.intervalo[0]);
  const hi = Math.round(e.intervalo[1]);
  const texto = lo === hi ? `≈ ${lo}` : `≈ ${lo}-${hi}`;
  if (frescura?.desatualizado) return { estado: "desatualizado", texto, epocasDesde: frescura.epocasDesde };
  return { estado: "estimado", texto };
}
