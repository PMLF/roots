"use client";
import { fundoCores, lerCores } from "@/ui/cores";
import { useCoresClubes } from "@/ui/useCoresClubes";

/**
 * Retângulo discreto com as cores do clube, para identificar o clube de relance (tabelas, jogo, notícias).
 * Mostra-se pelo id do clube ou diretamente pelo texto das cores; sem cores conhecidas, não ocupa espaço.
 */
export function AmostraClube({ id, cores, className }: { id?: string; cores?: string; className?: string }) {
  const todas = useCoresClubes();
  const texto = cores ?? (id ? todas?.get(id) : undefined);
  if (!texto) return null;
  return <span className={`amostra-clube${className ? ` ${className}` : ""}`} style={{ background: fundoCores(lerCores(texto)) }} aria-hidden="true" />;
}
