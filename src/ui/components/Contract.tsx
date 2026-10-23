"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { ClubOffer, ContractReply, ContractTerms, GamerContractView } from "@/engine/api/contracts";
import { useEngine } from "@/ui/EngineProvider";
import type { Key } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";

type Setup = { mode: "offer"; offer: ClubOffer } | { mode: "raise"; view: GamerContractView };

/**
 * Contrato do gamer (RZ-161): propõe salário e duração ao presidente, ao aceitar uma oferta (`?club=`) ou para pedir um aumento no
 * clube atual. O presidente aceita, contrapropõe ou recusa; recusar deixa ressentimento.
 */
export function Contract() {
  const { t, locale } = useT();
  const engine = useEngine();
  const [setup, setSetup] = useState<Setup | null | undefined>(undefined);
  const [wage, setWage] = useState(0);
  const [years, setYears] = useState(2);
  const [answer, setAnswer] = useState<ContractReply | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const money = new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const day = (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

  useEffect(() => {
    if (!engine) return;
    let live = true;
    const id = new URLSearchParams(window.location.search).get("club");
    (async () => {
      if (id) {
        const o = await engine.call("offers", null);
        const offer = o.offers.find((x) => x.id === id);
        if (!live) return;
        if (!offer) { setSetup(null); return; }
        setSetup({ mode: "offer", offer });
        setWage(offer.wage);
        setYears(offer.defaultYears);
      } else {
        const view = await engine.call("gamerContract", null);
        if (!live) return;
        if (!view) { setSetup(null); return; }
        setSetup({ mode: "raise", view });
        setWage(Math.round((view.monthlyWage * 1.1) / 10) * 10);
        setYears(Math.min(view.yearsMax, Math.max(view.yearsMin, 2)));
      }
    })().catch((e) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => { live = false; };
  }, [engine]);

  if (setup === undefined) return <p>{t("profile.loading")}</p>;
  if (setup === null) return <section className="pagina-clube"><h1>{t("contract.title")}</h1><p className="vazio" data-testid="contrato-vazio">{t("contract.none")}</p></section>;

  const range = setup.mode === "offer" ? [setup.offer.yearsMin, setup.offer.yearsMax] : [setup.view.yearsMin, setup.view.yearsMax];
  const reference = setup.mode === "offer" ? setup.offer.wage : setup.view.reference;
  const clubName = setup.mode === "offer" ? setup.offer.name : setup.view.clubName;
  const locked = setup.mode === "raise" && !setup.view.canAsk;

  const send = async (terms: ContractTerms) => {
    if (!engine) return;
    setBusy(true);
    setError(undefined);
    try {
      const r = setup.mode === "offer" ? await engine.call("negotiateOffer", { id: setup.offer.id, terms }) : await engine.call("askRaise", { terms });
      setAnswer(r);
      if (r.result === "accepted") {
        window.dispatchEvent(new Event("raizes:meuClube"));
        window.dispatchEvent(new Event("raizes:tempo"));
      } else if (setup.mode === "raise") {
        const view = await engine.call("gamerContract", null);
        if (view) setSetup({ mode: "raise", view });
      }
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };

  return (
    <section className="pagina-clube" data-testid="contrato">
      <h1>{t("contract.title")}</h1>
      <p className="suave">{setup.mode === "offer" ? t("contract.introOffer", { club: clubName }) : t("contract.introRaise", { club: clubName })}</p>
      {setup.mode === "raise" && (
        <div className="cartao">
          <p><b>{t("contract.current")}</b>: {money.format(setup.view.monthlyWage)} {t("contract.perMonth")} · {t("contract.until", { date: day(setup.view.end) })}</p>
        </div>
      )}
      <div className="cartao contrato-form">
        <label>
          <span>{t("contract.wage")}</span>
          <input type="number" min={100} step={50} value={wage} onChange={(e) => setWage(Number(e.target.value))} disabled={busy || locked || answer?.result === "accepted"} data-testid="contrato-salario" />
          <span className="suave">{t("contract.reference", { value: money.format(reference) })}</span>
        </label>
        <label>
          <span>{t("contract.years")}</span>
          <select value={years} onChange={(e) => setYears(Number(e.target.value))} disabled={busy || locked || answer?.result === "accepted"} data-testid="contrato-anos">
            {Array.from({ length: range[1]! - range[0]! + 1 }, (_, i) => range[0]! + i).map((y) => <option key={y} value={y}>{t("contract.yearsCount", { n: y })}</option>)}
          </select>
        </label>
        <button type="button" className="primario" disabled={busy || locked || wage < 100 || answer?.result === "accepted"} onClick={() => void send({ monthlyWage: wage, years })} data-testid="contrato-propor">
          {setup.mode === "offer" ? t("contract.propose") : t("contract.askRaise")}
        </button>
        {setup.mode === "offer" && answer?.result !== "accepted" && <Link href="/" className="suave">{t("contract.back")}</Link>}
      </div>
      {locked && setup.mode === "raise" && setup.view.askFrom && <p className="suave" data-testid="contrato-cedo">{t("contract.askFrom", { date: day(setup.view.askFrom) })}</p>}
      {answer && (
        <div className={`cartao contrato-resposta resposta-${answer.result}`} role="status" data-testid={`contrato-${answer.result}`}>
          {answer.result === "accepted" && (
            <>
              <p><b>{t(setup.mode === "offer" ? "contract.accepted.offer" : "contract.accepted.raise")}</b> {t("contract.terms", { wage: money.format(answer.terms.monthlyWage), years: answer.terms.years })}</p>
              <Link href="/club/" className="primario">{t("contract.goClub")}</Link>
            </>
          )}
          {answer.result === "counter" && (
            <>
              <p><b>{t("contract.counter")}</b> {t("contract.terms", { wage: money.format(answer.terms.monthlyWage), years: answer.terms.years })} <span className="suave">{t(`contract.reason.${answer.reason}` as Key)}</span></p>
              <button type="button" className="primario" disabled={busy} onClick={() => void send(answer.terms)} data-testid="contrato-aceitar-contra">{t("contract.acceptCounter")}</button>
            </>
          )}
          {answer.result === "refused" && <p><b>{t("contract.refused")}</b> <span className="suave">{t(`contract.reason.${answer.reason}` as Key)}</span></p>}
        </div>
      )}
      {error && <p className="erro">{error}</p>}
    </section>
  );
}
