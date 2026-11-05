"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { ClientEngine } from "@/ui/engineClient";
import { useT } from "@/ui/i18n/LocaleProvider";

const CtxEngine = createContext<ClientEngine | null>(null);

/** Um só motor (Web Worker) para a aplicação inteira: navegar entre páginas não o reabre. */
export function ProviderEngine({ children }: { children: ReactNode }) {
  const [engine, setEngine] = useState<ClientEngine | null>(null);
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const on = () => setBusy(true);
    window.addEventListener("raizes:ocupado", on);
    return () => window.removeEventListener("raizes:ocupado", on);
  }, []);
  useEffect(() => {
    const m = new ClientEngine();
    setEngine(m);
    return () => {
      m.terminate();
      setEngine(null);
    };
  }, []);
  return (
    <CtxEngine.Provider value={engine}>
      {busy && (
        <div role="alert" className="aviso-ocupado">
          <span>{t("engine.elsewhere")}</span>
          <button type="button" className="botao" onClick={() => window.location.reload()}>{t("engine.retry")}</button>
        </div>
      )}
      {children}
    </CtxEngine.Provider>
  );
}

/** O motor, ou `null` enquanto o worker arranca. */
export const useEngine = (): ClientEngine | null => useContext(CtxEngine);
