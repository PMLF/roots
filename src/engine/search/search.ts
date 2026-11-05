/** Pesquisa global (RZ-009): por nome, sem acentos nem maiúsculas, com prefixos primeiro. Pura. */

type ResultType = "club" | "city" | "locality" | "person";
export type InputIndex = { k: ResultType; id: string; title: string; subtitle: string; extra?: string };
export type SearchResult = InputIndex;

export const normaliseSearch = (s: string): string =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export type Indexed = InputIndex & { _t: string; _extra: string };

export const buildIndex = (xs: readonly InputIndex[]): Indexed[] =>
  xs.map((x) => ({ ...x, _t: normaliseSearch(x.title), _extra: normaliseSearch(x.extra ?? "") }));

/** 0 = não serve. Mais alto = melhor: título começa por tudo > palavras começam > contém > só no extra. */
function score(x: Indexed, terms: string[], whole: string): number {
  if (x._t === whole) return 100;
  if (x._t.startsWith(whole)) return 80;
  const words = x._t.split(" ");
  if (terms.every((t) => words.some((p) => p.startsWith(t)))) return 60;
  if (terms.every((t) => x._t.includes(t))) return 40;
  if (terms.every((t) => x._t.includes(t) || x._extra.includes(t))) return 20;
  return 0;
}

const ORDER_TYPE: Record<ResultType, number> = { club: 0, city: 1, locality: 2, person: 3 };

export function find(query: string, index: readonly Indexed[], limit = 12): SearchResult[] {
  const whole = normaliseSearch(query);
  if (whole.length < 2) return [];
  const terms = whole.split(" ");
  return index
    .map((x) => ({ x, p: score(x, terms, whole) }))
    .filter((r) => r.p > 0)
    .sort((a, b) => b.p - a.p || ORDER_TYPE[a.x.k] - ORDER_TYPE[b.x.k] || (a.x._t < b.x._t ? -1 : a.x._t > b.x._t ? 1 : a.x.id < b.x.id ? -1 : 1))
    .slice(0, limit)
    .map(({ x }) => ({ k: x.k, id: x.id, title: x.title, subtitle: x.subtitle }));
}
