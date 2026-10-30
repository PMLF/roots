import type { Key } from "@/ui/i18n";

/** O nome do estádio como se mostra: «Estádio Martins Digital» se uma empresa lhe dá o nome, senão o original (que nunca muda). */
export function stadiumLabel(t: (k: Key, v?: Record<string, string | number>) => string, name: string, sponsor?: string): string {
  return sponsor ? t("stadium.named" as Key, { name: sponsor }) : name;
}
