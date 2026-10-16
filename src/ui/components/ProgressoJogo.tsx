"use client";
import { useEffect, useState } from "react";
import { useT } from "@/ui/i18n/LocaleProvider";
import { useMotor } from "@/ui/MotorProvider";

type Progresso = { minuto: number; duracao: number } | null;

/** O jogo do gamer está a decorrer (a página do jogo avisa a cada minuto). */
export function useJogoEmCurso(): boolean {
  const [em, setEm] = useState(false);
  useEffect(() => {
    const ouvir = (e: Event) => setEm((e as CustomEvent<Progresso>).detail !== null);
    window.addEventListener("raizes:jogoEmCurso", ouvir);
    return () => window.removeEventListener("raizes:jogoEmCurso", ouvir);
  }, []);
  return em;
}

/**
 * Fio de 2 px por cima do rodapé com o progresso do jogo do gamer. Só existe enquanto o jogo decorre (a página do jogo avisa a
 * cada minuto); ao abrir a app com um jogo a meio, lê o estado uma vez.
 */
export function ProgressoJogo() {
  const { t } = useT();
  const motor = useMotor();
  const [p, setP] = useState<Progresso>(null);
  useEffect(() => {
    const ouvir = (e: Event) => setP((e as CustomEvent<Progresso>).detail);
    window.addEventListener("raizes:jogoEmCurso", ouvir);
    return () => window.removeEventListener("raizes:jogoEmCurso", ouvir);
  }, []);
  useEffect(() => {
    if (!motor) return;
    let vivo = true;
    motor.chamar("jogoAoVivo", {}).then((j) => { if (vivo && j?.emCurso) setP((atual) => atual ?? { minuto: j.minuto ?? 0, duracao: j.duracao }); }).catch(() => undefined);
    return () => { vivo = false; };
  }, [motor]);
  if (!p) return null;
  const pct = Math.min(100, Math.max(0, (p.minuto / p.duracao) * 100));
  return (
    <div className="progresso-jogo" role="progressbar" aria-label={t("jogo.progresso")} aria-valuemin={0} aria-valuemax={p.duracao} aria-valuenow={Math.floor(p.minuto)}>
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}
