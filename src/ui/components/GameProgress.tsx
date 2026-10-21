"use client";
import { useEffect, useState } from "react";
import { useT } from "@/ui/i18n/LocaleProvider";
import { useEngine } from "@/ui/EngineProvider";

type Progress = { minute: number; duration: number } | null;

/** Progresso do jogo do gamer: a página do jogo avisa a cada minuto; ao abrir a app com um jogo a meio, lê o estado uma vez. */
export function useMatchProgress(): Progress {
  const engine = useEngine();
  const [p, setP] = useState<Progress>(null);
  useEffect(() => {
    const listen = (e: Event) => setP((e as CustomEvent<Progress>).detail);
    window.addEventListener("raizes:jogoEmCurso", listen);
    return () => window.removeEventListener("raizes:jogoEmCurso", listen);
  }, []);
  useEffect(() => {
    if (!engine) return;
    let live = true;
    engine.call("liveMatch", {}).then((j) => { if (live && j?.ongoing) setP((current) => current ?? { minute: j.minute ?? 0, duration: j.duration }); }).catch(() => undefined);
    return () => { live = false; };
  }, [engine]);
  return p;
}

/** Fio de 2 px por cima do rodapé com o progresso do jogo do gamer. Só existe enquanto o jogo decorre. */
export function MatchProgress() {
  const { t } = useT();
  const p = useMatchProgress();
  if (!p) return null;
  const pct = Math.min(100, Math.max(0, (p.minute / p.duration) * 100));
  return (
    <div className="progresso-jogo" role="progressbar" aria-label={t("match.progress")} aria-valuemin={0} aria-valuemax={p.duration} aria-valuenow={Math.floor(p.minute)}>
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}
