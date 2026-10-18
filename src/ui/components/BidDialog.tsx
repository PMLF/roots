"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { BidReply, BidView } from "@/engine/api/contracts";
import { CloseButton } from "@/ui/components/CloseButton";
import { useEngine } from "@/ui/EngineProvider";
import { useT } from "@/ui/i18n/LocaleProvider";
import type { Key } from "@/ui/i18n";

const NONE = "none";
/** Sugestões mais o valor atual do campo (por exemplo uma contraproposta), sem repetidos e por ordem. */
const withValue = (values: number[], current: string): number[] => {
  const n = Number(current);
  return [...new Set(Number.isFinite(n) && n > 0 ? [...values, n] : values)].sort((a, b) => a - b);
};

type Reply = BidReply;
type Input = { action: "fee"; fee: number } | { action: "terms"; wage: number; years: number; release: number | null } | { action: "cancel" };

/**
 * Popup de proposta por um jogador de outro clube: primeiro o valor com o clube vendedor (livres saltam este passo) e depois o
 * contrato com o agente. Como na renovação, depois da primeira proposta só se sai com acordo, desistindo ou se a outra parte fechar a porta.
 */
export function BidDialog({ person, name, onClose, onChanged }: { person: string; name: string; onClose: () => void; onChanged?: (b: BidView) => void }) {
  const { t, locale } = useT();
  const engine = useEngine();
  const ref = useRef<HTMLDialogElement>(null);
  const eur = new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const [bid, setBid] = useState<BidView | undefined>(undefined);
  const [fee, setFee] = useState("");
  const [terms, setTerms] = useState<{ wage: string; years: string; release: string } | undefined>(undefined);
  const [reply, setReply] = useState<Reply | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => { ref.current?.showModal(); }, []);
  /** Põe o estado novo no popup e acerta os campos ao que a outra parte pediu. */
  const take = useCallback((b: BidView) => {
    setBid(b);
    if (b.stage === "club") setFee((f) => (b.ask !== undefined ? String(b.ask) : f || String(b.feeSuggestions[Math.floor(b.feeSuggestions.length / 2)] ?? "")));
    if (b.terms) setTerms((x) => x ?? { wage: String(b.terms?.wages[Math.floor((b.terms?.wages.length ?? 0) / 2)] ?? b.terms?.ask.wage ?? ""), years: String(b.terms?.ask.years ?? 2), release: b.terms?.ask.release ? String(b.terms.ask.release) : NONE });
  }, []);
  useEffect(() => {
    engine?.call("bid", { person, action: "open" }).then((r) => { if (r.ok) take(r.bid); else setError(t("bid.error")); }).catch(() => setError(t("bid.error")));
  }, [engine, person, take, t]);

  const send = async (input: Input) => {
    if (!engine) return;
    setBusy(true);
    setError(undefined);
    try {
      const r = await engine.call("bid", { person, ...input });
      if (!r.ok) { setError(t("bid.error")); return; }
      setReply(r.reply);
      const c = r.reply?.terms;
      if (r.reply?.status === "counter" && c) setTerms({ wage: String(c.wage), years: String(c.years), release: c.release === null ? NONE : String(c.release) });
      take(r.bid);
      onChanged?.(r.bid);
    } catch { setError(t("bid.error")); } finally { setBusy(false); }
  };
  const proposeFee = () => {
    const n = Math.round(Number(fee));
    if (!(n > 0)) { setError(t("renewals.invalid")); return; }
    void send({ action: "fee", fee: n });
  };
  const proposeTerms = () => {
    if (!terms) return;
    const wage = Math.round(Number(terms.wage)), years = Math.round(Number(terms.years));
    const release = terms.release === NONE ? null : Math.round(Number(terms.release));
    if (!(wage > 0) || !(years >= 1) || (release !== null && !(release > 0))) { setError(t("renewals.invalid")); return; }
    void send({ action: "terms", wage, years, release });
  };
  // o popup avança por si quando o clube aceita: a fase muda para o contrato
  const finished = bid?.stage === "agreed" || bid?.stage === "done" || bid?.stage === "closed";
  const locked = !finished && Boolean(bid) && ((bid?.round ?? 0) > 0 || (bid?.stage === "agent" && bid.fee !== undefined && bid.seller !== undefined));

  const message = (() => {
    if (!bid) return undefined;
    if (bid.stage === "done") return { tone: "ok", text: t("bid.doneNow", { name }) };
    if (bid.stage === "agreed") return { tone: "ok", text: bid.moving ? t("bid.agreedLater", { name, date: bid.moving.date }) : t("bid.doneNow", { name }) };
    if (bid.stage === "closed") return { tone: "erro", text: `${t(`bid.closed.${bid.closed ?? "refused"}` as Key, { name, club: bid.seller ?? "" })}${bid.reopens ? ` ${t("renewals.reopens", { date: bid.reopens })}` : ""}` };
    if (reply?.status === "blocked") return { tone: "erro", text: t(`bid.blocked.${reply.reason === "wageBudget" ? "wageBudget" : "cash"}` as Key) };
    if (bid.stage === "club" && reply?.status === "counter") return { tone: "aviso", text: t("bid.clubCounter", { club: bid.seller ?? "", fee: eur.format(bid.ask ?? 0), left: bid.roundsLeft }) };
    if (bid.stage === "agent" && bid.fee !== undefined && !reply) return { tone: "ok", text: t("bid.clubAgreed", { club: bid.seller ?? "", fee: eur.format(bid.fee) }) };
    if (bid.stage === "agent" && reply?.status === "counter") return { tone: "aviso", text: t("renewals.counter", { left: bid.roundsLeft }) };
    return undefined;
  })();

  return (
    <dialog ref={ref} className="popup popup-renovacao" aria-labelledby="h-bid" onClose={onClose} onCancel={(e) => { if (locked) e.preventDefault(); }} onClick={(e) => { if (e.target === ref.current && !locked) ref.current?.close(); }}>
      {!locked && <CloseButton onClose={() => ref.current?.close()} />}
      <h2 id="h-bid">{t("bid.title", { name })}</h2>
      {!bid ? (
        <p>{error ?? t("profile.loading")}</p>
      ) : (
        <form className="formulario renovacao-form" onSubmit={(e) => { e.preventDefault(); if (bid.stage === "club") proposeFee(); else if (bid.stage === "agent") proposeTerms(); }}>
          <p className="suave">
            {bid.seller ? t("bid.seller", { club: bid.seller }) : t("bid.freePlayer")}
            {bid.release !== undefined ? ` · ${t("bid.release", { value: eur.format(bid.release) })}` : ""}
            {bid.agent ? ` · ${t("renewals.agent", { name: bid.agent })}` : ""}
            {` · ${t("bid.cash", { value: eur.format(bid.cash) })}`}
          </p>
          {bid.stage === "club" && (
            <label className={reply?.status === "counter" ? "alterado" : undefined}>
              <span>{t("bid.feeField")}</span>
              <select disabled={busy} value={fee} onChange={(e) => setFee(e.target.value)}>
                {withValue(bid.feeSuggestions, fee).map((v) => <option key={v} value={v}>{eur.format(v)}</option>)}
              </select>
            </label>
          )}
          {bid.stage === "agent" && bid.terms && terms && (
            <>
              <label>
                <span>{t("renewals.wageField")}</span>
                <select disabled={busy} value={terms.wage} onChange={(e) => setTerms({ ...terms, wage: e.target.value })}>
                  {withValue(bid.terms.wages, terms.wage).map((w) => <option key={w} value={w}>{eur.format(w)}</option>)}
                </select>
              </label>
              <label>
                <span>{t("renewals.yearsField")}</span>
                <select disabled={busy} value={terms.years} onChange={(e) => setTerms({ ...terms, years: e.target.value })}>
                  {[1, 2, 3, 4, 5].map((y) => <option key={y} value={y}>{t("renewals.years", { n: y })}</option>)}
                </select>
              </label>
              <label>
                <span>{t("renewals.releaseField")}</span>
                <select disabled={busy} value={terms.release} onChange={(e) => setTerms({ ...terms, release: e.target.value })}>
                  <option value={NONE}>{t("renewals.noClause")}</option>
                  {withValue(bid.terms.releases, terms.release === NONE ? "" : terms.release).map((v) => <option key={v} value={v}>{eur.format(v)}</option>)}
                </select>
              </label>
              {bid.terms.minWage !== undefined && <p className="suave"><small>{t("bid.stepBack")}</small></p>}
            </>
          )}
          {locked && <p className="suave"><small>{t("bid.locked")}</small></p>}
          {message && <p className={`mensagem-renovacao ${message.tone}`} role="status">{message.text}</p>}
          {error && <p className="erro" role="alert">{error}</p>}
          <div className="acoes-popup">
            {!finished && <button type="submit" disabled={busy}>{t("renewals.propose")}</button>}
            {!finished && locked && <button type="button" className="secundario" disabled={busy} onClick={() => void send({ action: "cancel" })}>{t("bid.withdraw")}</button>}
            {!locked && <button type="button" className="secundario" onClick={() => ref.current?.close()}>{t("renewals.close")}</button>}
          </div>
        </form>
      )}
    </dialog>
  );
}
