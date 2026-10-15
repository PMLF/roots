/** Ligações entre entidades (docs/TOM_E_UX.md §3.3): toda a entidade tem uma ficha em /profile/?type=…&id=…&tab=…. O URL é em inglês; os tipos e separadores internos migram no RZ-143. */
export type TipoEntidadeFicha = "clube" | "cidade" | "localidade" | "pessoa" | "competicao";
export const TIPOS_FICHA: readonly TipoEntidadeFicha[] = ["clube", "cidade", "localidade", "pessoa", "competicao"];

/** Tipo de entidade e separadores como aparecem no URL (inglês). */
export const TIPO_URL: Record<TipoEntidadeFicha, string> = { clube: "club", cidade: "city", localidade: "locality", pessoa: "person", competicao: "competition" };
export const SEPARADOR_URL: Record<string, string> = {
  resumo: "summary", plantel: "squad", staff: "staff", jogos: "matches", historia: "history", carreira: "career",
  clubes: "clubs", autarca: "mayor", classificacao: "table", conhecimento: "knowledge",
};
export const separadorDoUrl = (v: string | null): string | undefined => Object.entries(SEPARADOR_URL).find(([, u]) => u === v)?.[0];

export const hrefFicha = (k: TipoEntidadeFicha, id: string): string => `/profile/?type=${TIPO_URL[k]}&id=${encodeURIComponent(id)}`;

export function lerFicha(params: { get(nome: string): string | null }): { k: TipoEntidadeFicha; id: string } | null {
  const tipo = params.get("type");
  const id = params.get("id");
  const k = TIPOS_FICHA.find((x) => TIPO_URL[x] === tipo);
  return k && id ? { k, id } : null;
}

/**
 * Separadores de cada ficha: fixos e pela mesma ordem (TOM_E_UX §3.2). Os que ainda não têm conteúdo
 * aparecem na mesma na ordem certa, marcados como "em breve", para a estrutura não mudar com o jogo.
 */
export const SEPARADORES: Record<TipoEntidadeFicha, readonly string[]> = {
  clube: ["resumo", "plantel", "staff", "jogos", "historia"],
  pessoa: ["resumo", "carreira", "historia"],
  cidade: ["resumo", "clubes", "autarca", "historia"],
  localidade: ["resumo", "clubes", "historia"],
  competicao: ["resumo", "clubes", "historia"],
};
