"use client";
import { useCallback, useEffect, useState } from "react";
import type { RenewalLine, RenewalsData } from "@/engine/api/contracts";
import { EntityLink } from "@/ui/components/Link";
import { useEngine } from "@/ui/EngineProvider";
import { useT } from "@/ui/i18n/LocaleProvider";
import { abbreviationPosition } from "@/ui/i18n/position";

type Offer = { wage: string; years: string };
type Reply = { accepted: boolean; ask: number };

/** Contratos a expirar do teu clube: vês o pedido de cada jogador, propões ordenado e anos, ou deixas sair. */
export function Renewals() {
  const { t, locale } = useT();
  const engine = useEngine();
  const [d, setD] = useState<RenewalsData | undefined>(undefined);
  const [offers, setOffers] = useState<Record<string, Offer>>({});
  const [replies, setReplies] = useState<Record<string, Reply>>({});
  const [error, setError] = useState<string | undefined>(undefined);
  const eur = new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

  const load = useCallback(() => {
    engine?.call("renewals", null).then(setD).catch(() => setError(t("renewals.error")));
  }, [engine, t]);
  useEffect(() => { load(); }, [load]);

  const offerOf = (l: RenewalLine): Offer => offers[l.id] ?? { wage: String(l.decision?.kind === "renew" ? l.decision.wage : l.ask.wage), years: String(l.decision?.kind === "renew" ? l.decision.years : l.ask.years) };
  const setOffer = (l: RenewalLine, patch: Partial<Offer>) => setOffers((o) => ({ ...o, [l.id]: { ...offerOf(l), ...patch } }));

  const propose = async (l: RenewalLine) => {
    const o = offerOf(l);
    const wage = Math.round(Number(o.wage)), years = Math.round(Number(o.years));
    if (!(wage > 0) || !(years >= 1)) { setError(t("renewals.invalid")); return; }
    setError(undefined);
    try {
      const r = await engine?.call("negotiateRenewal", { person: l.id, wage, years });
      if (r) setReplies((x) => ({ ...x, [l.id]: { accepted: r.accepted, ask: r.ask.wage } }));
      load();
    } catch { setError(t("renewals.error")); }
  };
  const release = async (l: RenewalLine) => {
    try {
      await engine?.call("releaseExpiring", { person: l.id });
      setReplies((x) => Object.fromEntries(Object.entries(x).filter(([id]) => id !== l.id)));
      load();
    } catch { setError(t("renewals.error")); }
  };

  if (!d) return <p>{error ?? t("profile.loading")}</p>;
  return (
    <section>
      <p className="suave">{t("renewals.intro", { date: d.nextSeasonStart })}</p>
      {error && <p className="erro" role="alert">{error}</p>}
      {d.lines.length === 0 ? (
        <p className="vazio">{t("renewals.empty")}</p>
      ) : (
        <table className="tabela renovacoes">
          <thead>
            <tr>
              <th>{t("column.name")}</th><th>{t("column.position")}</th><th className="within">{t("column.age")}</th><th>{t("column.contract")}</th>
              <th className="within">{t("renewals.current")}</th><th className="within">{t("renewals.ask")}</th><th>{t("renewals.offer")}</th><th>{t("renewals.decision")}</th>
            </tr>
          </thead>
          <tbody>
            {d.lines.map((l) => {
              const o = offerOf(l);
              const r = replies[l.id];
              return (
                <tr key={l.id}>
                  <td><EntityLink k="person" id={l.id}>{l.name}</EntityLink>{l.agent && <small className="suave"> · {t("renewals.agent", { name: l.agent })}</small>}</td>
                  <td>{abbreviationPosition(t, l.position)}</td>
                  <td className="num">{l.age}</td>
                  <td>{l.endContract}</td>
                  <td className="num">{eur.format(l.currentWage)}</td>
                  <td className="num">{eur.format(l.ask.wage)} · {t("renewals.years", { n: l.ask.years })}</td>
                  <td>
                    <span className="renovacao-oferta">
                      <input type="number" min={50} step={10} inputMode="numeric" aria-label={t("renewals.wageField")} value={o.wage} onChange={(e) => setOffer(l, { wage: e.target.value })} />
                      <input type="number" min={1} max={5} step={1} inputMode="numeric" aria-label={t("renewals.yearsField")} value={o.years} onChange={(e) => setOffer(l, { years: e.target.value })} />
                      <button type="button" onClick={() => void propose(l)}>{t("renewals.propose")}</button>
                      <button type="button" className="secundario" onClick={() => void release(l)}>{t("renewals.release")}</button>
                    </span>
                    {r && !r.accepted && <small className="erro" role="status"> {t("renewals.refused", { wage: eur.format(r.ask) })}</small>}
                  </td>
                  <td>
                    {l.decision?.kind === "renew" && <b>{t("renewals.willRenew", { wage: eur.format(l.decision.wage), years: l.decision.years })}</b>}
                    {l.decision?.kind === "release" && <b>{t("renewals.willLeave")}</b>}
                    {!l.decision && <span className="suave">{t("renewals.pending")}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
