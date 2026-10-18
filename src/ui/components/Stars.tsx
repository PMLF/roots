"use client";
import { useT } from "@/ui/i18n/LocaleProvider";

type Fill = "full" | "half" | "maybe" | "empty";

/** Cinco estrelas sempre visíveis: cheias até `value`, meias onde há meia; o intervalo de potencial (`range`) mostra a parte incerta com outro aspeto. */
export function Stars({ value, range }: { value?: number; range?: { low: number; high: number } }) {
  const { t } = useT();
  const solid = range ? range.low : (value ?? 0);
  const upper = range ? range.high : solid;
  const fills: Fill[] = [0, 1, 2, 3, 4].map((i) => {
    if (solid >= i + 1) return "full";
    if (solid >= i + 0.5) return "half";
    if (upper >= i + 1) return "maybe";
    if (upper >= i + 0.5) return "maybe";
    return "empty";
  });
  const fmt = (n: number) => String(n).replace(".", ",");
  const label = range && range.high > range.low ? t("stars.range", { low: fmt(range.low), high: fmt(range.high) }) : t("stars.value", { n: fmt(solid) });
  return (
    <span className="estrelas" role="img" aria-label={label} title={label}>
      {fills.map((f, i) => <span key={i} className={`estrela estrela-${f}`} aria-hidden="true">★</span>)}
    </span>
  );
}
