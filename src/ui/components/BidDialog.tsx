"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { BidReply, BidView } from "@/engine/api/contracts";
import { CloseButton } from "@/ui/components/CloseButton";
import { ClubSwatch } from "@/ui/components/ClubSwatch";
import { Data } from "@/ui/components/Card";
import { Icon } from "@/ui/components/Icon";
import { namePosition } from "@/ui/i18n/position";
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
type Input = { action: "fee"; fee: number } | { action: "terms"; wage: number; years: number; release: number | null } | { action: "cancel" } | { action: "confirm" };

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
    if (b.counter) setTerms({ wage: String(b.counter.wage), years: String(b.counter.years), release: b.counter.release === null ? NONE : String(b.counter.release) });
    else if (b.terms) setTerms((x) => x ?? { wage: String(b.terms?.wages[Math.floor((b.terms?.wages.length ?? 0) / 2)] ?? b.terms?.ask.wage ?? ""), years: String(b.terms?.ask.years ?? 2), release: b.terms?.ask.release ? String(b.terms.ask.release) : NONE });
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
  const finished = bid?.stage === "done" || bid?.stage === "closed" || Boolean(bid?.moving);
  const waiting = bid?.pending;
  const toConfirm = bid?.stage === "agreed" && !bid.moving && bid.needsConfirm;
  const turn = Boolean(bid) && !finished && !waiting && !toConfirm && (bid?.stage === "club" || bid?.stage === "agent");
  const started = Boolean(bid) && ((bid?.round ?? 0) > 0 || bid?.fee !== undefined);

  /** Cartão de resultado, verde ou vermelho, com ícone: o acordo e a recusa têm de saltar à vista. */
  const banner = (() => {
    if (!bid) return undefined;
    if (bid.stage === "done") return { tone: "ok", title: t("bid.banner.done", { name }), body: t("bid.doneNow", { name }) };
    if (bid.moving) return { tone: "ok", title: t("bid.banner.moving"), body: t("bid.banner.moving.body", { name, date: bid.moving.date }) };
    if (toConfirm) return { tone: "ok", title: t("bid.banner.agreed"), body: `${t("bid.banner.agreed.body", { name })} ${t("bid.confirmBy", { date: toConfirm.by })}` };
    if (bid.stage === "closed") return { tone: "erro", title: t("bid.banner.rejected"), body: `${t(`bid.closed.${bid.closed ?? "refused"}` as Key, { name, club: bid.seller ?? "" })}${bid.reopens ? ` ${t("renewals.reopens", { date: bid.reopens })}` : ""}` };
    return undefined;
  })();
  const overFee = Boolean(bid) && bid?.stage === "club" && Number(fee) > (bid?.cash ?? 0);
  const overWage = Boolean(bid) && bid?.stage === "agent" && terms !== undefined && Number(terms.wage) > (bid?.wageRoom ?? 0);
  const blocked = turn && (overFee || overWage);
  const message = (() => {
    if (!bid || banner) return undefined;
    if (blocked) return { tone: "erro", text: t(overWage ? "bid.blocked.wageBudget" : "bid.blocked.cash") };
    if (waiting) return { tone: "ok", text: t("bid.waiting", { who: t(waiting.kind === "fee" ? "bid.waiting.club" : "bid.waiting.agent"), date: waiting.due }) };
    if (bid.lastReply?.status === "blocked" || reply?.status === "blocked") return { tone: "erro", text: t(`bid.blocked.${(reply?.reason ?? bid.lastReply?.reason) === "wageBudget" ? "wageBudget" : "cash"}` as Key) };
    if (bid.stage === "club" && bid.lastReply?.status === "counter") return { tone: "aviso", text: t("bid.clubCounter", { club: bid.seller ?? "", fee: eur.format(bid.ask ?? 0) }) };
    if (bid.stage === "agent" && bid.fee !== undefined && bid.lastReply?.kind === "fee") return { tone: "ok", text: t("bid.clubAgreed", { club: bid.seller ?? "", fee: eur.format(bid.fee) }) };
    if (bid.stage === "agent" && bid.lastReply?.status === "counter") return { tone: "aviso", text: t("bid.agentCounter") };
    return undefined;
  })();
  const counter = bid?.counter;
  const same = (f: "wage" | "years" | "release") => !counter || !terms || (f === "release" ? terms.release === (counter.release === null ? NONE : String(counter.release)) : terms[f] === String(counter[f]));
  const changed = (f: "wage" | "years" | "release") => Boolean(counter && terms && counter[f] !== counter.sent[f] && same(f));
  const feeCounter = bid?.stage === "club" && bid.lastReply?.status === "counter" && bid.ask !== undefined;
  const accepting = (feeCounter && Number(fee) === bid?.ask) || (Boolean(counter) && same("wage") && same("years") && same("release"));
  const info = bid ? [
    ...(bid.position ? [{ label: t("bid.info.position"), value: namePosition(t, bid.position) }] : []),
    ...(bid.age !== undefined ? [{ label: t("bid.info.age"), value: bid.age }] : []),
    { label: t("bid.info.club"), value: bid.seller ? <span className="clube-linha">{bid.sellerId && <ClubSwatch id={bid.sellerId} />} {bid.seller}</span> : t("bid.freePlayer") },
    ...(bid.agent ? [{ label: t("bid.info.agent"), value: bid.agent }] : []),
    ...(bid.release !== undefined ? [{ label: t("bid.releaseLabel"), value: eur.format(bid.release) }] : []),
    { label: t("bid.info.budget"), value: eur.format(bid.cash) },
  ] : [];

  return (
    <dialog ref={ref} className="popup popup-renovacao" aria-labelledby="h-bid" onClose={onClose} onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}>
      <CloseButton onClose={() => ref.current?.close()} />
      <h2 id="h-bid">{t("bid.title", { name })}</h2>
      {!bid ? (
        <p>{error ?? t("profile.loading")}</p>
      ) : (
        <form className="formulario renovacao-form" onSubmit={(e) => { e.preventDefault(); if (bid.stage === "club") proposeFee(); else if (bid.stage === "agent") proposeTerms(); }}>
          <Data lines={info} />
          {banner && <div className={`resultado-negocio ${banner.tone}`} role="status"><Icon name={banner.tone === "ok" ? "check" : "close"} /><div><b>{banner.title}</b><span>{banner.body}</span></div></div>}
          {turn && bid.stage === "club" && (
            <label className={feeCounter && Number(fee) === bid.ask ? "alterado" : undefined}>
              <span>{t("bid.feeField")}</span>
              <select disabled={busy} value={fee} onChange={(e) => setFee(e.target.value)}>
                {withValue(bid.feeSuggestions, fee).map((v) => <option key={v} value={v}>{eur.format(v)}</option>)}
              </select>
            </label>
          )}
          {turn && bid.stage === "agent" && bid.terms && terms && (
            <>
              <label className={changed("wage") ? "alterado" : undefined}>
                <span>{t("renewals.wageField")}</span>
                <select disabled={busy} value={terms.wage} onChange={(e) => setTerms({ ...terms, wage: e.target.value })}>
                  {withValue(bid.terms.wages, terms.wage).map((w) => <option key={w} value={w}>{eur.format(w)}</option>)}
                </select>
              </label>
              <label className={changed("years") ? "alterado" : undefined}>
                <span>{t("renewals.yearsField")}</span>
                <select disabled={busy} value={terms.years} onChange={(e) => setTerms({ ...terms, years: e.target.value })}>
                  {[1, 2, 3, 4, 5].map((y) => <option key={y} value={y}>{t("renewals.years", { n: y })}</option>)}
                </select>
              </label>
              <label className={changed("release") ? "alterado" : undefined}>
                <span>{t("renewals.releaseField")}</span>
                <select disabled={busy} value={terms.release} onChange={(e) => setTerms({ ...terms, release: e.target.value })}>
                  <option value={NONE}>{t("renewals.noClause")}</option>
                  {withValue(bid.terms.releases, terms.release === NONE ? "" : terms.release).map((v) => <option key={v} value={v}>{eur.format(v)}</option>)}
                </select>
              </label>
              {bid.terms.minWage !== undefined && <p className="suave"><small>{t("bid.stepBack")}</small></p>}
            </>
          )}
          {message && <p className={`mensagem-renovacao ${message.tone}`} role="status">{message.text}</p>}
          {error && <p className="erro" role="alert">{error}</p>}
          {(turn || toConfirm || waiting) && (
            <div className="acoes-popup">
              {(started || toConfirm) && !waiting && <button type="button" className="perigo" disabled={busy} onClick={() => void send({ action: "cancel" })}>{t("bid.withdraw")}</button>}
              {turn && <button type="submit" className="primario" disabled={busy || blocked}>{t(accepting ? "bid.accept" : "renewals.propose")}</button>}
              {toConfirm && <button type="button" className="primario" disabled={busy} onClick={() => void send({ action: "confirm" })}>{t("bid.confirm")}</button>}
            </div>
          )}
        </form>
      )}
    </dialog>
  );
}
