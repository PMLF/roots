"use client";
import { useEffect, useState, type DependencyList } from "react";
import type { ClientEngine } from "@/ui/engineClient";
import { useEngine } from "@/ui/EngineProvider";

/**
 * Carrega dados do motor quando o motor está pronto ou as dependências mudam: `undefined` enquanto carrega, `null` se falhar (ou se o
 * `load` devolver `null`). Ignora respostas de pedidos que já foram substituídos. Evita repetir o padrão `live` em cada página.
 */
export function useEngineLoad<T>(load: (engine: ClientEngine) => Promise<T>, deps: DependencyList): T | null | undefined {
  const engine = useEngine();
  const [value, setValue] = useState<T | null | undefined>(undefined);
  useEffect(() => {
    if (!engine) return;
    let live = true;
    load(engine).then((r) => { if (live) setValue(r); }).catch(() => { if (live) setValue(null); });
    return () => { live = false; };
  }, [engine, ...deps]);
  return value;
}
