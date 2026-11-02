import { MAX_PAGE, type PageQuery } from "./contracts";

const DEFAULT_PAGE = 50;

/** Uma página de uma lista já filtrada: ordena pela coluna pedida (desempate estável pelo id) e corta ao teto `MAX_PAGE`. */
export function pageOf<T>(rows: readonly T[], q: PageQuery | undefined, sorters: Record<string, (r: T) => string | number>, id: (r: T) => string): { rows: T[]; total: number } {
  const key = q?.sort ? sorters[q.sort.column] : undefined;
  const sorted = key && q?.sort
    ? [...rows].sort((a, b) => {
        const x = key(a), y = key(b);
        const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "pt");
        return (q.sort!.direction === "asc" ? c : -c) || id(a).localeCompare(id(b));
      })
    : rows;
  const offset = Math.max(0, Math.floor(q?.offset ?? 0));
  const limit = Math.min(MAX_PAGE, Math.max(1, Math.floor(q?.limit ?? DEFAULT_PAGE)));
  return { rows: sorted.slice(offset, offset + limit), total: rows.length };
}
