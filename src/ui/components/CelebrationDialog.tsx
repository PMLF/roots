"use client";
import { useEffect, useRef } from "react";
import { Icon } from "@/ui/components/Icon";
import { useT } from "@/ui/i18n/LocaleProvider";

/** Cores do confetti: as do clube do gamer, ou as da bandeira à falta delas. */
const FALLBACK = ["#d4a017", "#1f7a3a", "#c0392b", "#f5f5f5"];
const PIECES = 36;

/** Popup celebrativo quando o clube do gamer é campeão: chuva de confetti (CSS, só se o sistema permitir animações). */
export function CelebrationDialog({ club, competition, cup, colours = FALLBACK, onClose }: { club: string; competition: string; cup: boolean; colours?: string[]; onClose: () => void }) {
  const { t } = useT();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  const palette = colours.length > 0 ? colours : FALLBACK;
  return (
    <dialog ref={ref} className="popup popup-celebracao" aria-labelledby="h-celebration" onClose={onClose}>
      <div className="confetti" aria-hidden="true">
        {Array.from({ length: PIECES }, (_, i) => (
          <i key={i} style={{ left: `${(i * 97) % 100}%`, background: palette[i % palette.length], animationDelay: `${(i % 9) * 0.18}s`, animationDuration: `${2.6 + (i % 5) * 0.4}s` }} />
        ))}
      </div>
      <span className="trofeu"><Icon name="competitions" /></span>
      <p className="suave">{t("celebration.title")}</p>
      <h2 id="h-celebration">{t(cup ? "celebration.cup" : "celebration.league", { club, competition })}</h2>
      <p>{t(cup ? "celebration.cupSub" : "celebration.leagueSub")}</p>
      <div className="acoes-popup">
        <button type="button" className="primario" autoFocus onClick={() => ref.current?.close()}>{t("celebration.close")}</button>
      </div>
    </dialog>
  );
}
