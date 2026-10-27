/**
 * Sessão de jogo (RZ-501): o ecrã inicial é a porta de entrada. Só se vê o jogo depois de continuar, carregar, importar ou criar
 * um save; «sair» volta ao ecrã inicial. Vive no `sessionStorage` (dura enquanto o separador está aberto, por isso recarregar a
 * página dentro do jogo não o fecha). O último save aberto lembra-se no `localStorage`.
 */
import { read, save } from "@/ui/storage";

const IN_GAME = "raizes.inGame";
const LAST = "raizes.lastOpened";

export function inGame(): boolean {
  try { return window.sessionStorage.getItem(IN_GAME) === "1"; } catch { return false; }
}
export function enterGame(): void {
  try { window.sessionStorage.setItem(IN_GAME, "1"); } catch { /* sem sessionStorage: o ecrã inicial volta a pedir */ }
}
export function leaveGame(): void {
  try { window.sessionStorage.removeItem(IN_GAME); } catch { /* idem */ }
}

/** O que se abriu da última vez: o mundo corrente ou um save da lista. */
export type LastOpened = { kind: "current" } | { kind: "save"; id: string };
const isLast = (v: unknown): v is LastOpened => typeof v === "object" && v !== null && ((v as { kind?: unknown }).kind === "current" || ((v as { kind?: unknown }).kind === "save" && typeof (v as { id?: unknown }).id === "string"));
export const lastOpened = (): LastOpened | undefined => read("raizes.lastOpened", isLast);
export const rememberOpened = (v: LastOpened): void => save(LAST, v);
