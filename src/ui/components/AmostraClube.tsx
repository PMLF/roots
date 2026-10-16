"use client";
import { backgroundColours, readColours } from "@/ui/cores";
import { useClubsColours } from "@/ui/useCoresClubes";

/**
 * Retângulo discreto com as cores do clube, para identificar o clube de relance (tabelas, jogo, notícias).
 * Mostra-se pelo id do clube ou diretamente pelo texto das cores; sem cores conhecidas, não ocupa espaço.
 */
export function ClubSwatch({ id, colours, className }: { id?: string; colours?: string; className?: string }) {
  const all = useClubsColours();
  const text = colours ?? (id ? all?.get(id) : undefined);
  if (!text) return null;
  return <span className={`amostra-clube${className ? ` ${className}` : ""}`} style={{ background: backgroundColours(readColours(text)) }} aria-hidden="true" />;
}
