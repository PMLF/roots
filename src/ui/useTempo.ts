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
  const [pausa, setPausa] = useState<{ jogo: string; adversario: string; emCasa: boolean } | undefined>(undefined);
  const [proximoJogo, setProximoJogo] = useState<{ id: string; data: string; competicao: string; adversario: string; emCasa: boolean; confirmado: boolean } | undefined>(undefined);

  useEffect(() => {
    if (!motor) return;
    let vivo = true;
    const carregar = () => {
      motor.chamar("estadoMundo", null).then((m) => (m ? motor.chamar("estadoTempo", null) : null)).then(async (e) => {
        if (!vivo) return;
        setEstado(e);
        // há jogo do teu clube hoje, por confirmar?
        const p = e ? await motor.chamar("plano", null) : null;
        const j = p?.proximoJogo;
        if (vivo) setProximoJogo(e ? j : undefined);
        if (vivo) setPausa(e && j && j.data === e.hoje && !j.confirmado ? { jogo: j.id, adversario: j.adversario, emCasa: j.emCasa } : undefined);
      }).catch(() => vivo && setEstado(null));
    };
    const aoMudar = () => { forcar((n) => n + 1); carregar(); };
    carregar();
    window.addEventListener(EVENTO, aoMudar);
    window.addEventListener("raizes:mundo", aoMudar);
    return () => { vivo = false; window.removeEventListener(EVENTO, aoMudar); window.removeEventListener("raizes:mundo", aoMudar); };
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

  const confirmarEJogar = useCallback(async () => {
    if (!pausa || !motor) return;
    await motor.chamar("confirmarJogo", { jogo: pausa.jogo });
    await avancar("dia");
  }, [motor, pausa, avancar]);

  return { estado, ultimo, aAvancar, avancar, erro, pausa, proximoJogo, confirmarEJogar };
}
