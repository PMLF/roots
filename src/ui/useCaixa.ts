"use client";
import { useEffect, useState } from "react";
import type { Mensagem as MensagemCaixa } from "@/engine/noticias/noticias";
import { useMotor } from "@/ui/MotorProvider";

const EVENTOS = ["raizes:tempo", "raizes:mundo", "raizes:meuClube", "raizes:caixa"];

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

/** As mensagens mais recentes da caixa e quantas estão por ler (cartão da página inicial). Não as marca como lidas. */
export function useCaixaRecente(limite: number): { mensagens: MensagemCaixa[]; naoLidas: number } {
  const motor = useMotor();
  const [r, setR] = useState<{ mensagens: MensagemCaixa[]; naoLidas: number }>({ mensagens: [], naoLidas: 0 });
  useEffect(() => {
    if (!motor) return;
    let vivo = true;
    const carregar = () => {
      motor.chamar("estadoMundo", null).then((m) => (m ? motor.chamar("caixa", { limite }) : null)).then((c) => vivo && setR(c ?? { mensagens: [], naoLidas: 0 })).catch(() => undefined);
    };
    carregar();
    for (const e of EVENTOS) window.addEventListener(e, carregar);
    return () => { vivo = false; for (const e of EVENTOS) window.removeEventListener(e, carregar); };
  }, [motor, limite]);
  return r;
}
