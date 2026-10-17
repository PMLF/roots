"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { NegotiationResult, RenewalLine } from "@/engine/api/contracts";
import { CloseButton } from "@/ui/components/CloseButton";
import { useEngine } from "@/ui/EngineProvider";
import { useT } from "@/ui/i18n/LocaleProvider";
import type { Key } from "@/ui/i18n";

type Field = "wage" | "years" | "release";
type Form = { wage: string; years: string; release: string; noClause: boolean };

const toForm = (x: { wage: number; years: number; release: number | null }): Form => ({ wage: String(x.wage), years: String(x.years), release: x.release === null ? "" : String(x.release), noClause: x.release === null });

/**
 * Popup de renovação: propões ordenado, duração e cláusula de rescisão; o agente aceita, contrapropõe (os campos que mudou ficam
 * assinalados) ou fecha a porta. Podes voltar a propor até haver acordo, o agente recusar ou desistires.
 */
export function RenewalDialog({ person, name, onClose, onAgreed }: { person: string; name: string; onClose: () => void; onAgreed?: () => void }) {
  const { t, locale } = useT();
  const engine = useEngine();
  const ref = useRef<HTMLDialogElement>(null);
  const eur = new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const [line, setLine] = useState<RenewalLine | undefined>(undefined);
  const [form, setForm] = useState<Form | undefined>(undefined);
  const [changed, setChanged] = useState<Partial<Record<Field, string>>>({});
  const [reply, setReply] = useState<NegotiationResult | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => { ref.current?.showModal(); }, []);
  const load = useCallback(() => {
    engine?.call("renewals", null).then((d) => {
      const l = d.lines.find((x) => x.id === person);
      setLine(l);
      if (l) setForm((f) => f ?? toForm(l.decision?.kind === "renew" ? l.decision : { wage: l.currentWage, years: l.ask.years, release: l.currentRelease ?? null }));
    }).catch(() => setError(t("renewals.error")));
  }, [engine, person, t]);
  useEffect(() => { load(); }, [load]);

  const closedReason = reply?.status === "closed" ? reply.reason : line?.negotiation?.closed;
  const agreed = reply?.status === "accepted" || line?.decision?.kind === "renew";
  const finished = Boolean(closedReason) || agreed || line?.decision?.kind === "release";

  const edit = (patch: Partial<Form>, field: Field) => {
    setForm((f) => (f ? { ...f, ...patch } : f));
    setChanged((c) => { const rest = { ...c }; delete rest[field]; return rest; });
  };

  const propose = async () => {
    if (!form || !line) return;
    const wage = Math.round(Number(form.wage)), years = Math.round(Number(form.years));
    const release = form.noClause ? null : Math.round(Number(form.release));
    if (!(wage > 0) || !(years >= 1) || (release !== null && !(release > 0))) { setError(t("renewals.invalid")); return; }
    setError(undefined);
    setBusy(true);
    try {
      const r = await engine?.call("negotiateRenewal", { person, wage, years, release });
      if (!r) return;
      setReply(r);
      if (r.status === "counter") {
        const was = { wage, years, release };
        setForm(toForm(r.terms));
        const marks: Partial<Record<Field, string>> = {};
        if (r.terms.wage !== was.wage) marks.wage = eur.format(was.wage);
        if (r.terms.years !== was.years) marks.years = String(was.years);
        if (r.terms.release !== was.release) marks.release = was.release === null ? t("renewals.noClause") : eur.format(was.release);
        setChanged(marks);
      } else {
        setChanged({});
        if (r.status === "accepted") { setForm(toForm(r.terms)); onAgreed?.(); }
      }
      load();
    } catch { setError(t("renewals.error")); } finally { setBusy(false); }
  };
  const release = async () => {
    setBusy(true);
    try { await engine?.call("releaseExpiring", { person }); load(); } catch { setError(t("renewals.error")); } finally { setBusy(false); }
  };

  const message = (() => {
    if (closedReason) return { tone: "erro", text: t(`renewals.closed.${closedReason}` as Key, { name }) };
    if (line?.decision?.kind === "release") return { tone: "suave", text: t("renewals.willLeave") };
    if (agreed) return { tone: "ok", text: t("renewals.agreed", { name }) };
    if (reply?.status === "counter") return { tone: "aviso", text: t(reply.reason === "distance" ? "renewals.counterDistance" : "renewals.counter", { left: reply.roundsLeft }) };
    return undefined;
  })();
  const mark = (f: Field) => (changed[f] !== undefined ? <small className="alterado-nota">{t("renewals.was", { value: changed[f] as string })}</small> : null);

  return (
    <dialog ref={ref} className="popup popup-renovacao" aria-labelledby="h-renovacao" onClose={onClose} onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}>
      <CloseButton onClose={() => ref.current?.close()} />
      <h2 id="h-renovacao">{t("renewals.title", { name })}</h2>
      {!line || !form ? (
        <p>{error ?? t("profile.loading")}</p>
      ) : (
        <form className="formulario renovacao-form" onSubmit={(e) => { e.preventDefault(); void propose(); }}>
          <p className="suave">{t("renewals.currentContract", { wage: eur.format(line.currentWage), date: line.endContract })}{line.agent ? ` · ${t("renewals.agent", { name: line.agent })}` : ""}</p>
          <label className={changed.wage !== undefined ? "alterado" : undefined}>
            <span>{t("renewals.wageField")}</span>
            <input type="number" min={50} step={1} inputMode="numeric" disabled={finished || busy} value={form.wage} onChange={(e) => edit({ wage: e.target.value }, "wage")} />
            {mark("wage")}
          </label>
          <label className={changed.years !== undefined ? "alterado" : undefined}>
            <span>{t("renewals.yearsField")}</span>
            <select disabled={finished || busy} value={form.years} onChange={(e) => edit({ years: e.target.value }, "years")}>
              {[1, 2, 3, 4, 5].map((y) => <option key={y} value={y}>{t("renewals.years", { n: y })}</option>)}
            </select>
            {mark("years")}
          </label>
          <label className={changed.release !== undefined ? "alterado" : undefined}>
            <span>{t("renewals.releaseField")}</span>
            <input type="number" min={1} step={1} inputMode="numeric" disabled={finished || busy || form.noClause} value={form.release} placeholder={form.noClause ? t("renewals.noClause") : ""} onChange={(e) => edit({ release: e.target.value }, "release")} />
            {mark("release")}
          </label>
          <label className="caixa-marcar">
            <input type="checkbox" disabled={finished || busy} checked={form.noClause} onChange={(e) => edit({ noClause: e.target.checked, release: e.target.checked || form.release !== "" ? form.release : String(line.currentRelease ?? line.ask.release ?? 100000) }, "release")} />
            <span>{t("renewals.noClause")}</span>
          </label>
          {message && <p className={`mensagem-renovacao ${message.tone}`} role="status">{message.text}</p>}
          {error && <p className="erro" role="alert">{error}</p>}
          <div className="acoes-popup">
            {!finished && <button type="submit" disabled={busy}>{t("renewals.propose")}</button>}
            {!finished && <button type="button" className="secundario" disabled={busy} onClick={() => void release()}>{t("renewals.release")}</button>}
            <button type="button" className="secundario" onClick={() => ref.current?.close()}>{t("renewals.close")}</button>
          </div>
        </form>
      )}
    </dialog>
  );
}
