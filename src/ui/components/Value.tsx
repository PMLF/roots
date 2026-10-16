"use client";
import { useT } from "@/ui/i18n/LocaleProvider";
import type { ShownValue } from "@/ui/value";

/** Exato, estimado (≈) e desatualizado têm aspeto diferente e dizem-no a quem usa leitor de ecrã. */
export function Value({ v }: { v: ShownValue }) {
  const { t } = useT();
  const rating = v.state === "outdated" ? t("value.seenAgo", { seasons: v.sinceSeasons ?? 0 }) : v.state === "estimated" ? t("value.estimated") : undefined;
  return (
    <span className={`valor valor-${v.state}`} title={rating}>
      {v.text}
      {v.state === "outdated" && <small className="valor-nota"> · {rating}</small>}
    </span>
  );
}
