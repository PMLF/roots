/** Ligações entre entidades (docs/TOM_E_UX.md §3.3): toda a entidade tem uma ficha em /ficha/?k=…&id=…. */
export type TipoEntidadeFicha = "clube" | "cidade" | "localidade" | "pessoa" | "competicao";
export const TIPOS_FICHA: readonly TipoEntidadeFicha[] = ["clube", "cidade", "localidade", "pessoa", "competicao"];

export const hrefFicha = (k: TipoEntidadeFicha, id: string): string => `/ficha/?k=${k}&id=${encodeURIComponent(id)}`;

export function lerFicha(params: { get(nome: string): string | null }): { k: TipoEntidadeFicha; id: string } | null {
  const k = params.get("k");
  const id = params.get("id");
  return k && id && (TIPOS_FICHA as readonly string[]).includes(k) ? { k: k as TipoEntidadeFicha, id } : null;
}

/**
 * Separadores de cada ficha: fixos e pela mesma ordem (TOM_E_UX §3.2). Os que ainda não têm conteúdo
 * aparecem na mesma na ordem certa, marcados como "em breve", para a estrutura não mudar com o jogo.
 */
export const SEPARADORES: Record<TipoEntidadeFicha, readonly string[]> = {
  clube: ["resumo", "plantel", "staff", "jogos", "historia"],
  pessoa: ["resumo", "conhecimento", "carreira", "historia"],
  cidade: ["resumo", "clubes", "autarca", "historia"],
  localidade: ["resumo", "clubes", "historia"],
  competicao: ["resumo", "classificacao", "jogos", "historia"],
};
