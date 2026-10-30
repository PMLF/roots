"use client";
import { useCallback, useEffect, useState } from "react";
import type { StadiumPageData } from "@/engine/api/contracts";
import { useEngine } from "@/ui/EngineProvider";
import type { Key } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";

type Sector = StadiumPageData["sectors"][number];
type SectorId = Sector["id"];
type Quote = { cost: number; clubCost: number; councilShare: number; months: number; maxSeats: number };

const W = 880, H = 600, CX = 440, CY = 300;
const INNER = { rx: 360, ry: 215 };
const OUTER = { rx: 420, ry: 262 };
const PITCH = { x: 270, y: 215, w: 340, h: 170 };
const P = { l: PITCH.x, r: PITCH.x + PITCH.w, t: PITCH.y, b: PITCH.y + PITCH.h };
/** Cada bancada ocupa o espaço entre as diagonais que saem dos cantos do campo; recortado pela oval. */
const AREAS: Record<SectorId, string> = {
  side: `${P.l},${P.t} ${P.r},${P.t} 840,-40 40,-40`,
  central: `${P.l},${P.b} ${P.r},${P.b} 840,640 40,640`,
  north: `${P.l},${P.t} ${P.l},${P.b} 40,640 -40,640 -40,-40 40,-40`,
  south: `${P.r},${P.t} ${P.r},${P.b} 840,640 920,640 920,-40 840,-40`,
};
const TEXT_AT: Record<SectorId, { x: number; y: number }> = { side: { x: CX, y: 118 }, central: { x: CX, y: 418 }, north: { x: 172, y: 258 }, south: { x: 708, y: 258 } };
const PLUS_AT: Record<SectorId, { x: number; y: number }> = { side: { x: CX, y: 44 }, central: { x: CX, y: 556 }, north: { x: 30, y: CY }, south: { x: 850, y: CY } };
const ORDER: SectorId[] = ["side", "north", "south", "central"];

type Open = SectorId | "pitch" | undefined;

/**
 * Planta fechada do estádio (RZ-116): o campo ao centro (tipo e estado do relvado) e uma bancada em cada lado, com lugares, anéis, preço,
 * cobertura e a expansibilidade que ainda resta. Qualquer clube se vê; só o clube do gamer tem os tracejados (a área de expansão) e o «+»
 * que abrem o pedido de obra, preço e cobertura.
 */
