"use client";
import { useCallback, useEffect, useState } from "react";
import type { StadiumPageData } from "@/engine/api/contracts";
import { Card, Data } from "@/ui/components/Card";
import { useEngine } from "@/ui/EngineProvider";
import type { Key } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";

type Sector = StadiumPageData["sectors"][number];
type SectorId = Sector["id"];
type Quote = { cost: number; clubCost: number; councilShare: number; months: number; maxSeats: number };

const W = 440, H = 340;
const PITCH = { x: 120, y: 112, w: 200, h: 116 };

/** Retângulo de cada bancada à volta do relvado; a espessura cresce com os lugares (a planta mostra a ampliação). */
function standRect(id: SectorId, thickness: number): { x: number; y: number; w: number; h: number } {
  const gap = 8;
  switch (id) {
    case "side": return { x: PITCH.x - 10, y: PITCH.y - gap - thickness, w: PITCH.w + 20, h: thickness };
    case "central": return { x: PITCH.x - 10, y: PITCH.y + PITCH.h + gap, w: PITCH.w + 20, h: thickness };
    case "north": return { x: PITCH.x - gap - thickness, y: PITCH.y, w: thickness, h: PITCH.h };
    case "south": return { x: PITCH.x + PITCH.w + gap, y: PITCH.y, w: thickness, h: PITCH.h };
  }
}

