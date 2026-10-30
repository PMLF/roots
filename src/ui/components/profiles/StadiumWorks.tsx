"use client";
import { useCallback, useEffect, useState } from "react";
import type { ClubProfileData } from "@/engine/api/contracts";
import { useEngine } from "@/ui/EngineProvider";
import { useT } from "@/ui/i18n/LocaleProvider";
import type { Key } from "@/ui/i18n";

const SECTORS = ["central", "side", "north", "south"] as const;
type Quote = { cost: number; clubCost: number; councilShare: number; months: number; maxSeats: number };

/** Ampliação do estádio do clube do gamer (RZ-116): escolhe-se o setor e os lugares novos, vê-se o custo e o prazo, e confirma-se. */
export function StadiumWorks({ club }: { club: string }) {
  const { t, locale } = useT();
  const engine = useEngine();
  const [stadium, setStadium] = useState<ClubProfileData["stadium"] | undefined>(undefined);
  const [sector, setSector] = useState<(typeof SECTORS)[number]>("north");
  const [seats, setSeats] = useState(500);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [ask, setAsk] = useState(true);
  const [message, setMessage] = useState<string | undefined>(undefined);
  const eur = (n: number) => new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
  const n = new Intl.NumberFormat(locale);

  const load = useCallback(() => {
    if (!engine) return;
    engine.call("clubProfile", { id: club }).then((p) => p && setStadium(p.stadium)).catch(() => undefined);
  }, [engine, club]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!engine) return;
    engine.call("stadiumQuote", { sector, seats }).then(setQuote).catch(() => setQuote(null));
  }, [engine, sector, seats, stadium]);

  if (!stadium) return null;
  const start = async () => {
    setMessage(undefined);
    const r = await engine!.call("startStadiumWorks", { sector, seats, askCouncil: ask && (quote?.councilShare ?? 0) > 0 });
    if (!r.ok) setMessage(t(`stadium.reason.${r.reason}` as Key));
    load();
  };

  return (
    <div className="staff-gestao" data-testid="stadium-works">
      {stadium.works ? (
        <p>{t("stadium.works.ongoing", { seats: n.format(stadium.works.seats), sector: t(`stadium.sector.${stadium.works.sector}` as Key).toLowerCase(), end: stadium.works.end })}</p>
      ) : (
        <>
          <h3>{t("stadium.expand")}</h3>
          <label>
            <span className="suave">{t("stadium.sector")}</span>{" "}
            <select value={sector} onChange={(e) => setSector(e.target.value as (typeof SECTORS)[number])} data-testid="stadium-sector">
              {SECTORS.map((s) => <option key={s} value={s}>{t(`stadium.sector.${s}` as Key)}</option>)}
            </select>
          </label>{" "}
          <label>
            <span className="suave">{t("stadium.newSeats")}</span>{" "}
            <input type="number" min={100} step={100} value={seats} onChange={(e) => setSeats(Math.max(0, Number(e.target.value) || 0))} data-testid="stadium-seats" />
          </label>
          {quote && (
            <p className="suave">{t("stadium.quote", { cost: eur(quote.cost), months: quote.months })}</p>
          )}
          {quote && quote.councilShare > 0 && (
            <label>
              <input type="checkbox" checked={ask} onChange={(e) => setAsk(e.target.checked)} data-testid="stadium-ask-council" />{" "}
              {t("stadium.askCouncil", { pct: Math.round(quote.councilShare * 100), value: eur(Math.round(quote.cost * quote.councilShare)) })}
            </label>
          )}
          <button type="button" onClick={() => void start()} data-testid="stadium-start">{t("stadium.start")}</button>
        </>
      )}
      {message && <p className="erro" role="status">{message}</p>}
    </div>
  );
}
