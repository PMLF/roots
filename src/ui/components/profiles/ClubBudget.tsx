"use client";
import type { ClubFinances } from "@/engine/api/contracts";
import { Data } from "@/ui/components/Card";
import { useT } from "@/ui/i18n/LocaleProvider";

type Budget = NonNullable<ClubFinances["budget"]>;

/** Orçamento do teu clube. Quem o fixa é o presidente: aqui só se vê o que resta e o total salarial. */
export function ClubBudget({ budget }: { budget: Budget }) {
  const { t, locale } = useT();
  const eur = new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const left = budget.wageBillMax - budget.currentBill;
  return (
    <Data lines={[
      { label: t("finances.wageBudget"), value: eur.format(budget.wageBillMax) },
      { label: t("finances.wageLeft"), value: <span className={left < 0 ? "error" : undefined}>{eur.format(left)}{left < 0 ? ` · ${t("finances.aboveBudget")}` : ""}</span> },
      { label: t("finances.transferLeft"), value: eur.format(budget.transfers) },
    ]} />
  );
}
