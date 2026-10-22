"use client";
import { useState } from "react";
import type { ViewCouncil } from "@/engine/api/contracts";
import { Card, Data } from "@/ui/components/Card";
import { BarLevel, SERVICE_ARROW } from "@/ui/components/profiles/CityProfile";
import { useEngine } from "@/ui/EngineProvider";
import { councilSpeech } from "@/ui/councilSpeech";
import type { Key } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";

const trendClass = (tr: string) => `tendencia tendencia-${tr.startsWith("up") ? "rises" : tr.startsWith("down") ? "drops" : "stable"}`;

/** Separador Câmara (RZ-236): prioridades por área, relação com o autarca e pedidos do clube. */
export function CouncilBudget({ c }: { c: ViewCouncil }) {
  const { t, locale } = useT();
  const engine = useEngine();
  const money = new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const day = (iso: string) => {
    const d = new Date(`${iso}T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? "" : new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(d);
  };
  const [cofund, setCofund] = useState<Record<string, number>>({});
  const [sent, setSent] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState<string>();
  const arrow = (tr: string) => <span className={trendClass(tr)} title={t(`city.serviceTrend.${tr}` as Key)}><span aria-hidden="true">{SERVICE_ARROW[tr as keyof typeof SERVICE_ARROW]}</span><span className="so-leitor">{t(`city.serviceTrend.${tr}` as Key)}</span></span>;
  const ask = async (kind: "youth" | "matchday" | "subsidy") => {
    const r = await engine?.call("councilRequest", { kind, cofund: cofund[kind] ?? 0 });
    if (r?.ok) { setSent((s) => ({ ...s, [kind]: true })); setMsg(t("council.request.sent")); }
    else setMsg(r?.reason === "cash" ? t("council.request.cash") : t("council.request.error"));
  };
  return (
    <>
      <Card title={t("card.councilBudget")}>
        <Data lines={c.areas.map((a) => ({
          label: t(`council.area.${a.id}` as Key),
          value: <span className="nivel-linha"><BarLevel level={a.priority} /><b>{t(`council.priority.${a.priority}` as Key)}</b>{arrow(a.trend)}{a.cause && <span className="suave">{t(`council.cause.${a.cause}` as Key)}</span>}</span>,
        }))} />
      </Card>
      {c.relation && (
        <Card title={t("card.councilRelation")}>
          <Data lines={[{ label: t("council.relation"), value: <span className="nivel-linha"><BarLevel level={c.relation.level} /><b>{t(`city.level.${c.relation.level}` as Key)}</b>{arrow(c.relation.trend)}{c.relation.cause && <span className="suave">{t(`council.relationCause.${c.relation.cause}` as Key)}</span>}</span> }]} />
        </Card>
      )}
      {c.own && (
        <Card title={t("card.councilRequests")} wide>
          <ul className="lista-simples">
            {c.own.kinds.map((k) => {
              const busy = k.status !== "available" || sent[k.kind];
              const idx = cofund[k.kind] ?? 0;
              return (
                <li key={k.kind}>
                  <b>{t(`council.kind.${k.kind}` as Key)}</b> <span className="suave">{t(`council.kind.${k.kind}.hint` as Key)}</span>
                  <div>
                    {k.status === "available" && sent[k.kind] && <span className="suave">{t("council.pending")}</span>}
                    {k.status === "open" && <span className="suave">{t("council.request.open", { date: day(k.until ?? "") })}</span>}
                    {k.status === "cooldown" && <span className="suave">{t("council.request.cooldown", { date: day(k.until ?? "") })}</span>}
                    {!busy && (
                      <>
                        {k.cofunds.length > 1 && (
                          <label>{t("council.request.cofund")}{" "}
                            <select value={idx} onChange={(e) => setCofund((s) => ({ ...s, [k.kind]: Number(e.target.value) }))}>
                              {k.cofunds.map((f, i) => <option key={f} value={i}>{f === 0 ? t("council.request.cofund.0") : `${Math.round(f * 100)}% · ${money.format(k.cost * f)}`}</option>)}
                            </select>
                          </label>
                        )}{" "}
                        <button type="button" className="ligacao-botao" onClick={() => void ask(k.kind)}>{t("council.request.button")}</button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {msg && <p className="suave" role="status">{msg}</p>}
          <h4>{t("council.history")}</h4>
          {c.own.requests.length === 0 ? <p className="vazio">{t("council.noRequests")}</p> : (
            <ul className="lista-simples">
              {c.own.requests.map((r) => (
                <li key={r.id}>
                  <b>{t(`council.kind.${r.kind}` as Key)}</b> <span className="suave">{day(r.created)}</span>
                  {r.reply ? <p>{councilSpeech(t, { ...r.reply, kind: r.kind }, money)}</p> : <p className="suave">{t("council.pending")}</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </>
  );
}
