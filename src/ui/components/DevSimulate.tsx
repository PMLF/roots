"use client";
import { useState } from "react";
import { Icon } from "@/ui/components/Icon";
import { useT } from "@/ui/i18n/LocaleProvider";
import { useEngine } from "@/ui/EngineProvider";
import { useOwnClub } from "@/ui/myClub";

/** Só no modo developer: simula a época que está a decorrer até ao fim (jogos do clube confirmados com o onze e a tática atuais). */
export function DevSimulate() {
  const { t } = useT();
  const engine = useEngine();
  const [club] = useOwnClub();
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState<string | undefined>(undefined);
  const run = async () => {
    if (!engine || running) return;
    setRunning(true);
    setDone(undefined);
    try {
      for (let i = 0; i < 400; i++) {
        const r = await engine.call("advance", { mode: "week", ...(club ? { club } : {}) });
        if (r.pause) {
          await engine.call("confirmMatch", { match: r.pause.match });
          const d = await engine.call("advance", { mode: "day", ...(club ? { club } : {}) });
          if (d.seasonEnd) break;
          continue;
        }
        if (r.seasonEnd) break;
      }
      const s = await engine.call("timeState", null);
      setDone(s?.today);
    } catch (e) {
      setDone(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
      window.dispatchEvent(new Event("raizes:tempo"));
      window.dispatchEvent(new Event("raizes:mundo"));
    }
  };
  return (
    <li className="menu-interruptor">
      <button type="button" onClick={() => void run()} disabled={running} aria-busy={running || undefined} title={t("dev.simulate.hint")} data-testid="simular-epoca">
        <Icon name="lab" />
        {running ? t("dev.simulate.running") : t("dev.simulate.label")}
        {done && !running && <small className="suave">{done}</small>}
      </button>
    </li>
  );
}
