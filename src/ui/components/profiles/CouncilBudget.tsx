"use client";
import { useState, type ReactNode } from "react";
import type { ViewCouncil } from "@/engine/api/contracts";
import { Card, Data } from "@/ui/components/Card";
import { BarLevel, SERVICE_ARROW } from "@/ui/components/profiles/CityProfile";
import { useEngine } from "@/ui/EngineProvider";
import { councilSpeech } from "@/ui/councilSpeech";
import type { Key } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";

const trendClass = (tr: string) => `tendencia tendencia-${tr.startsWith("up") ? "rises" : tr.startsWith("down") ? "drops" : "stable"}`;

/** Separador Câmara (RZ-236): prioridades por área, relação com o autarca e pedidos do clube. */
export function CouncilBudget({ c, lead }: { c: ViewCouncil; /** Linhas do cartão «Câmara» (autarca, mandato, apoio, orçamento). */ lead: { label: string; value: ReactNode }[] }) {
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
  const levelLine = (level: ViewCouncil["areas"][number]["priority"], tr: string, label: string, cause?: string) => (
    <span className="nivel-bloco">
      <span className="nivel-linha"><BarLevel level={level} /><b>{label}</b>{arrow(tr)}</span>
      {cause && <small className="suave">{cause}</small>}
    </span>
  );
  const relation = c.relation
    ? [{ label: t("council.relation"), value: levelLine(c.relation.level, c.relation.trend, t(`city.level.${c.relation.level}` as Key), c.relation.cause ? t(`council.relationCause.${c.relation.cause}` as Key) : undefined) }]
    : [];
  return (
    <>
      <div className="cartoes-par camara-par">
        <Card title={t("card.council")}>
          <Data lines={[...lead, ...relation]} />
        </Card>
        <Card title={t("card.councilBudget")}>
          <Data lines={c.areas.map((a) => ({
            label: t(`council.area.${a.id}` as Key),
            value: levelLine(a.priority, a.trend, t(`council.priority.${a.priority}` as Key), a.cause ? t(`council.cause.${a.cause}` as Key) : undefined),
          }))} />
        </Card>
      </div>
      {c.own && (
        <Card title={t("card.councilRequests")} wide>
          <ul className="pedidos">
            {c.own.kinds.map((k) => {
              const busy = k.status !== "available" || sent[k.kind];
              const idx = cofund[k.kind] ?? 0;
              const state = k.status === "open" ? t("council.request.open", { date: day(k.until ?? "") })
                : k.status === "cooldown" ? t("council.request.cooldown", { date: day(k.until ?? "") })
                : sent[k.kind] ? t("council.pending") : undefined;
              return (
                <li key={k.kind}>
                  <span className="pedido-titulo"><b>{t(`council.kind.${k.kind}` as Key)}</b><small className="suave">{t(`council.kind.${k.kind}.hint` as Key)}</small></span>
                  {busy ? (
                    <span className="pedido-estado suave">{state}</span>
                  ) : (
                    <>
                      {k.cofunds.length > 1 ? (
                        <label className="pedido-cofund">
                          <span className="suave">{t("council.request.cofund")}</span>
                          <select value={idx} onChange={(e) => setCofund((st) => ({ ...st, [k.kind]: Number(e.target.value) }))}>
                            {k.cofunds.map((f, i) => <option key={f} value={i}>{f === 0 ? t("council.request.cofund.0") : `${Math.round(f * 100)}% · ${money.format(k.cost * f)}`}</option>)}
                          </select>
                        </label>
                      ) : <span />}
                      <button type="button" className="primario" onClick={() => void ask(k.kind)}>{t("council.request.button")}</button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
          {msg && <p className="suave" role="status">{msg}</p>}
          <h3 className="subtitulo-cartao">{t("council.history")}</h3>
          {c.own.requests.length === 0 ? <p className="vazio">{t("council.noRequests")}</p> : (
            <ul className="pedidos pedidos-historico">
              {c.own.requests.map((r) => (
                <li key={r.id}>
                  <span className="pedido-titulo"><b>{t(`council.kind.${r.kind}` as Key)}</b><small className="suave">{day(r.created)}</small></span>
                  <span>{r.reply ? councilSpeech(t, { ...r.reply, kind: r.kind }, money) : <span className="suave">{t("council.pending")}</span>}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </>
  );
}
