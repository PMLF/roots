/** Ligações entre entidades (docs/TONE_AND_UX.md §3.3): toda a entidade tem uma ficha em /profile/?type=…&id=…&tab=…. O URL é em inglês; os tipos e separadores internos migram no RZ-143. */
export type ProfileEntityType = "club" | "city" | "locality" | "person" | "competition";
export const PROFILE_TYPES: readonly ProfileEntityType[] = ["club", "city", "locality", "person", "competition"];

/** Tipo de entidade e separadores como aparecem no URL (inglês). */
export const TYPE_URL: Record<ProfileEntityType, string> = { club: "club", city: "city", locality: "locality", person: "person", competition: "competition" };
export const TAB_URL: Record<string, string> = {
  summary: "summary", squad: "squad", staff: "staff", matches: "matches", story: "history", career: "career",
  clubs: "clubs", mayor: "mayor", standings: "table", knowledge: "knowledge", statistics: "stats", contract: "contract",
};
export const urlTab = (v: string | null): string | undefined => Object.entries(TAB_URL).find(([, u]) => u === v)?.[0];

export const profileHref = (k: ProfileEntityType, id: string): string => `/profile/?type=${TYPE_URL[k]}&id=${encodeURIComponent(id)}`;

export function readProfile(params: { get(name: string): string | null }): { k: ProfileEntityType; id: string } | null {
  const type = params.get("type");
  const id = params.get("id");
  const k = PROFILE_TYPES.find((x) => TYPE_URL[x] === type);
  return k && id ? { k, id } : null;
}

/**
 * Separadores de cada ficha: fixos e pela mesma ordem (TOM_E_UX §3.2). Os que ainda não têm conteúdo
 * aparecem na mesma na ordem certa, marcados como "em breve", para a estrutura não mudar com o jogo.
 */
export const TABS: Record<ProfileEntityType, readonly string[]> = {
  club: ["summary", "squad", "staff", "matches", "story"],
  person: ["summary", "contract", "career", "story"],
  city: ["summary", "clubs", "story"],
  locality: ["summary", "clubs", "story"],
  competition: ["summary", "statistics", "clubs", "story"],
};
