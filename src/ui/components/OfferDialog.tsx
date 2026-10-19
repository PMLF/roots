"use client";
import { useEffect, useRef, useState } from "react";
import type { OfferAnswer, OfferView } from "@/engine/api/contracts";
import { CloseButton } from "@/ui/components/CloseButton";
import { ClubSwatch } from "@/ui/components/ClubSwatch";
import { Data } from "@/ui/components/Card";
import { Icon } from "@/ui/components/Icon";
import { EntityLink } from "@/ui/components/Link";
import { namePosition } from "@/ui/i18n/position";
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
  const banner = result === undefined || result === "counter" ? undefined
    : { tone: result === "done" ? "ok" : "erro", text: t(`offer.result.${result}` as Key, { name: current.name, club: current.buyer.name }) };
  const message = result === "counter" ? t("offer.counter", { club: current.buyer.name, fee: eur.format(current.fee) }) : undefined;
  const values = [...new Set([...current.suggestions, Number(counter)].filter((v) => v > current.fee))].sort((a, b) => a - b);
  const info = [
    { label: t("offer.info.player"), value: <EntityLink k="person" id={current.person}>{current.name}</EntityLink> },
    { label: t("bid.info.position"), value: namePosition(t, current.position) },
    { label: t("bid.info.age"), value: current.age },
    { label: t("offer.info.buyer"), value: <span className="clube-linha"><ClubSwatch id={current.buyer.id} /> <EntityLink k="club" id={current.buyer.id}>{current.buyer.name}</EntityLink></span> },
    { label: t("offer.info.fee"), value: <b>{eur.format(current.fee)}</b> },
    { label: t("offer.info.value"), value: eur.format(current.value) },
    { label: t("offer.info.wageNow"), value: eur.format(current.currentWage) },
    { label: t("offer.info.wageOffered"), value: `${eur.format(current.wage)} · ${t("renewals.years", { n: current.years })}` },
    { label: t("offer.info.expires"), value: current.expires },
  ];

  return (
    <dialog ref={ref} className="popup popup-renovacao" aria-labelledby="h-offer" onClose={onClose} onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}>
      <CloseButton onClose={() => ref.current?.close()} />
      <h2 id="h-offer">{t("offer.title", { name: current.name })}</h2>
      <div className="formulario renovacao-form">
        <Data lines={info} />
        {banner && <div className={`resultado-negocio ${banner.tone}`} role="status"><Icon name={banner.tone === "ok" ? "check" : "close"} /><div><b>{t(banner.tone === "ok" ? "offer.banner.done" : "offer.banner.closed")}</b><span>{banner.text}</span></div></div>}
        {!finished && (
          <label className={result === "counter" ? "alterado" : undefined}>
            <span>{t("offer.counterField")}</span>
            <select disabled={busy || values.length === 0} value={counter} onChange={(e) => setCounter(e.target.value)}>
              {values.map((v) => <option key={v} value={v}>{eur.format(v)}</option>)}
            </select>
          </label>
        )}
        {message && <p className="mensagem-renovacao aviso" role="status">{message}</p>}
        {error && <p className="erro" role="alert">{error}</p>}
        {!finished && (
          <div className="acoes-popup">
            <button type="button" className="perigo" disabled={busy} onClick={() => void send({ action: "reject" })}>{t("offer.reject")}</button>
            <button type="button" className="secundario" disabled={busy || values.length === 0} onClick={() => void send({ action: "counter", fee: Number(counter) })}>{t("offer.makeCounter")}</button>
            <button type="button" className="primario" disabled={busy} onClick={() => void send({ action: "accept" })}>{t("offer.accept")}</button>
          </div>
        )}
      </div>
    </dialog>
  );
}
