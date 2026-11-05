/**
 * Tipos do que a interface pode ver (RZ-129). Nada aqui referencia a "verdade" oculta:
 * só factos públicos e estimativas com margem vindas de observações.
 */
import type { IsoDate, PublicPerson, EntityType } from "../persistence/types";

export type Target = { k: EntityType; id: string };

/** Formato guardado em `observacao.valores` (versão 1). Guarda o desvio (σ); a margem calcula-se com `z`. */
export type ObservedValues = {
  v: 1;
  scale?: [number, number];
  fields?: Record<string, { est: number; sigma: number }>;
  labels?: Label[];
};

export type Label = { trait: string; strip: "low" | "high" };

export type Estimate = {
  /** Melhor estimativa (arredondada a 1 casa decimal). */
  value: number;
  margin: number;
  /** [valor − margem, valor + margem], dentro da escala. */
  halfTime: [number, number];
};

export type Freshness = {
  /** Data da observação mais recente que contribuiu. */
  seenIn: IsoDate;
  /** Épocas decorridas desde essa observação ("visto há 2 épocas"). */
  sinceSeasons: number;
  outdated: boolean;
};

export type Knowledge = Freshness & {
  observations: number;
  fields: Record<string, Estimate & Freshness>;
  labels: Label[];
};

/** Factos públicos de uma pessoa, com a idade à data da Vista. */
export type ViewPerson = PublicPerson & { age: number };

/**
 * Ficha de uma pessoa tal como o gamer a conhece (RZ-129 + RZ-103): factos públicos sempre;
 * atributos, potencial e personalidade só se alguém os observou (e com margem de erro).
 */
export type PersonProfile = {
  exposed: ViewPerson;
  attributes?: Knowledge;
  potential?: Knowledge;
  /** Rótulos de traços extremos (`conhecimento.rotulos`), nunca números. */
  personality?: Knowledge;
};
