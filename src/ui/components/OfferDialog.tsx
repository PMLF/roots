"use client";
import { useEffect, useRef, useState } from "react";
import type { OfferAnswer, OfferView } from "@/engine/api/contracts";
import { CloseButton } from "@/ui/components/CloseButton";
import { useEngine } from "@/ui/EngineProvider";
import { useT } from "@/ui/i18n/LocaleProvider";
import type { Key } from "@/ui/i18n";

type Done = Extract<OfferAnswer, { ok: true }>["status"];

/**
 * Popup de uma proposta da IA por um jogador teu: aceitas o valor, rejeitas ou contrapropões (dropdown de valores).
 * Depois de contrapropor só se sai com acordo, rejeitando ou quando o comprador desiste.
 */
export function OfferDialog({ offer, onClose, onAnswered }: { offer: OfferView; onClose: () => void; onAnswered?: () => void }) {
  const { t, locale } = useT();
  const engine = useEngine();
  const ref = useRef<HTMLDialogElement>(null);
  const eur = new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const [current, setCurrent] = useState(offer);
  const [counter, setCounter] = useState(String(offer.suggestions[0] ?? offer.fee));
  const [result, setResult] = useState<Done | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  useEffect(() => { ref.current?.showModal(); }, []);

  const finished = result !== undefined && result !== "counter";
  const locked = !finished && current.round > 0;
  const send = async (input: { action: "accept" | "reject" } | { action: "counter"; fee: number }) => {
    if (!engine) return;
    setBusy(true);
    setError(undefined);
    try {
      const r = await engine.call("offerReply", { id: current.id, ...input } as Parameters<typeof engine.call<"offerReply">>[1]);
      if (!r.ok) { setError(t("offer.error")); return; }
      setResult(r.status);
      if (r.offer) { setCurrent(r.offer); setCounter(String(r.offer.suggestions[0] ?? r.offer.fee)); }
      onAnswered?.();
    } catch { setError(t("offer.error")); } finally { setBusy(false); }
  };
  const message = result === undefined ? undefined
    : result === "counter" ? { tone: "aviso", text: t("offer.counter", { club: current.buyer.name, fee: eur.format(current.fee), left: current.roundsLeft }) }
    : { tone: result === "done" ? "ok" : "erro", text: t(`offer.result.${result}` as Key, { name: current.name, club: current.buyer.name }) };
  const values = [...new Set([...current.suggestions, Number(counter)].filter((v) => v > current.fee))].sort((a, b) => a - b);

  return (
    <dialog ref={ref} className="popup popup-renovacao" aria-labelledby="h-offer" onClose={onClose} onCancel={(e) => { if (locked) e.preventDefault(); }} onClick={(e) => { if (e.target === ref.current && !locked) ref.current?.close(); }}>
      {!locked && <CloseButton onClose={() => ref.current?.close()} />}
      <h2 id="h-offer">{t("offer.title", { name: current.name })}</h2>
      <div className="formulario renovacao-form">
        <p>{t("offer.summary", { club: current.buyer.name, fee: eur.format(current.fee) })}</p>
        <p className="suave">
          {t("offer.contract", { wage: eur.format(current.wage), years: current.years })}
          {` · ${t("offer.currentWage", { wage: eur.format(current.currentWage) })}`}
          {` · ${t("offer.value", { value: eur.format(current.value) })}`}
          {` · ${t("offer.expires", { date: current.expires })}`}
        </p>
        {!finished && (
          <label>
            <span>{t("offer.counterField")}</span>
            <select disabled={busy || values.length === 0} value={counter} onChange={(e) => setCounter(e.target.value)}>
              {values.map((v) => <option key={v} value={v}>{eur.format(v)}</option>)}
            </select>
          </label>
        )}
        {locked && <p className="suave"><small>{t("offer.locked")}</small></p>}
        {message && <p className={`mensagem-renovacao ${message.tone}`} role="status">{message.text}</p>}
        {error && <p className="erro" role="alert">{error}</p>}
        <div className="acoes-popup">
          {!finished && <button type="button" disabled={busy} onClick={() => void send({ action: "accept" })}>{t("offer.accept")}</button>}
          {!finished && <button type="button" className="secundario" disabled={busy || values.length === 0} onClick={() => void send({ action: "counter", fee: Number(counter) })}>{t("offer.makeCounter")}</button>}
          {!finished && <button type="button" className="secundario" disabled={busy} onClick={() => void send({ action: "reject" })}>{t("offer.reject")}</button>}
          {!locked && <button type="button" className="secundario" onClick={() => ref.current?.close()}>{t("renewals.close")}</button>}
        </div>
      </div>
    </dialog>
  );
}
