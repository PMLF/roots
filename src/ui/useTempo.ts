"use client";
import { useCallback, useEffect, useState } from "react";
import type { EstadoTempo, Modo, ResultadoAvanco } from "@/engine/epoca/avancar";
import { useMeuClube } from "@/ui/meuClube";
import { useMotor } from "@/ui/MotorProvider";

/** O tempo do save (data, época, jogos por jogar) e o botão Avançar. Todas as páginas partilham o mesmo estado. */
const EVENTO = "raizes:tempo";
let ultimo: ResultadoAvanco | undefined;
let aAvancar = false;

export function useTempo() {
  const motor = useMotor();
  const [clube] = useMeuClube();
  const [estado, setEstado] = useState<EstadoTempo | null | undefined>(undefined);
  const [, forcar] = useState(0);
  const [erro, setErro] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!motor) return;
    let vivo = true;
    const carregar = () => {
      motor.chamar("estadoMundo", null).then((m) => (m ? motor.chamar("estadoTempo", null) : null)).then((e) => vivo && setEstado(e)).catch(() => vivo && setEstado(null));
    };
    const aoMudar = () => { forcar((n) => n + 1); carregar(); };
    carregar();
    window.addEventListener(EVENTO, aoMudar);
    return () => { vivo = false; window.removeEventListener(EVENTO, aoMudar); };
  }, [motor]);

  const avancar = useCallback(async (modo: Modo) => {
    if (!motor || aAvancar) return;
    aAvancar = true;
    window.dispatchEvent(new Event(EVENTO));
    try {
      ultimo = await motor.chamar("avancar", { modo, ...(clube ? { clube } : {}) });
      setErro(undefined);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      aAvancar = false;
      window.dispatchEvent(new Event(EVENTO));
    }
  }, [motor, clube]);

  return { estado, ultimo, aAvancar, avancar, erro };
}
