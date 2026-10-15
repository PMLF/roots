"use client";
import { useCallback, useEffect, useState } from "react";
import { useMotor } from "@/ui/MotorProvider";

/**
 * O clube do save (decidido a 15-10-2026): escolhe-se uma vez ao começar e só muda por demissão ou despedimento (RZ-157).
 * Vive no save (`clube.gamer`), não no browser. O seletor de developers pode forçar a troca para testar. Todas as páginas
 * do menu (Clube, Plantel, Jogos, Cidade, Hoje) falam sempre deste clube.
 */
const EVENTO = "raizes:meuClube";

export function useMeuClube(): [string | undefined, (id: string, forcar?: boolean) => Promise<void>, boolean] {
  const motor = useMotor();
  const [id, setId] = useState<string | undefined>(undefined);
  const [pronto, setPronto] = useState(false);
  useEffect(() => {
    if (!motor) return;
    let vivo = true;
    const carregar = () => {
      motor.chamar("estadoMundo", null).then((m) => (m ? motor.chamar("clubeDoGamer", null) : null)).then((r) => { if (vivo) { setId(r?.id); setPronto(true); } }).catch(() => vivo && setPronto(true));
    };
    carregar();
    window.addEventListener(EVENTO, carregar);
    window.addEventListener("raizes:mundo", carregar);
    return () => { vivo = false; window.removeEventListener(EVENTO, carregar); window.removeEventListener("raizes:mundo", carregar); };
  }, [motor]);
  const definir = useCallback(async (novo: string, forcar = false) => {
    if (!motor) return;
    await motor.chamar("escolherClube", { id: novo, forcar });
    window.dispatchEvent(new Event(EVENTO));
    window.dispatchEvent(new Event("raizes:tempo"));
  }, [motor]);
  return [id, definir, pronto];
}
