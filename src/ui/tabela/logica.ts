/** Lógica pura da tabela única (TOM_E_UX §3.6): ordenar, filtrar, conjuntos de colunas e exportação. */
export type Coluna<L> = {
  id: string;
  titulo: string;
  /** Valor para ordenar e exportar. */
  valor: (linha: L) => string | number;
  /** Alinhar à direita (números). */
  numerica?: boolean;
};

export type Ordem = { coluna: string; direcao: "asc" | "desc" } | null;

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function ordenar<L>(linhas: readonly L[], colunas: readonly Coluna<L>[], ordem: Ordem): L[] {
  if (!ordem) return [...linhas];
  const c = colunas.find((x) => x.id === ordem.coluna);
  if (!c) return [...linhas];
  const sinal = ordem.direcao === "asc" ? 1 : -1;
  return linhas
    .map((l, i) => ({ l, i, v: c.valor(l) }))
    .sort((a, b) => {
      const r = typeof a.v === "number" && typeof b.v === "number" ? a.v - b.v : norm(String(a.v)).localeCompare(norm(String(b.v)), "pt");
      return r * sinal || a.i - b.i; // estável
    })
    .map((x) => x.l);
}

/** Todas as palavras do filtro têm de aparecer em alguma coluna visível. */
export function filtrar<L>(linhas: readonly L[], colunas: readonly Coluna<L>[], texto: string): L[] {
  const termos = norm(texto).split(/\s+/).filter(Boolean);
  if (termos.length === 0) return [...linhas];
  return linhas.filter((l) => {
    const alvo = norm(colunas.map((c) => String(c.valor(l))).join(" "));
    return termos.every((t) => alvo.includes(t));
  });
}

/** Clique no cabeçalho: sem ordem → asc → desc → sem ordem. */
export function proximaOrdem(atual: Ordem, coluna: string): Ordem {
  if (!atual || atual.coluna !== coluna) return { coluna, direcao: "asc" };
  return atual.direcao === "asc" ? { coluna, direcao: "desc" } : null;
}

const celulaCsv = (v: string | number) => {
  const s = String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV com `;` (Excel em pt-PT) e BOM. */
export function paraCsv<L>(linhas: readonly L[], colunas: readonly Coluna<L>[]): string {
  const cab = colunas.map((c) => celulaCsv(c.titulo)).join(";");
  const corpo = linhas.map((l) => colunas.map((c) => celulaCsv(c.valor(l))).join(";"));
  return "﻿" + [cab, ...corpo].join("\r\n") + "\r\n";
}

export type ConjuntoColunas = { nome: string; colunas: string[] };

/** Colunas visíveis na ordem do conjunto, ignorando ids que já não existem. */
export function colunasDoConjunto<L>(todas: readonly Coluna<L>[], conjunto: ConjuntoColunas | undefined): Coluna<L>[] {
  if (!conjunto) return [...todas];
  const r = conjunto.colunas.map((id) => todas.find((c) => c.id === id)).filter((c): c is Coluna<L> => c !== undefined);
  return r.length > 0 ? r : [...todas];
}
