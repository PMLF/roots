"use client";
import { useState } from "react";
import type { ClubFinances } from "@/engine/api/contratos";
import { useEngine } from "@/ui/MotorProvider";
import { Data } from "@/ui/components/Cartao";
import { useT } from "@/ui/i18n/LocaleProvider";

type Budget = NonNullable<ClubFinances["budget"]>;

/** O orçamento anual do teu clube: massa salarial máxima e verba para transferências, editáveis. */
export function ClubBudget({ initial, balance }: { initial: Budget; balance: number }) {
  const { t, locale } = useT();
  const engine = useEngine();
  const eur = new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const [budget, setBudget] = useState(initial);
  const [bill, setBill] = useState(String(initial.wageBillMax));
  const [transfer, setTransfer] = useState(String(initial.transfers));
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      if (!engine) return;
      const f = await engine.call("setBudget", { wageBillMax: Number(bill), transfers: Number(transfer) });
      if (f.budget) { setBudget(f.budget); setBill(String(f.budget.wageBillMax)); setTransfer(String(f.budget.transfers)); }
      setError(undefined);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setSaving(false); }
  };
  return (
    <div className="orcamento-clube">
      <Data lines={[
        { label: t("financas.massaAtual"), value: <span className={budget.above ? "error" : undefined}>{eur.format(budget.currentBill)} {budget.above ? `· ${t("financas.acimaOrcamento")}` : ""}</span> },
      ]} />
      <form className="formulario" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <label>{t("financas.massaMax")}{" "}
          <input type="number" min={0} step={1000} value={bill} onChange={(e) => setBill(e.target.value)} />
        </label>
        <label>{t("financas.verbaTransferencias")}{" "}
          <input type="number" min={0} max={Math.max(0, Math.floor(balance))} step={1000} value={transfer} onChange={(e) => setTransfer(e.target.value)} />
        </label>
        <button type="submit" disabled={saving}>{t("financas.guardarOrcamento")}</button>
      </form>
      {error && <p className="erro" role="alert">{error}</p>}
    </div>
  );
}
