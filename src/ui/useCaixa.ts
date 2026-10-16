"use client";
import { useEffect, useState } from "react";
import { useMotor } from "@/ui/MotorProvider";

/** Quantas mensagens por ler tem o gamer (o contador do menu). Atualiza com o tempo, o clube e a leitura. */
export function useCaixaNaoLidas(): number {
  const motor = useMotor();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!motor) return;
    let vivo = true;
    const carregar = () => {
      motor.chamar("estadoMundo", null).then((m) => (m ? motor.chamar("caixa", { limite: 1 }) : null)).then((c) => vivo && setN(c?.naoLidas ?? 0)).catch(() => undefined);
    };
    carregar();
    for (const e of ["raizes:tempo", "raizes:mundo", "raizes:meuClube", "raizes:caixa"]) window.addEventListener(e, carregar);
    return () => { vivo = false; for (const e of ["raizes:tempo", "raizes:mundo", "raizes:meuClube", "raizes:caixa"]) window.removeEventListener(e, carregar); };
  }, [motor]);
  return n;
}
