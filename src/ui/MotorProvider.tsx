"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { ClientEngine } from "@/ui/engineClient";

const CtxEngine = createContext<ClientEngine | null>(null);

/** Um só motor (Web Worker) para a aplicação inteira: navegar entre páginas não o reabre. */
export function ProviderEngine({ children }: { children: ReactNode }) {
  const [engine, setEngine] = useState<ClientEngine | null>(null);
  useEffect(() => {
    const m = new ClientEngine();
    setEngine(m);
    return () => {
      m.terminate();
      setEngine(null);
    };
  }, []);
  return <CtxEngine.Provider value={engine}>{children}</CtxEngine.Provider>;
}

/** O motor, ou `null` enquanto o worker arranca. */
export const useEngine = (): ClientEngine | null => useContext(CtxEngine);
