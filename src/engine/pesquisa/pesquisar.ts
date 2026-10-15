/** Pesquisa global (RZ-009): por nome, sem acentos nem maiúsculas, com prefixos primeiro. Pura. */

export type TipoResultado = "clube" | "cidade" | "pessoa";
export type EntradaIndice = { k: TipoResultado; id: string; titulo: string; subtitulo: string; extra?: string };
export type ResultadoPesquisa = EntradaIndice;

export const normalizarBusca = (s: string): string =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export type Indexada = EntradaIndice & { _t: string; _extra: string };

export const indexar = (xs: readonly EntradaIndice[]): Indexada[] =>
  xs.map((x) => ({ ...x, _t: normalizarBusca(x.titulo), _extra: normalizarBusca(x.extra ?? "") }));

/** 0 = não serve. Mais alto = melhor: título começa por tudo > palavras começam > contém > só no extra. */
function pontuar(x: Indexada, termos: string[], inteira: string): number {
  if (x._t === inteira) return 100;
  if (x._t.startsWith(inteira)) return 80;
  const palavras = x._t.split(" ");
  if (termos.every((t) => palavras.some((p) => p.startsWith(t)))) return 60;
  if (termos.every((t) => x._t.includes(t))) return 40;
  if (termos.every((t) => x._t.includes(t) || x._extra.includes(t))) return 20;
  return 0;
}

const ORDEM_TIPO: Record<TipoResultado, number> = { clube: 0, cidade: 1, pessoa: 2 };

export function pesquisar(consulta: string, indice: readonly Indexada[], limite = 12): ResultadoPesquisa[] {
  const inteira = normalizarBusca(consulta);
  if (inteira.length < 2) return [];
  const termos = inteira.split(" ");
  return indice
    .map((x) => ({ x, p: pontuar(x, termos, inteira) }))
    .filter((r) => r.p > 0)
    .sort((a, b) => b.p - a.p || ORDEM_TIPO[a.x.k] - ORDEM_TIPO[b.x.k] || (a.x._t < b.x._t ? -1 : a.x._t > b.x._t ? 1 : a.x.id < b.x.id ? -1 : 1))
    .slice(0, limite)
    .map(({ x }) => ({ k: x.k, id: x.id, titulo: x.titulo, subtitulo: x.subtitulo }));
}
