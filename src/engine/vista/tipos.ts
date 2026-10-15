/**
 * Tipos do que a interface pode ver (RZ-129). Nada aqui referencia a "verdade" oculta:
 * só factos públicos e estimativas com margem vindas de observações.
 */
import type { Data, TipoEntidade } from "../persistencia/tipos";

export type Alvo = { k: TipoEntidade; id: string };

/** Formato guardado em `observacao.valores` (versão 1). Guarda o desvio (σ); a margem calcula-se com `z`. */
export type ValoresObservados = {
  v: 1;
  escala?: [number, number];
  campos?: Record<string, { est: number; sigma: number }>;
  rotulos?: Rotulo[];
};

export type Rotulo = { traco: string; faixa: "baixa" | "alta" };

export type Estimativa = {
  /** Melhor estimativa (arredondada a 1 casa decimal). */
  valor: number;
  margem: number;
  /** [valor − margem, valor + margem], dentro da escala. */
  intervalo: [number, number];
};

export type Frescura = {
  /** Data da observação mais recente que contribuiu. */
  vistoEm: Data;
  /** Épocas decorridas desde essa observação ("visto há 2 épocas"). */
  epocasDesde: number;
  desatualizado: boolean;
};

export type Conhecimento = Frescura & {
  observacoes: number;
  campos: Record<string, Estimativa & Frescura>;
  rotulos: Rotulo[];
};
