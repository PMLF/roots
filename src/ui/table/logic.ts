/** Lógica pura da tabela única (TOM_E_UX §3.6): ordenar, filtrar, conjuntos de colunas e exportação. */
export type Column<L> = {
  id: string;
  title: string;
  /** Valor para ordenar e exportar. */
  value: (line: L) => string | number;
  /** Se existir, ordena por isto (o `value` continua a ser o que se exporta e filtra). */
  sortValue?: (line: L) => string | number;
  /** Alinhar à direita (números). */
  numeric?: boolean;
};

export type Order = { column: string; direction: "asc" | "desc" } | null;

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function sort<L>(lines: readonly L[], columns: readonly Column<L>[], order: Order): L[] {
  if (!order) return [...lines];
  const c = columns.find((x) => x.id === order.column);
  if (!c) return [...lines];
  const sign = order.direction === "asc" ? 1 : -1;
  return lines
    .map((l, i) => ({ l, i, v: (c.sortValue ?? c.value)(l) }))
    .sort((a, b) => {
      const r = typeof a.v === "number" && typeof b.v === "number" ? a.v - b.v : norm(String(a.v)).localeCompare(norm(String(b.v)), "pt");
      return r * sign || a.i - b.i; // estável
    })
    .map((x) => x.l);
}

/** Todas as palavras do filtro têm de aparecer em alguma coluna visível. */
export function filter<L>(lines: readonly L[], columns: readonly Column<L>[], text: string): L[] {
  const terms = norm(text).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [...lines];
  return lines.filter((l) => {
    const target = norm(columns.map((c) => String(c.value(l))).join(" "));
    return terms.every((t) => target.includes(t));
  });
}

/** Clique no cabeçalho: sem ordem → asc → desc → sem ordem. */
export function nextOrder(current: Order, column: string): Order {
  if (!current || current.column !== column) return { column, direction: "asc" };
  return current.direction === "asc" ? { column, direction: "desc" } : null;
}

const cellCsv = (v: string | number) => {
  const s = String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV com `;` (Excel em pt-PT) e BOM. */
export function paraCsv<L>(lines: readonly L[], columns: readonly Column<L>[]): string {
  const header = columns.map((c) => cellCsv(c.title)).join(";");
  const body = lines.map((l) => columns.map((c) => cellCsv(c.value(l))).join(";"));
  return "﻿" + [header, ...body].join("\r\n") + "\r\n";
}

export type ColumnsPreset = { name: string; columns: string[] };

/** Colunas visíveis na ordem do conjunto, ignorando ids que já não existem. */
export function presetColumns<L>(all: readonly Column<L>[], preset: ColumnsPreset | undefined): Column<L>[] {
  if (!preset) return [...all];
  const r = preset.columns.map((id) => all.find((c) => c.id === id)).filter((c): c is Column<L> => c !== undefined);
  return r.length > 0 ? r : [...all];
}
