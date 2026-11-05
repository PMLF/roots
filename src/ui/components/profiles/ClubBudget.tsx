"use client";
import { useEffect, useState } from "react";
import type { ClubFinances } from "@/engine/api/contracts";
import { Data } from "@/ui/components/Card";
import { useEngine } from "@/ui/EngineProvider";
import { useT } from "@/ui/i18n/LocaleProvider";

type Budget = NonNullable<ClubFinances["budget"]>;

const STEP = 5000;

/**
 * Orçamento do teu clube. A margem salarial (por ano) e a verba de transferências partilham o mesmo bolo: o slider passa
 * dinheiro de uma para a outra (a verba nunca passa do que há em caixa nem a margem fica abaixo de zero).
 */
export function ClubBudget({ budget, balance }: { budget: Budget; balance?: number }) {
  const { t, locale } = useT();
  const engine = useEngine();
  const eur = new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const [current, setCurrent] = useState(budget);
  const [transfers, setTransfers] = useState(budget.transfers);
  const [error, setError] = useState<string>();
  useEffect(() => { setCurrent(budget); setTransfers(budget.transfers); }, [budget]);
  const margin = current.wageBillMax - current.currentBill;
  const pool = Math.max(0, margin) + current.transfers;
  const max = Math.floor(Math.min(pool, balance ?? pool) / STEP) * STEP;
  const shown = Math.min(transfers, max);
  const wageLeft = pool - shown;
  const commit = async () => {
    if (!engine || shown === current.transfers) return;
    try {
      const r = await engine.call("setBudget", { wageBillMax: current.currentBill + Math.max(0, pool - shown), transfers: shown });
      if (r.budget) { setCurrent(r.budget); setTransfers(r.budget.transfers); }
      setError(undefined);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  return (
    <>
      <Data lines={[
        { label: t("finances.wageBudget"), value: eur.format(current.currentBill + wageLeft) },
        { label: t("finances.wageLeft"), value: <span className={wageLeft < 0 ? "erro" : undefined}>{eur.format(wageLeft)}</span> },
        { label: t("finances.transferLeft"), value: eur.format(shown) },
      ]} />
      {max > 0 && margin >= 0 && (
        <label className="slider-orcamento">
          <span className="suave"><small>{t("finances.slider")}</small></span>
          <input type="range" min={0} max={max} step={STEP} value={shown} aria-label={t("finances.slider")}
            onChange={(e) => setTransfers(Number(e.target.value))} onPointerUp={() => void commit()} onKeyUp={() => void commit()} onBlur={() => void commit()} />
          <span className="slider-extremos"><small>{t("finances.sliderWages")}</small><small>{t("finances.sliderTransfers")}</small></span>
        </label>
      )}
      {error && <p className="erro" role="alert">{error}</p>}
    </>
  );
}
