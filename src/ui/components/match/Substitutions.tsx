"use client";
import type { LiveSubs } from "@/engine/season/liveMatch";
import { useT } from "@/ui/i18n/LocaleProvider";

/** Barrinhas com o que resta: uma por substituição (5) e uma por pausa (3). */
export function SubsCounters({ subs }: { subs: LiveSubs }) {
  const { t } = useT();
  const bars = (used: number, max: number, label: string) => (
    <span className="contador-subs" role="img" aria-label={`${label}: ${max - used} / ${max}`}>
      <span>{label}</span>
      <span className="contador-barras" aria-hidden="true">
        {Array.from({ length: max }, (_, i) => <i key={i} className={i < max - used ? "free" : "gasta"} />)}
      </span>
    </span>
  );
  return <span className="contadores-subs">{bars(subs.used, subs.max, t("match.subs.subsCount"))}{bars(subs.usedPauses, subs.pausesMax, t("match.subs.pauseCount"))}</span>;
}
