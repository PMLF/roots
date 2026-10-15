"use client";
import { useEffect, useState } from "react";
import { useMotor } from "@/ui/MotorProvider";

let cache: Record<string, string> | undefined;

/** Nome do país a partir do id (`pt` → «Portugal»). Carrega-se uma vez. */
export function usePaises(): (id: string) => string {
  const motor = useMotor();
  const [mapa, setMapa] = useState<Record<string, string>>(cache ?? {});
  useEffect(() => {
    if (cache || !motor) return;
    let vivo = true;
    motor.chamar("paises", null).then((lista) => {
      cache = Object.fromEntries(lista.map((p) => [p.id, p.nome]));
      if (vivo) setMapa(cache);
    }).catch(() => undefined);
    return () => { vivo = false; };
  }, [motor]);
  return (id) => mapa[id] ?? id;
}
