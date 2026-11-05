import type { LiveLine } from "@/engine/season/liveMatch";

export type MatchAlert = { key: string; kind: "goal" | "red" | "injury" };

/** Identifica um lance do feed (os objetos mudam a cada chamada ao motor, a chave não). */
export const lineKey = (l: LiveLine): string => `${l.minute}/${l.type}/${l.side ?? ""}/${l.player ?? ""}`;

/** Os lances que param o jogo 3 segundos: golo, vermelho (direto ou segundo amarelo) e lesão. */
export const alertOf = (l: LiveLine): MatchAlert["kind"] | undefined => (l.type === "goal" ? "goal" : l.type === "card" && l.colour === "red" ? "red" : l.type === "injury" ? "injury" : undefined);
