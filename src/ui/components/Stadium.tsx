"use client";
import { useCallback, useEffect, useState } from "react";
import type { StadiumPageData } from "@/engine/api/contracts";
import { Card } from "@/ui/components/Card";
import { useEngine } from "@/ui/EngineProvider";
import type { Key } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";

type Sector = StadiumPageData["sectors"][number];
type SectorId = Sector["id"];
type Selection = SectorId | "pitch";
type Quote = { cost: number; clubCost: number; councilShare: number; months: number; maxSeats: number };

const W = 880, H = 540;
const PITCH = { x: 250, y: 190, w: 380, h: 160 };
/** Bancadas à volta do campo: lateral (cima), central (baixo), topo norte (esquerda) e topo sul (direita). */
const STANDS: Record<SectorId, { x: number; y: number; w: number; h: number; ring: "h" | "v" }> = {
  side: { x: 230, y: 84, w: 420, h: 86, ring: "h" },
  central: { x: 230, y: 370, w: 420, h: 86, ring: "h" },
  north: { x: 40, y: 190, w: 190, h: 160, ring: "v" },
  south: { x: 650, y: 190, w: 190, h: 160, ring: "v" },
};
/** Onde fica o indicador de «quanto ainda se pode estender» de cada bancada: ao lado dela. */
const NOTES: Record<SectorId, { x: number; y: number }> = {
  side: { x: 660, y: 84 },
  central: { x: 40, y: 370 },
  north: { x: 40, y: 84 },
  south: { x: 660, y: 370 },
};
const NOTE_W = 180;

