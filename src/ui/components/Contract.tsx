"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { ClubOffer, ContractReply, ContractTerms, GamerContractView, PersonalBankView } from "@/engine/api/contracts";
import { Icon } from "@/ui/components/Icon";
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
  const [clause, setClause] = useState(6);
  const [answer, setAnswer] = useState<ContractReply | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [bank, setBank] = useState<PersonalBankView | null>(null);
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
        setClause(offer.clause.default);
      } else {
        const view = await engine.call("gamerContract", null);
        if (!live) return;
        if (!view) { setSetup(null); return; }
        setSetup({ mode: "raise", view });
        const b = await engine.call("personalBank", null);
        if (live) setBank(b);
        setWage(Math.round((view.monthlyWage * 1.1) / 10) * 10);
        setYears(Math.min(view.yearsMax, Math.max(view.yearsMin, 2)));
        setClause(view.clause.months);
      }
    })().catch((e) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => { live = false; };
  }, [engine]);

  if (setup === undefined) return <p>{t("profile.loading")}</p>;
  if (setup === null) return <section className="pagina-clube"><h1>{t("contract.title")}</h1><p className="vazio" data-testid="contrato-vazio">{t("contract.none")}</p></section>;

  const range = setup.mode === "offer" ? [setup.offer.yearsMin, setup.offer.yearsMax] : [setup.view.yearsMin, setup.view.yearsMax];
  const reference = setup.mode === "offer" ? setup.offer.wage : setup.view.reference;
  const clubName = setup.mode === "offer" ? setup.offer.name : setup.view.clubName;
  const clauseRange = setup.mode === "offer" ? setup.offer.clause : setup.view.clause;
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

  const done = answer?.result === "accepted";
  const view = setup.mode === "raise" ? setup.view : undefined;

  return (
    <section className="pagina-clube" data-testid="contrato">
      <h1>{t("contract.title")}</h1>
      <p className="suave">{setup.mode === "offer" ? t("contract.introOffer", { club: clubName }) : t("contract.introRaise", { club: clubName })}</p>
      {view?.expiring && (
        <div className="resultado-negocio aviso" role="status" data-testid="contrato-a-acabar"><Icon name="warning" /><span>{t(view.daysLeft > 0 ? "contract.expiring" : "contract.expired", { days: Math.max(0, view.daysLeft) })}</span></div>
      )}
      {view && view.trust !== "good" && (
        <div className={`resultado-negocio ${view.trust === "danger" ? "erro" : "aviso"}`} role="status" data-testid="contrato-confianca"><Icon name="warning" /><span>{t(view.trust === "danger" ? "contract.trust.danger" : "contract.trust.concerned")}</span></div>
      )}
      <div className="cartao" data-testid="contrato-atual">
        <h2>{t("contract.current")}</h2>
        <dl className="dados">
          {view && <div><dt>{t("contract.wage")}</dt><dd><b>{money.format(view.monthlyWage)}</b> {t("contract.perMonth")}</dd></div>}
          {view && <div><dt>{t("contract.endsOn")}</dt><dd>{day(view.end)}{view.daysLeft > 0 && <span className="suave"> · {t("contract.daysLeft", { n: view.daysLeft })}</span>}</dd></div>}
          {view && <div><dt>{t("contract.clause")}</dt><dd>{money.format(view.clause.amount)} <span className="suave">· {t("contract.clauseMonths", { n: view.clause.months })}</span></dd></div>}
          {view?.objective && <div><dt>{t("contract.objective")}</dt><dd>{t(view.objective.rank === 1 ? "contract.objectiveChampion" : "contract.objectiveValue", { rank: view.objective.rank, of: view.objective.of })}</dd></div>}
          {view?.objective && <div><dt>{t("contract.objectiveBonus")}</dt><dd>{money.format(view.objective.bonus)}</dd></div>}
          <div><dt>{t("contract.referenceLabel")}</dt><dd>{money.format(reference)} {t("contract.perMonth")}</dd></div>
        </dl>
      </div>
      <div className="cartao contrato-form" data-testid="contrato-propostas">
        <h2>{t("contract.proposeTitle")}</h2>
        <div className="formulario">
          <label>
            <span>{t("contract.wageField")}</span>
            <input type="number" min={100} step={50} value={wage} onChange={(e) => setWage(Number(e.target.value))} disabled={busy || locked || done} data-testid="contrato-salario" />
          </label>
          <label>
            <span>{t("contract.years")}</span>
            <select value={years} onChange={(e) => setYears(Number(e.target.value))} disabled={busy || locked || done} data-testid="contrato-anos">
              {Array.from({ length: range[1]! - range[0]! + 1 }, (_, i) => range[0]! + i).map((y) => <option key={y} value={y}>{t("contract.yearsCount", { n: y })}</option>)}
            </select>
          </label>
          <label>
            <span>{t("contract.clauseField")}</span>
            <select value={clause} onChange={(e) => setClause(Number(e.target.value))} disabled={busy || locked || done} data-testid="contrato-clausula">
              {Array.from({ length: clauseRange.max - clauseRange.min + 1 }, (_, i) => clauseRange.min + i).map((m) => <option key={m} value={m}>{t("contract.clauseMonths", { n: m })}</option>)}
            </select>
          </label>
        </div>
        <p className="suave">{t("contract.clauseHint")}</p>
        <div className="contrato-acoes">
          {locked && view?.askFrom ? <span className="suave" data-testid="contrato-cedo">{t("contract.askFrom", { date: day(view.askFrom) })}</span> : <span />}
          {setup.mode === "offer" && !done && <Link href="/" className="botao">{t("contract.back")}</Link>}
          <button type="button" className="primario" disabled={busy || locked || wage < 100 || done} onClick={() => void send({ monthlyWage: wage, years, clauseMonths: clause })} data-testid="contrato-propor">
            {setup.mode === "offer" ? t("contract.propose") : t("contract.askRaise")}
          </button>
        </div>
      </div>
      {answer && (
        <div className={`resultado-negocio ${answer.result === "accepted" ? "ok" : answer.result === "counter" ? "aviso" : "erro"} contrato-resposta`} role="status" data-testid={`contrato-${answer.result}`}>
          <Icon name={answer.result === "accepted" ? "check" : "warning"} />
          <div>
            {answer.result === "accepted" && (
              <>
                <b>{t(setup.mode === "offer" ? "contract.accepted.offer" : "contract.accepted.raise")}</b>
                <span>{t("contract.terms", { wage: money.format(answer.terms.monthlyWage), years: answer.terms.years, clause: answer.terms.clauseMonths ?? clause })}</span>
              </>
            )}
            {answer.result === "counter" && (
              <>
                <b>{t("contract.counter")}</b>
                <span>{t("contract.terms", { wage: money.format(answer.terms.monthlyWage), years: answer.terms.years, clause: answer.terms.clauseMonths ?? clause })} {t(`contract.reason.${answer.reason}` as Key)}</span>
              </>
            )}
            {answer.result === "refused" && (
              <>
                <b>{t("contract.refused")}</b>
                <span>{t(`contract.reason.${answer.reason}` as Key)}</span>
              </>
            )}
          </div>
          {answer.result === "accepted" && <Link href="/club/" className="primario botao">{t("contract.goClub")}</Link>}
          {answer.result === "counter" && <button type="button" className="primario" disabled={busy} onClick={() => void send(answer.terms)} data-testid="contrato-aceitar-contra">{t("contract.acceptCounter")}</button>}
        </div>
      )}
      {setup.mode === "raise" && bank && (
        <div className="cartao" data-testid="conta-pessoal">
          <h2>{t("bank.title")}</h2>
          <dl className="dados">
            <div><dt>{t("bank.balance")}</dt><dd><b>{money.format(bank.balance)}</b></dd></div>
            <div><dt>{t("bank.net")}</dt><dd>{money.format(bank.monthlyNet)} {t("contract.perMonth")}</dd></div>
            <div><dt>{t("bank.living", { city: bank.city })}</dt><dd>{money.format(bank.living)} {t("contract.perMonth")}</dd></div>
            <div><dt>{t("bank.savings")}</dt><dd><b>{money.format(bank.savings)}</b> {t("contract.perMonth")}</dd></div>
          </dl>
          <p className="suave">{t("bank.hint")}</p>
          <Link href="/personal/" data-testid="ir-pessoal">{t("personal.link")}</Link>
        </div>
      )}
      {error && <p className="erro">{error}</p>}
    </section>
  );
}