/** Planta do estádio e planeamento (RZ-116): escolhe-se um setor na planta, ajusta-se o preço, cobre-se ou amplia-se; o relvado trata-se à parte. */
export function Stadium() {
  const { t, locale } = useT();
  const engine = useEngine();
  const [data, setData] = useState<StadiumPageData | null | undefined>(undefined);
  const [selected, setSelected] = useState<SectorId>("central");
  const [seats, setSeats] = useState(500);
  const [ask, setAsk] = useState(true);
  const [expandQuote, setExpandQuote] = useState<Quote | null>(null);
  const [coverQuote, setCoverQuote] = useState<Quote | null>(null);
  const [message, setMessage] = useState<string | undefined>(undefined);
  const eur = (n: number) => new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
  const eur2 = (n: number) => new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  const num = new Intl.NumberFormat(locale);
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const day = (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

  const load = useCallback(() => {
    if (!engine) return;
    engine.call("stadiumPage", null).then(setData).catch(() => setData(null));
  }, [engine]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!engine || !data) return;
    engine.call("stadiumQuote", { sector: selected, seats, kind: "expand" }).then(setExpandQuote).catch(() => setExpandQuote(null));
    engine.call("stadiumQuote", { sector: selected, seats: 0, kind: "cover" }).then(setCoverQuote).catch(() => setCoverQuote(null));
  }, [engine, data, selected, seats]);

  if (data === undefined) return <p>{t("profile.loading")}</p>;
  if (data === null) return <section className="pagina-clube"><h1>{t("stadium.page.title")}</h1><p className="vazio">{t("stadium.page.none")}</p></section>;

  const sector = data.sectors.find((s) => s.id === selected) as Sector;
  const maxSeats = Math.max(...data.sectors.map((s) => s.seats));
  const busy = !!data.works;
  const reason = (r: string) => setMessage(t(`stadium.reason.${r}` as Key));
  const order = async (kind: "expand" | "cover") => {
    setMessage(undefined);
    const r = await engine!.call("startStadiumWorks", { sector: selected, seats: kind === "cover" ? 0 : seats, kind, askCouncil: ask && (kind === "cover" ? coverQuote : expandQuote)?.councilShare !== 0 });
    if (!r.ok) reason(r.reason);
    load();
  };
  const setPrice = async (price: number) => {
    await engine!.call("setStadiumPrice", { sector: selected, price });
    load();
  };
  const turf = async (kind: "treat" | "replace") => {
    setMessage(undefined);
    const r = await engine!.call("treatTurf", { kind });
    if (!r.ok) setMessage(t(`stadium.turf.reason.${r.reason}` as Key));
    load();
  };
  const turfLabel = data.turf.value >= 0.8 ? "excellent" : data.turf.value >= 0.55 ? "good" : data.turf.value >= 0.35 ? "worn" : "bad";
  const council = (expandQuote?.councilShare ?? 0) > 0;

  return (
    <section className="pagina-clube" data-testid="stadium-page">
      <h1>{data.name}</h1>
      <p className="suave">{t("stadium.page.sub", { club: data.club.name, capacity: num.format(data.capacity), ownership: t(`ownership.${data.ownership}` as Key) })}</p>
      <div className="estadio-layout">
        <Card title={t("stadium.plan")} className="estadio-planta">
          <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label={t("stadium.plan")} className="planta-svg">
            <defs>
              <pattern id="obra" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="8" fill="var(--atencao)" opacity="0.45" /></pattern>
            </defs>
            <rect x={PITCH.x} y={PITCH.y} width={PITCH.w} height={PITCH.h} rx="4" className="planta-relvado" style={{ opacity: 0.35 + 0.65 * data.turf.value }} />
            <line x1={PITCH.x + PITCH.w / 2} y1={PITCH.y} x2={PITCH.x + PITCH.w / 2} y2={PITCH.y + PITCH.h} className="planta-linha" />
            <circle cx={PITCH.x + PITCH.w / 2} cy={PITCH.y + PITCH.h / 2} r="16" className="planta-linha" fill="none" />
            {data.sectors.map((s) => {
              const r = standRect(s.id, 22 + 36 * (s.seats / maxSeats));
              const working = data.works?.sector === s.id;
              const fill = s.fill ?? 0;
              const vertical = s.id === "north" || s.id === "south";
              return (
                <g key={s.id} role="button" tabIndex={0} aria-pressed={selected === s.id} aria-label={`${t(`stadium.sector.${s.id}` as Key)}: ${num.format(s.seats)}`}
                  className={`planta-setor${selected === s.id ? " ativo" : ""}`} onClick={() => setSelected(s.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelected(s.id); } }} data-testid={`planta-${s.id}`}>
                  <rect x={r.x} y={r.y} width={r.w} height={r.h} rx="4" className="planta-bancada" />
                  <rect x={r.x} y={r.y} width={r.w} height={r.h} rx="4" className="planta-ocupacao" style={{ opacity: 0.12 + 0.75 * fill }} />
                  {working && <rect x={r.x} y={r.y} width={r.w} height={r.h} rx="4" fill="url(#obra)" />}
                  {s.covered && (vertical
                    ? <rect x={s.id === "north" ? r.x : r.x + r.w - 4} y={r.y} width="4" height={r.h} className="planta-cobertura" />
                    : <rect x={r.x} y={s.id === "side" ? r.y : r.y + r.h - 4} width={r.w} height="4" className="planta-cobertura" />)}
                  <text x={r.x + r.w / 2} y={r.y + r.h / 2} textAnchor="middle" dominantBaseline="central" className="planta-texto" transform={vertical ? `rotate(-90 ${r.x + r.w / 2} ${r.y + r.h / 2})` : undefined}>{num.format(s.seats)}</text>
                </g>
              );
            })}
          </svg>
          <ul className="planta-legenda">
            <li><span className="planta-amostra ocupacao" />{t("stadium.legend.fill")}</li>
            <li><span className="planta-amostra cobertura" />{t("stadium.legend.covered")}</li>
            <li><span className="planta-amostra obra" />{t("stadium.legend.works")}</li>
          </ul>
          {data.works && <p className="suave">{t(data.works.kind === "cover" ? "stadium.works.cover" : "stadium.works.ongoing", { seats: num.format(data.works.seats), sector: t(`stadium.sector.${data.works.sector}` as Key).toLowerCase(), end: day(data.works.end) })}</p>}
        </Card>

        <Card title={t(`stadium.sector.${selected}` as Key)}>
          <Data lines={[
            { label: t("stadium.seats"), value: sector.open !== sector.seats ? `${num.format(sector.open)} / ${num.format(sector.seats)}` : num.format(sector.seats) },
            { label: t("stadium.lastFill"), value: sector.fill !== undefined ? pct(sector.fill) : "—" },
            { label: t("stadium.covered"), value: sector.covered ? t("stadium.yes") : t("stadium.no") },
            { label: t("stadium.ticket"), value: eur2(data.basePrice * sector.price) },
          ]} />
          <label className="estadio-preco">
            <span className="suave">{t("stadium.priceFactor", { value: sector.price.toFixed(2) })}</span>
            <input type="range" min={data.limits.priceMin} max={data.limits.priceMax} step={0.05} value={sector.price} onChange={(e) => void setPrice(Number(e.target.value))} data-testid="stadium-price" />
          </label>
          <p className="suave">{t("stadium.priceHint")}</p>
          <div className="estadio-acoes">
            <button type="button" disabled={busy || sector.covered || !coverQuote} onClick={() => void order("cover")} data-testid="stadium-cover">
              {sector.covered ? t("stadium.coverDone") : t("stadium.cover", { cost: eur(coverQuote?.cost ?? sector.coverCost) })}
            </button>
            <label>
              <span className="suave">{t("stadium.newSeats")}</span>{" "}
              <input type="number" min={data.limits.minSeats} max={data.limits.maxSeats} step={100} value={seats} onChange={(e) => setSeats(Math.max(0, Number(e.target.value) || 0))} data-testid="stadium-seats" />
            </label>
            {expandQuote && <p className="suave">{t("stadium.quote", { cost: eur(expandQuote.cost), months: expandQuote.months })}</p>}
            {council && (
              <label>
                <input type="checkbox" checked={ask} onChange={(e) => setAsk(e.target.checked)} data-testid="stadium-ask-council" />{" "}
                {t("stadium.askCouncil", { pct: Math.round((expandQuote?.councilShare ?? 0) * 100), value: eur(Math.round((expandQuote?.cost ?? 0) * (expandQuote?.councilShare ?? 0))) })}
              </label>
            )}
            <button type="button" disabled={busy} onClick={() => void order("expand")} data-testid="stadium-start">{t("stadium.start")}</button>
          </div>
          {message && <p className="erro" role="status">{message}</p>}
        </Card>

        <Card title={t("stadium.turf")}>
          <div className="estadio-relvado">
            <span className="barra-medida" role="img" aria-label={pct(data.turf.value)}><span style={{ width: pct(data.turf.value) }} /></span>
            <b>{t(`stadium.turf.${turfLabel}` as Key)}</b>
          </div>
          <p className="suave">{t("stadium.turf.hint")}</p>
          <div className="estadio-acoes">
            <button type="button" onClick={() => void turf("treat")} data-testid="turf-treat">{t("stadium.turf.treat", { cost: eur(data.turf.treatCost) })}</button>
            <button type="button" onClick={() => void turf("replace")} data-testid="turf-replace">{t("stadium.turf.replace", { cost: eur(data.turf.replaceCost) })}</button>
          </div>
        </Card>
      </div>
    </section>
  );
}