export function StadiumPlan({ club, compact = false }: { club: string; compact?: boolean }) {
  const { t, locale } = useT();
  const engine = useEngine();
  const [data, setData] = useState<StadiumPageData | null | undefined>(undefined);
  const [open, setOpen] = useState<Open>(undefined);
  const [layers, setLayers] = useState({ fill: true, rings: true, room: true });
  const [seats, setSeats] = useState(500);
  const [cover, setCover] = useState(false);
  const [price, setPrice] = useState("");
  const [ask, setAsk] = useState(true);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [message, setMessage] = useState<string | undefined>(undefined);
  const eur = (n: number) => new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
  const eur2 = (n: number) => new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  const num = new Intl.NumberFormat(locale);
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const day = (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

  const load = useCallback(() => {
    if (!engine) return;
    engine.call("stadiumPage", { club }).then(setData).catch(() => setData(null));
  }, [engine, club]);
  useEffect(() => { load(); }, [load]);

  const sector = data && open && open !== "pitch" ? data.sectors.find((s) => s.id === open) : undefined;
  const headroom = sector ? Math.max(0, sector.max - sector.seats) : 0;
  useEffect(() => {
    if (!engine || !sector) { setQuote(null); return; }
    let live = true;
    engine.call("stadiumQuote", { sector: sector.id, seats: cover ? 0 : seats, kind: cover ? "cover" : "expand" }).then((q) => live && setQuote(q)).catch(() => live && setQuote(null));
    return () => { live = false; };
  }, [engine, sector, seats, cover]);

  if (data === undefined) return <p>{t("profile.loading")}</p>;
  if (data === null) return <p className="vazio">{t("stadium.page.none")}</p>;
  const d = data;
  const own = d.own && !compact;

  const choose = (id: Open) => {
    if (!own) return;
    setMessage(undefined);
    setCover(false);
    const s = id && id !== "pitch" ? d.sectors.find((x) => x.id === id) : undefined;
    if (s) { setPrice((d.basePrice * s.price).toFixed(2)); setSeats(Math.min(Math.max(d.limits.minSeats, 500), Math.max(d.limits.minSeats, s.max - s.seats))); }
    setOpen(id);
  };
  const press = (id: Open) => (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(id); } };
  const submit = async () => {
    if (!sector) return;
    setMessage(undefined);
    const r = await engine!.call("startStadiumWorks", { sector: sector.id, seats: cover ? 0 : seats, kind: cover ? "cover" : "expand", askCouncil: ask && (quote?.councilShare ?? 0) > 0 });
    if (!r.ok) setMessage(t(`stadium.reason.${r.reason}` as Key));
    else setOpen(undefined);
    load();
  };
  const savePrice = async () => {
    if (!sector) return;
    const value = Number(price.replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) return;
    const r = await engine!.call("setStadiumPrice", { sector: sector.id, price: value / d.basePrice });
    setPrice((d.basePrice * r.price).toFixed(2));
    load();
  };
  const turf = async (kind: "treat" | "replace" | "synthetic") => {
    setMessage(undefined);
    const r = await engine!.call("treatTurf", { kind });
    if (!r.ok) setMessage(t(`stadium.turf.reason.${r.reason}` as Key));
    load();
  };
  const synthetic = d.turf.type === "synthetic";
  const turfLabel = d.turf.value >= 0.8 ? "excellent" : d.turf.value >= 0.55 ? "good" : d.turf.value >= 0.35 ? "worn" : "bad";

  return (
    <div className={`estadio-plano${compact ? " compacto" : ""}`} data-testid="stadium-plan">
      <div className="estadio-svg-caixa">
        <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label={t("stadium.plan")} className="planta-svg">
          <defs>
            <clipPath id={`pl-oval-${club}`}><ellipse cx={CX} cy={CY} rx={INNER.rx} ry={INNER.ry} /></clipPath>
            <clipPath id={`pl-fora-${club}`}><ellipse cx={CX} cy={CY} rx={OUTER.rx} ry={OUTER.ry} /></clipPath>
            {ORDER.map((id) => <clipPath key={id} id={`pl-${id}-${club}`}><polygon points={AREAS[id]} /></clipPath>)}
            <pattern id={`pl-obra-${club}`} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="8" fill="var(--atencao)" opacity="0.5" /></pattern>
          </defs>

          {own && d.sectors.map((s) => {
            const room = Math.max(0, s.max - s.seats);
            return (
              <g key={`x-${s.id}`} clipPath={`url(#pl-${s.id}-${club})`} role="button" tabIndex={0} aria-label={t("stadium.orderFor", { sector: t(`stadium.sector.${s.id}` as Key) })}
                className={`planta-expansao${open === s.id ? " ativo" : ""}${room === 0 ? " cheio" : ""}`} onClick={() => choose(s.id)} onKeyDown={press(s.id)} data-testid={`planta-exp-${s.id}`}>
                <ellipse cx={CX} cy={CY} rx={OUTER.rx} ry={OUTER.ry} className="planta-exp-zona" />
              </g>
            );
          })}

          {ORDER.map((id) => {
            const s = d.sectors.find((x) => x.id === id) as Sector;
            const working = d.works?.sector === id;
            const bands = Array.from({ length: Math.max(0, s.rings - 1) }, (_, i) => i + 1).slice(0, 5);
            return (
              <g key={id} clipPath={`url(#pl-${id}-${club})`} className="planta-bancada-grupo">
                <ellipse cx={CX} cy={CY} rx={INNER.rx} ry={INNER.ry} className="planta-bancada" />
                {layers.fill && <ellipse cx={CX} cy={CY} rx={INNER.rx} ry={INNER.ry} className="planta-ocupacao" style={{ opacity: 0.08 + 0.5 * (s.fill ?? 0) }} />}
                {layers.rings && bands.map((i) => <ellipse key={i} cx={CX} cy={CY} rx={INNER.rx * (1 - (0.57 * i) / s.rings)} ry={INNER.ry * (1 - (0.57 * i) / s.rings)} className="planta-anel" fill="none" />)}
                {working && <ellipse cx={CX} cy={CY} rx={INNER.rx} ry={INNER.ry} fill={`url(#pl-obra-${club})`} />}
              </g>
            );
          })}
          <g clipPath={`url(#pl-oval-${club})`}>
            {[[P.l, P.t, 40, -40], [P.r, P.t, 840, -40], [P.l, P.b, 40, 640], [P.r, P.b, 840, 640]].map(([x1, y1, x2, y2], i) => <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className="planta-divisoria" />)}
          </g>
          <ellipse cx={CX} cy={CY} rx={INNER.rx} ry={INNER.ry} className="planta-contorno" />
          {d.sectors.filter((s) => s.covered).map((s) => (
            <g key={`c-${s.id}`} clipPath={`url(#pl-${s.id}-${club})`}>
              <ellipse cx={CX} cy={CY} rx={INNER.rx - 3} ry={INNER.ry - 3} className="planta-cobertura" fill="none" />
            </g>
          ))}

          <g role={own ? "button" : "img"} tabIndex={own ? 0 : -1} aria-label={t("stadium.turf")} className={`planta-campo-grupo${own ? " clicavel" : ""}${open === "pitch" ? " ativo" : ""}`} onClick={() => choose("pitch")} onKeyDown={press("pitch")} data-testid="planta-pitch">
            <rect x={PITCH.x} y={PITCH.y} width={PITCH.w} height={PITCH.h} className={synthetic ? "planta-relvado sintetico" : "planta-relvado"} style={{ opacity: 0.5 + 0.5 * d.turf.value }} />
            <rect x={PITCH.x + 10} y={PITCH.y + 10} width={PITCH.w - 20} height={PITCH.h - 20} className="planta-linha" fill="none" />
            <line x1={CX} y1={PITCH.y + 10} x2={CX} y2={PITCH.y + PITCH.h - 10} className="planta-linha" />
            <text x={CX} y={PITCH.y + 52} textAnchor="middle" className="planta-campo titulo">{t(synthetic ? "stadium.turf.synthetic" : "stadium.turf.natural")}</text>
            <text x={CX} y={PITCH.y + 78} textAnchor="middle" className="planta-campo">{t("stadium.turf.state", { label: t(`stadium.turf.${turfLabel}` as Key), value: pct(d.turf.value) })}</text>
            <rect x={CX - 70} y={PITCH.y + 98} width="140" height="8" rx="4" className="planta-barra-fundo" />
            <rect x={CX - 70} y={PITCH.y + 98} width={140 * d.turf.value} height="8" rx="4" className="planta-barra-campo" />
          </g>

          {ORDER.map((id) => {
            const s = d.sectors.find((x) => x.id === id) as Sector;
            const at = TEXT_AT[id], room = Math.max(0, s.max - s.seats);
            return (
              <g key={`t-${id}`} className="planta-textos" pointerEvents="none">
                <text x={at.x} y={at.y} textAnchor="middle" className="planta-texto titulo">{t(`stadium.sector.${id}` as Key)}</text>
                <text x={at.x} y={at.y + 22} textAnchor="middle" className="planta-texto">{s.rings === 1 ? t("stadium.seatsRing1", { seats: num.format(s.seats) }) : t("stadium.seatsRings", { seats: num.format(s.seats), rings: s.rings })}</text>
                <text x={at.x} y={at.y + 42} textAnchor="middle" className="planta-texto">{`${eur2(d.basePrice * s.price)} · ${t(s.covered ? "stadium.coveredShort" : "stadium.uncoveredShort")}`}</text>
                {layers.room && (
                  <>
                    <text x={at.x} y={at.y + 64} textAnchor="middle" className="planta-nota-sub">{room > 0 ? t("stadium.expandability") : t("stadium.atMax")}</text>
                    <rect x={at.x - 55} y={at.y + 71} width="110" height="6" rx="3" className="planta-barra-fundo" />
                    <rect x={at.x - 55} y={at.y + 71} width={110 * (room / Math.max(1, s.max))} height="6" rx="3" className="planta-barra-cheia" />
                  </>
                )}
              </g>
            );
          })}

          {own && d.sectors.filter((s) => s.max - s.seats > 0).map((s) => (
            <g key={`p-${s.id}`} role="button" tabIndex={0} aria-label={t("stadium.orderFor", { sector: t(`stadium.sector.${s.id}` as Key) })} className="planta-mais" onClick={() => choose(s.id)} onKeyDown={press(s.id)} data-testid={`planta-mais-${s.id}`}>
              <circle cx={PLUS_AT[s.id].x} cy={PLUS_AT[s.id].y} r="15" />
              <path d={`M${PLUS_AT[s.id].x - 7} ${PLUS_AT[s.id].y}h14M${PLUS_AT[s.id].x} ${PLUS_AT[s.id].y - 7}v14`} />
            </g>
          ))}
        </svg>

        {own && open && (
          <div className="estadio-popup" role="dialog" aria-label={t("stadium.popup.title")} data-testid="stadium-popup">
            <button type="button" className="estadio-fechar" onClick={() => setOpen(undefined)} aria-label={t("stadium.popup.close")}>×</button>
            {sector ? (
              <>
                <h3>{t("stadium.popup.order", { sector: t(`stadium.sector.${sector.id}` as Key) })}</h3>
                <label className="estadio-campo coluna">
                  <span className="suave">{t("stadium.popup.seats", { seats: num.format(cover ? 0 : seats) })}</span>
                  <input type="range" min={d.limits.minSeats} max={Math.max(d.limits.minSeats, headroom)} step={100} value={Math.min(seats, Math.max(d.limits.minSeats, headroom))} disabled={cover || headroom < d.limits.minSeats} onChange={(e) => setSeats(Number(e.target.value))} data-testid="stadium-seats" />
                </label>
                {headroom < d.limits.minSeats && <p className="suave">{t("stadium.atMax")}</p>}
                <label className="estadio-campo">
                  <input type="checkbox" checked={cover} disabled={sector.covered} onChange={(e) => setCover(e.target.checked)} data-testid="stadium-cover" />
                  <span>{sector.covered ? t("stadium.coverDone") : t("stadium.popup.cover", { cost: eur(sector.coverCost) })}</span>
                </label>
                <label className="estadio-campo">
                  <span className="suave">{t("stadium.popup.price")}</span>
                  <input type="number" min={0.5} step={0.5} value={price} onChange={(e) => setPrice(e.target.value)} onBlur={() => void savePrice()} data-testid="stadium-price" />
                  <span className="suave">€</span>
                </label>
                {quote && !(headroom < d.limits.minSeats && !cover) && <p className="suave">{t("stadium.quote", { cost: eur(quote.cost), months: quote.months })}</p>}
                {(quote?.councilShare ?? 0) > 0 && !(headroom < d.limits.minSeats && !cover) && (
                  <label className="estadio-campo">
                    <input type="checkbox" checked={ask} onChange={(e) => setAsk(e.target.checked)} data-testid="stadium-ask-council" />
                    <span>{t("stadium.askCouncil", { pct: Math.round((quote?.councilShare ?? 0) * 100), value: eur(Math.round((quote?.cost ?? 0) * (quote?.councilShare ?? 0))) })}</span>
                  </label>
                )}
                <button type="button" className="primario" disabled={!!d.works || (!cover && headroom < d.limits.minSeats)} onClick={() => void submit()} data-testid="stadium-start">{t("stadium.start")}</button>
              </>
            ) : (
              <>
                <h3>{t("stadium.turf")}</h3>
                <p className="suave">{t("stadium.turf.hint")}</p>
                <div className="estadio-acoes">
                  {!synthetic && <button type="button" onClick={() => void turf("treat")} data-testid="turf-treat">{t("stadium.turf.treat", { cost: eur(d.turf.treatCost) })}</button>}
                  <button type="button" onClick={() => void turf("replace")} data-testid="turf-replace">{t(synthetic ? "stadium.turf.backNatural" : "stadium.turf.replace", { cost: eur(d.turf.replaceCost) })}</button>
                  {!synthetic && <button type="button" onClick={() => void turf("synthetic")} data-testid="turf-synthetic">{t("stadium.turf.installSynthetic", { cost: eur(d.turf.syntheticCost) })}</button>}
                </div>
              </>
            )}
            {message && <p className="erro" role="status">{message}</p>}
          </div>
        )}
      </div>
      {!compact && (
        <div className="estadio-camadas">
          <label><input type="checkbox" checked={layers.fill} onChange={(e) => setLayers((l) => ({ ...l, fill: e.target.checked }))} data-testid="layer-fill" /> {t("stadium.legend.fill")}</label>
          <label><input type="checkbox" checked={layers.rings} onChange={(e) => setLayers((l) => ({ ...l, rings: e.target.checked }))} data-testid="layer-rings" /> {t("stadium.legend.rings")}</label>
          <label><input type="checkbox" checked={layers.room} onChange={(e) => setLayers((l) => ({ ...l, room: e.target.checked }))} data-testid="layer-room" /> {t("stadium.expandability")}</label>
        </div>
      )}
      {d.works && <p className="suave">{t(d.works.kind === "cover" ? "stadium.works.cover" : "stadium.works.ongoing", { seats: num.format(d.works.seats), sector: t(`stadium.sector.${d.works.sector}` as Key).toLowerCase(), end: day(d.works.end) })}</p>}
    </div>
  );
}
