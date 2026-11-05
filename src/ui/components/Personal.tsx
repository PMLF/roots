"use client";
import { useCallback, useEffect, useState } from "react";
import type { PersonalSpendingView, SpendOutcome } from "@/engine/api/contracts";
import { useEngine } from "@/ui/EngineProvider";
import type { Key } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";

/** O que o gamer faz com as poupanças (RZ-162): casa, curso de treinador, causas da cidade e ajuda ao clube. */
export function Personal() {
  const { t, locale } = useT();
  const engine = useEngine();
  const [view, setView] = useState<PersonalSpendingView | null | undefined>(undefined);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [cause, setCause] = useState(500);
  const [help, setHelp] = useState(5000);
  const money = new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const day = (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

  const load = useCallback(async () => {
    if (!engine) return;
    setView(await engine.call("personalSpending", null));
  }, [engine]);
  useEffect(() => { void load(); }, [load]);

  const run = async (call: () => Promise<SpendOutcome>) => {
    setBusy(true);
    try {
      const r = await call();
      setMessage(r.ok ? { ok: true, text: t("personal.done") } : { ok: false, text: t(`personal.reason.${r.reason}` as Key, { min: money.format(view?.minCause ?? 0) }) });
      await load();
    } finally { setBusy(false); }
  };

  if (view === undefined) return <p>{t("profile.loading")}</p>;
  if (view === null) return <section className="pagina-clube"><h1>{t("personal.title")}</h1><p className="vazio">{t("contract.none")}</p></section>;

  return (
    <section className="pagina-clube" data-testid="pessoal">
      <h1>{t("personal.title")}</h1>
      <p className="suave">{t("personal.intro", { balance: money.format(view.balance) })}</p>
      {message && <p className={message.ok ? "suave" : "erro"} role="status" data-testid="pessoal-msg">{message.text}</p>}
      <div className="cartoes">
        <div className="cartao" data-testid="pessoal-casa">
          <h2>{t("personal.home.title")}</h2>
          <p>{view.home.owned ? t("personal.home.owned", { pct: view.home.discountPct }) : t("personal.home.hint", { price: money.format(view.home.price), pct: view.home.discountPct })}</p>
          {!view.home.owned && <button type="button" disabled={busy || view.balance < view.home.price} onClick={() => void run(() => engine!.call("buyHome", null))} data-testid="comprar-casa">{t("personal.home.buy", { price: money.format(view.home.price) })}</button>}
        </div>
        <div className="cartao" data-testid="pessoal-curso">
          <h2>{t("personal.course.title")}</h2>
          <p>{t("personal.course.level", { level: view.course.level, max: view.course.max })}</p>
          {view.course.training && <p className="suave">{t("personal.course.training", { level: view.course.training.level, date: day(view.course.training.until) })}</p>}
          {!view.course.training && view.course.next && (
            <button type="button" disabled={busy || view.balance < view.course.next.cost} onClick={() => void run(() => engine!.call("startCourse", null))} data-testid="iniciar-curso">
              {t("personal.course.start", { level: view.course.next.level, cost: money.format(view.course.next.cost), days: view.course.next.days })}
            </button>
          )}
          {!view.course.training && !view.course.next && <p className="suave">{t("personal.course.done")}</p>}
        </div>
        <div className="cartao" data-testid="pessoal-causas">
          <h2>{t("personal.causes.title")}</h2>
          <p className="suave">{t("personal.causes.hint", { min: money.format(view.minCause), max: view.maxCausePoints })}</p>
          <label>
            <span>{t("personal.amount")}</span>
            <input type="number" min={view.minCause} step={100} value={cause} onChange={(e) => setCause(Number(e.target.value))} data-testid="causa-valor" />
          </label>
          <ul className="lista-simples">
            {view.causes.map((c) => (
              <li key={c.service}>
                <span>{t(`city.service.${c.service}` as Key)} · {t("personal.causes.points", { n: c.points.toFixed(1) })}</span>
                <button type="button" disabled={busy || cause < view.minCause || cause > view.balance || c.points >= view.maxCausePoints} onClick={() => void run(() => engine!.call("supportCause", { service: c.service, amount: cause }))} data-testid={`causa-${c.service}`}>{t("personal.causes.support")}</button>
              </li>
            ))}
          </ul>
        </div>
        <div className="cartao" data-testid="pessoal-clube">
          <h2>{t("personal.help.title")}</h2>
          <p className="suave">{t("personal.help.hint", { min: money.format(view.minHelp) })}</p>
          <label>
            <span>{t("personal.amount")}</span>
            <input type="number" min={view.minHelp} step={500} value={help} onChange={(e) => setHelp(Number(e.target.value))} data-testid="ajuda-valor" />
          </label>
          <button type="button" disabled={busy || help < view.minHelp || help > view.balance} onClick={() => void run(() => engine!.call("helpClub", { amount: help }))} data-testid="ajudar-clube">{t("personal.help.give")}</button>
        </div>
      </div>
    </section>
  );
}
