"use client";
import { useCallback, useEffect, useState } from "react";
import { useEngine } from "@/ui/MotorProvider";

/**
 * O clube do save (decidido a 15-10-2026): escolhe-se uma vez ao começar e só muda por demissão ou despedimento (RZ-157).
 * Vive no save (`clube.gamer`), não no browser. O seletor de developers pode forçar a troca para testar. Todas as páginas
 * do menu (Clube, Plantel, Jogos, Cidade, Hoje) falam sempre deste clube.
 */
const EVENT = "raizes:meuClube";

export function useOwnClub(): [string | undefined, (id: string, force?: boolean) => Promise<void>, boolean] {
  const engine = useEngine();
  const [id, setId] = useState<string | undefined>(undefined);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!engine) return;
    let live = true;
    const load = () => {
      engine.call("worldState", null).then((m) => (m ? engine.call("gamerClub", null) : null)).then((r) => { if (live) { setId(r?.id); setReady(true); } }).catch(() => live && setReady(true));
    };
    load();
    window.addEventListener(EVENT, load);
    window.addEventListener("raizes:mundo", load);
    return () => { live = false; window.removeEventListener(EVENT, load); window.removeEventListener("raizes:mundo", load); };
  }, [engine]);
  const set = useCallback(async (fresh: string, force = false) => {
    if (!engine) return;
    await engine.call("chooseClub", { id: fresh, force });
    window.dispatchEvent(new Event(EVENT));
    window.dispatchEvent(new Event("raizes:tempo"));
  }, [engine]);
  return [id, set, ready];
}