/** Planta simplificada do estádio e planeamento (RZ-116): campo ao centro com o estado e o tipo de relva, uma bancada em cada lado com preço, lugares, anéis e cobertura, e ao lado o que ainda pode crescer. As obras e os preços pedem-se aqui. */
export function Stadium() {
  const { t, locale } = useT();
  const engine = useEngine();
  const [data, setData] = useState<StadiumPageData | null | undefined>(undefined);
  const [selected, setSelected] = useState<Selection>("central");
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
  const sectorId = selected === "pitch" ? undefined : selected;
  useEffect(() => {
    if (!engine || !data || !sectorId) return;
    engine.call("stadiumQuote", { sector: sectorId, seats, kind: "expand" }).then(setExpandQuote).catch(() => setExpandQuote(null));
    engine.call("stadiumQuote", { sector: sectorId, seats: 0, kind: "cover" }).then(setCoverQuote).catch(() => setCoverQuote(null));
  }, [engine, data, sectorId, seats]);

  if (data === undefined) return <p>{t("profile.loading")}</p>;
  if (data === null) return <section className="pagina-clube"><h1>{t("stadium.page.title")}</h1><p className="vazio">{t("stadium.page.none")}</p></section>;

  const busy = !!data.works;
  const sector = sectorId ? (data.sectors.find((s) => s.id === sectorId) as Sector) : undefined;
  const headroom = (s: Sector) => Math.max(0, s.max - s.seats);
  const order = async (kind: "expand" | "cover") => {
    if (!sectorId) return;
    setMessage(undefined);
    const quote = kind === "cover" ? coverQuote : expandQuote;
    const r = await engine!.call("startStadiumWorks", { sector: sectorId, seats: kind === "cover" ? 0 : seats, kind, askCouncil: ask && (quote?.councilShare ?? 0) > 0 });
    if (!r.ok) setMessage(t(`stadium.reason.${r.reason}` as Key));
    load();
  };
  const setPrice = async (price: number) => {
    if (!sectorId) return;
    await engine!.call("setStadiumPrice", { sector: sectorId, price });
    load();
  };
  const turf = async (kind: "treat" | "replace" | "synthetic") => {
    setMessage(undefined);
    const r = await engine!.call("treatTurf", { kind });
    if (!r.ok) setMessage(t(`stadium.turf.reason.${r.reason}` as Key));
    load();
  };
  const turfLabel = data.turf.value >= 0.8 ? "excellent" : data.turf.value >= 0.55 ? "good" : data.turf.value >= 0.35 ? "worn" : "bad";
  const synthetic = data.turf.type === "synthetic";
  const choose = (id: Selection) => () => { setSelected(id); setMessage(undefined); };
  const keys = (id: Selection) => (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelected(id); } };

  return (
    <section className="pagina-clube estadio" data-testid="stadium-page">
      <h1>{data.name}</h1>
      <p className="suave">{t("stadium.page.sub", { club: data.club.name, capacity: num.format(data.capacity), ownership: t(`ownership.${data.ownership}` as Key) })}</p>
      <div className="estadio-centro">
        <Card className="estadio-planta">
          <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label={t("stadium.plan")} className="planta-svg">
            <defs>
              <pattern id="obra" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="8" fill="var(--atencao)" opacity="0.5" /></pattern>
            </defs>

            <g role="button" tabIndex={0} aria-pressed={selected === "pitch"} aria-label={t("stadium.turf")} className={`planta-setor${selected === "pitch" ? " ativo" : ""}`} onClick={choose("pitch")} onKeyDown={keys("pitch")} data-testid="planta-pitch">
              <rect x={PITCH.x} y={PITCH.y} width={PITCH.w} height={PITCH.h} rx="6" className={synthetic ? "planta-relvado sintetico" : "planta-relvado"} style={{ opacity: 0.45 + 0.55 * data.turf.value }} />
              <rect x={PITCH.x + 10} y={PITCH.y + 10} width={PITCH.w - 20} height={PITCH.h - 20} className="planta-linha" fill="none" />
              <rect x={PITCH.x + 10} y={PITCH.y + PITCH.h / 2 - 30} width="30" height="60" className="planta-linha" fill="none" />
              <rect x={PITCH.x + PITCH.w - 40} y={PITCH.y + PITCH.h / 2 - 30} width="30" height="60" className="planta-linha" fill="none" />
              <text x={PITCH.x + PITCH.w / 2} y={PITCH.y + 46} textAnchor="middle" className="planta-campo titulo">{t(synthetic ? "stadium.turf.synthetic" : "stadium.turf.natural")}</text>
              <text x={PITCH.x + PITCH.w / 2} y={PITCH.y + 70} textAnchor="middle" className="planta-campo">{t("stadium.turf.state", { label: t(`stadium.turf.${turfLabel}` as Key), value: pct(data.turf.value) })}</text>
              <rect x={PITCH.x + 110} y={PITCH.y + 94} width="160" height="8" rx="4" className="planta-barra-fundo" />
              <rect x={PITCH.x + 110} y={PITCH.y + 94} width={160 * data.turf.value} height="8" rx="4" className="planta-barra-campo" />
            </g>

            {data.sectors.map((s) => {
              const b = STANDS[s.id];
              const working = data.works?.sector === s.id;
              const vertical = b.ring === "v";
              const bands = Array.from({ length: Math.max(0, s.rings - 1) }, (_, i) => i + 1).slice(0, 5);
              const price = data.basePrice * s.price;
              const lines = [t(`stadium.sector.${s.id}` as Key), t("stadium.seatsRings", { seats: num.format(s.seats), rings: s.rings }), `${eur2(price)} · ${t(s.covered ? "stadium.coveredShort" : "stadium.uncoveredShort")}`];
              const cx = b.x + b.w / 2, top = b.y + b.h / 2 - 22;
              return (
                <g key={s.id} role="button" tabIndex={0} aria-pressed={selected === s.id} aria-label={`${lines.join(", ")}`}
                  className={`planta-setor${selected === s.id ? " ativo" : ""}`} onClick={choose(s.id)} onKeyDown={keys(s.id)} data-testid={`planta-${s.id}`}>
                  <rect x={b.x} y={b.y} width={b.w} height={b.h} rx="6" className="planta-bancada" />
                  <rect x={b.x} y={b.y} width={b.w} height={b.h} rx="6" className="planta-ocupacao" style={{ opacity: 0.1 + 0.55 * (s.fill ?? 0) }} />
                  {bands.map((i) => vertical
                    ? <line key={i} x1={b.x + (b.w * i) / s.rings} y1={b.y} x2={b.x + (b.w * i) / s.rings} y2={b.y + b.h} className="planta-anel" />
                    : <line key={i} x1={b.x} y1={b.y + (b.h * i) / s.rings} x2={b.x + b.w} y2={b.y + (b.h * i) / s.rings} className="planta-anel" />)}
                  {working && <rect x={b.x} y={b.y} width={b.w} height={b.h} rx="6" fill="url(#obra)" />}
                  {s.covered && (vertical
                    ? <rect x={s.id === "north" ? b.x : b.x + b.w - 5} y={b.y} width="5" height={b.h} className="planta-cobertura" />
                    : <rect x={b.x} y={s.id === "side" ? b.y : b.y + b.h - 5} width={b.w} height="5" className="planta-cobertura" />)}
                  {lines.map((line, i) => <text key={i} x={cx} y={top + i * 20 + 8} textAnchor="middle" className={i === 0 ? "planta-texto titulo" : "planta-texto"}>{line}</text>)}
                </g>
              );
            })}

            {data.sectors.map((s) => {
              const n = NOTES[s.id], room = headroom(s);
              return (
                <g key={`n-${s.id}`} className="planta-nota" onClick={choose(s.id)} data-testid={`planta-nota-${s.id}`}>
                  <text x={n.x} y={n.y + 14} className="planta-nota-sub">{t(`stadium.sector.${s.id}` as Key)}</text>
                  <text x={n.x} y={n.y + 36} className={room > 0 ? "planta-nota-texto" : "planta-nota-texto cheio"}>{room > 0 ? t("stadium.canGrow", { seats: num.format(room) }) : t("stadium.atMax")}</text>
                  <rect x={n.x} y={n.y + 46} width={NOTE_W - 20} height="6" rx="3" className="planta-barra-fundo" />
                  <rect x={n.x} y={n.y + 46} width={(NOTE_W - 20) * Math.min(1, s.seats / Math.max(1, s.max))} height="6" rx="3" className="planta-barra-cheia" />
                  <text x={n.x} y={n.y + 72} className="planta-nota-sub">{t("stadium.maxSeats", { seats: num.format(s.max) })}</text>
                </g>
              );
            })}
          </svg>
          <ul className="planta-legenda">
            <li><span className="planta-amostra ocupacao" />{t("stadium.legend.fill")}</li>
            <li><span className="planta-amostra cobertura" />{t("stadium.legend.covered")}</li>
            <li><span className="planta-amostra anel" />{t("stadium.legend.rings")}</li>
            <li><span className="planta-amostra obra" />{t("stadium.legend.works")}</li>
          </ul>
          {data.works && <p className="suave">{t(data.works.kind === "cover" ? "stadium.works.cover" : "stadium.works.ongoing", { seats: num.format(data.works.seats), sector: t(`stadium.sector.${data.works.sector}` as Key).toLowerCase(), end: day(data.works.end) })}</p>}
        </Card>

        <Card title={sector ? t(`stadium.sector.${sector.id}` as Key) : t("stadium.turf")} className="estadio-painel">
          {sector ? (
            <div className="estadio-painel-grelha">
              <div>
                <h3>{t("stadium.price")}</h3>
                <p className="suave">{t("stadium.ticketNow", { price: eur2(data.basePrice * sector.price), factor: sector.price.toFixed(2), fill: sector.fill !== undefined ? pct(sector.fill) : "—" })}</p>
                <input type="range" className="estadio-slider" min={data.limits.priceMin} max={data.limits.priceMax} step={0.05} value={sector.price} onChange={(e) => void setPrice(Number(e.target.value))} aria-label={t("stadium.price")} data-testid="stadium-price" />
                <p className="suave">{t("stadium.priceHint")}</p>
                <h3>{t("stadium.roof")}</h3>
                <button type="button" disabled={busy || sector.covered || !coverQuote} onClick={() => void order("cover")} data-testid="stadium-cover">
                  {sector.covered ? t("stadium.coverDone") : t("stadium.cover", { cost: eur(coverQuote?.cost ?? sector.coverCost) })}
                </button>
              </div>
              <div>
                <h3>{t("stadium.expand")}</h3>
                {headroom(sector) < data.limits.minSeats ? <p className="suave">{t("stadium.atMax")}</p> : (
                  <>
                    <label className="estadio-campo">
                      <span className="suave">{t("stadium.newSeats")}</span>
                      <input type="number" min={data.limits.minSeats} max={headroom(sector)} step={100} value={seats} onChange={(e) => setSeats(Math.max(0, Number(e.target.value) || 0))} data-testid="stadium-seats" />
                    </label>
                    {expandQuote && <p className="suave">{t("stadium.quote", { cost: eur(expandQuote.cost), months: expandQuote.months })}</p>}
                    {(expandQuote?.councilShare ?? 0) > 0 && (
                      <label className="estadio-campo">
                        <input type="checkbox" checked={ask} onChange={(e) => setAsk(e.target.checked)} data-testid="stadium-ask-council" />
                        <span>{t("stadium.askCouncil", { pct: Math.round((expandQuote?.councilShare ?? 0) * 100), value: eur(Math.round((expandQuote?.cost ?? 0) * (expandQuote?.councilShare ?? 0))) })}</span>
                      </label>
                    )}
                    <button type="button" disabled={busy} onClick={() => void order("expand")} data-testid="stadium-start">{t("stadium.start")}</button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <>
              <p className="suave">{t("stadium.turf.hint")}</p>
              <div className="estadio-acoes">
                {!synthetic && <button type="button" onClick={() => void turf("treat")} data-testid="turf-treat">{t("stadium.turf.treat", { cost: eur(data.turf.treatCost) })}</button>}
                <button type="button" onClick={() => void turf("replace")} data-testid="turf-replace">{t(synthetic ? "stadium.turf.backNatural" : "stadium.turf.replace", { cost: eur(data.turf.replaceCost) })}</button>
                {!synthetic && <button type="button" onClick={() => void turf("synthetic")} data-testid="turf-synthetic">{t("stadium.turf.installSynthetic", { cost: eur(data.turf.syntheticCost) })}</button>}
              </div>
            </>
          )}
          {message && <p className="erro" role="status">{message}</p>}
        </Card>
      </div>
    </section>
  );
}
