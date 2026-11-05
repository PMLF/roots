"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { StadiumPageData } from "@/engine/api/contracts";
import { Data } from "@/ui/components/Card";
import { CloseButton } from "@/ui/components/CloseButton";
import { Icon } from "@/ui/components/Icon";
import { useEngine } from "@/ui/EngineProvider";
import type { Key } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";

type Sector = StadiumPageData["sectors"][number];
type SectorId = Sector["id"];
/** Nome da bancada: «Bancada Este», ou «Bancada Martins Digital» se uma empresa lhe dá o nome. */
const nameOf = (t: ReturnType<typeof useT>["t"], s: Sector) => (s.sponsor ? t(`stadium.sectorNamed.${s.id}` as Key, { name: s.sponsor.name }) : t(`stadium.sector.${s.id}` as Key));
type Quote = { cost: number; clubCost: number; councilShare: number; months: number; maxSeats: number };

const W = 880, H = 600, CX = 440, CY = 300;
const INNER = { rx: 360, ry: 215 };
const OUTER = { rx: 420, ry: 262 };
const PITCH = { x: 270, y: 228, w: 340, h: 144 };
const pctX = (x: number) => `${(x / W) * 100}%`;
const pctY = (y: number) => `${(y / H) * 100}%`;
const P = { l: PITCH.x, r: PITCH.x + PITCH.w, t: PITCH.y, b: PITCH.y + PITCH.h };
/** Cada bancada ocupa o espaço entre as diagonais que saem dos cantos do campo; recortado pela oval. */
const AREAS: Record<SectorId, string> = {
  side: `${P.l},${P.t} ${P.r},${P.t} 840,-40 40,-40`,
  central: `${P.l},${P.b} ${P.r},${P.b} 840,640 40,640`,
  north: `${P.l},${P.t} ${P.l},${P.b} 40,640 -40,640 -40,-40 40,-40`,
  south: `${P.r},${P.t} ${P.r},${P.b} 840,640 920,640 920,-40 840,-40`,
};
const TEXT_AT: Record<SectorId, { x: number; y: number }> = { side: { x: CX, y: 102 }, central: { x: CX, y: 386 }, north: { x: 172, y: 262 }, south: { x: 708, y: 262 } };
const PLUS_AT: Record<SectorId, { x: number; y: number }> = { side: { x: CX, y: 44 }, central: { x: CX, y: 556 }, north: { x: 30, y: CY }, south: { x: 850, y: CY } };
const ORDER: SectorId[] = ["side", "north", "south", "central"];

type Open = SectorId | "pitch" | undefined;

/**
 * Planta fechada do estádio (RZ-116): o campo ao centro (tipo e estado do relvado) e uma bancada em cada lado, com lugares, anéis, preço,
 * cobertura e a expansibilidade que ainda resta. Qualquer clube se vê; só o clube do gamer tem os tracejados (a área de expansão) e o «+»
 * que abrem o pedido de obra, preço e cobertura.
 */
export function StadiumPlan({ club, compact = false, header }: { club: string; compact?: boolean; /** Cabeçalho que precisa dos dados do estádio (nome, patrocinador). */ header?: (d: StadiumPageData) => React.ReactNode }) {
  const { t, locale } = useT();
  const engine = useEngine();
  const [data, setData] = useState<StadiumPageData | null | undefined>(undefined);
  const [open, setOpen] = useState<Open>(undefined);
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
    if (typeof window !== "undefined" && (window.getSelection()?.toString() ?? "") !== "") return; // a selecionar texto não abre o pedido
    setMessage(undefined);
    setCover(false);
    const s = id && id !== "pitch" ? d.sectors.find((x) => x.id === id) : undefined;
    if (s) { setPrice((d.basePrice * s.price).toFixed(2)); setSeats(Math.min(Math.max(d.limits.minSeats, 500), Math.max(d.limits.minSeats, s.max - s.seats))); setAsk(true); }
    setOpen(id);
  };
  const press = (id: Open) => (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(id); } };
  const savePrice = async () => {
    if (!sector) return;
    const value = Number(price.replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) return;
    const r = await engine!.call("setStadiumPrice", { sector: sector.id, price: value / d.basePrice });
    setPrice((d.basePrice * r.price).toFixed(2));
    load();
  };
  const submit = async () => {
    if (!sector) return;
    setMessage(undefined);
    await savePrice();
    if (!cover && headroom < d.limits.minSeats) { setOpen(undefined); return; }
    const r = await engine!.call("startStadiumWorks", { sector: sector.id, seats: cover ? 0 : seats, kind: cover ? "cover" : "expand", askCouncil: ask && (quote?.councilShare ?? 0) > 0 });
    if (!r.ok) setMessage(t(`stadium.reason.${r.reason}` as Key));
    else setOpen(undefined);
    load();
  };
  const turf = async (kind: "treat" | "replace" | "synthetic") => {
    setMessage(undefined);
    const r = await engine!.call("treatTurf", { kind });
    if (!r.ok) setMessage(t(`stadium.turf.reason.${r.reason}` as Key));
    else setOpen(undefined);
    load();
  };
  const synthetic = d.turf.type === "synthetic";
  const turfLabel = d.turf.value >= 0.8 ? "excellent" : d.turf.value >= 0.55 ? "good" : d.turf.value >= 0.35 ? "worn" : "bad";
  const tooBig = !cover && !!quote && seats > quote.maxSeats;
  const canOrder = !d.works && !tooBig && (cover || headroom >= d.limits.minSeats);

  return (
    <div className={`estadio-plano${compact ? " compacto" : ""}`} data-testid="stadium-plan">
      {header?.(d)}
      <div className="planta-rolagem"><div className="planta" role="group" aria-label={t("stadium.plan")}>
        <svg viewBox={`0 0 ${W} ${H}`} className="planta-svg" aria-hidden="true">
          <defs>
            <clipPath id={`pl-oval-${club}`}><ellipse cx={CX} cy={CY} rx={INNER.rx} ry={INNER.ry} /></clipPath>
            {ORDER.map((id) => <clipPath key={id} id={`pl-${id}-${club}`}><polygon points={AREAS[id]} /></clipPath>)}
            <pattern id={`pl-obra-${club}`} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="8" fill="var(--atencao)" opacity="0.5" /></pattern>
          </defs>

          {own && d.sectors.map((s) => {
            const room = Math.max(0, s.max - s.seats);
            return (
              <g key={`x-${s.id}`} clipPath={`url(#pl-${s.id}-${club})`} role="button" tabIndex={room === 0 ? -1 : 0} aria-disabled={room === 0} aria-label={t("stadium.orderFor", { sector: t(`stadium.sector.${s.id}` as Key) })}
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
              <g key={id} clipPath={`url(#pl-${id}-${club})`} pointerEvents="none">
                <ellipse cx={CX} cy={CY} rx={INNER.rx} ry={INNER.ry} className="planta-bancada" />
                {bands.map((i) => <ellipse key={i} cx={CX} cy={CY} rx={INNER.rx * (1 - (0.57 * i) / s.rings)} ry={INNER.ry * (1 - (0.57 * i) / s.rings)} className="planta-anel" fill="none" />)}
                {working && <ellipse cx={CX} cy={CY} rx={INNER.rx} ry={INNER.ry} fill={`url(#pl-obra-${club})`} />}
              </g>
            );
          })}
          <g clipPath={`url(#pl-oval-${club})`} pointerEvents="none">
            {[[P.l, P.t, 40, -40], [P.r, P.t, 840, -40], [P.l, P.b, 40, 640], [P.r, P.b, 840, 640]].map(([x1, y1, x2, y2], i) => <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className="planta-divisoria" />)}
          </g>
          <ellipse cx={CX} cy={CY} rx={INNER.rx} ry={INNER.ry} className="planta-contorno" />
          {d.sectors.filter((s) => s.covered).map((s) => (
            <g key={`c-${s.id}`} clipPath={`url(#pl-${s.id}-${club})`} pointerEvents="none">
              <ellipse cx={CX} cy={CY} rx={INNER.rx - 3} ry={INNER.ry - 3} className="planta-cobertura" fill="none" />
            </g>
          ))}
          {own && d.sectors.filter((s) => s.max - s.seats > 0).map((s) => (
            <g key={`p-${s.id}`} role="button" tabIndex={0} aria-label={t("stadium.orderFor", { sector: t(`stadium.sector.${s.id}` as Key) })} className="planta-mais" onClick={() => choose(s.id)} onKeyDown={press(s.id)} data-testid={`planta-mais-${s.id}`}>
              <circle cx={PLUS_AT[s.id].x} cy={PLUS_AT[s.id].y} r="15" />
              <path d={`M${PLUS_AT[s.id].x - 7} ${PLUS_AT[s.id].y}h14M${PLUS_AT[s.id].x} ${PLUS_AT[s.id].y - 7}v14`} />
            </g>
          ))}
        </svg>

        <div className={`planta-campo${own ? " clicavel" : ""}${open === "pitch" ? " ativo" : ""}`} style={{ left: pctX(PITCH.x), top: pctY(PITCH.y), width: pctX(PITCH.w), height: pctY(PITCH.h) }}
          role={own ? "button" : undefined} tabIndex={own ? 0 : undefined} aria-label={own ? t("stadium.turf") : undefined} onClick={() => choose("pitch")} onKeyDown={press("pitch")} data-testid="planta-pitch">
          <span className={`planta-relva${synthetic ? " sintetico" : ""}`} style={{ opacity: 0.45 + 0.55 * d.turf.value }} aria-hidden="true" />
          <span className="planta-linhas" aria-hidden="true" />
          <div className="planta-campo-texto">
            <b>{t(synthetic ? "stadium.turf.synthetic" : "stadium.turf.natural")}</b>
            <span>{t("stadium.turf.state", { label: t(`stadium.turf.${turfLabel}` as Key), value: pct(d.turf.value) })}</span>
            <span className="planta-barra" aria-hidden="true"><i style={{ width: pct(d.turf.value) }} /></span>
          </div>
        </div>

        {ORDER.map((id) => {
          const s = d.sectors.find((x) => x.id === id) as Sector;
          const at = TEXT_AT[id], room = Math.max(0, s.max - s.seats);
          return (
            <div key={`t-${id}`} className="planta-bancada-texto" style={{ left: pctX(at.x), top: pctY(at.y) }} data-testid={`planta-texto-${id}`}>
              <b>{nameOf(t, s)}</b>
              <span>{s.rings === 1 ? t("stadium.seatsRing1", { seats: num.format(s.seats) }) : t("stadium.seatsRings", { seats: num.format(s.seats), rings: s.rings })}</span>
              <span>{`${eur2(d.basePrice * s.price)} · ${t(s.covered ? "stadium.coveredShort" : "stadium.uncoveredShort")}`}</span>
              <small className="suave">{room > 0 ? t("stadium.expandability") : t("stadium.atMax")}</small>
              <span className="planta-barra" aria-hidden="true"><i style={{ width: `${(room / Math.max(1, s.max)) * 100}%` }} /></span>
            </div>
          );
        })}
      </div></div>

      {!compact && (
        <ul className="estadio-legenda" aria-label={t("stadium.legend")}>
          <li><i className="amostra cobertura" />{t("stadium.legend.covered")}</li>
          <li><i className="amostra obra" />{t("stadium.legend.works")}</li>
          <li><i className="amostra aneis" />{t("stadium.legend.rings")}</li>
          {own && <li><i className="amostra expansao" />{t("stadium.legend.expand")}</li>}
          {own && <li><i className="amostra cheio" />{t("stadium.legend.full")}</li>}
        </ul>
      )}
      {d.works && <p className="suave">{t(d.works.kind === "cover" ? "stadium.works.cover" : "stadium.works.ongoing", { seats: num.format(d.works.seats), sector: t(`stadium.sector.${d.works.sector}` as Key).toLowerCase(), end: day(d.works.end) })}</p>}

      {own && open && (
        <PlanDialog onClose={() => setOpen(undefined)} title={sector ? t("stadium.popup.order", { sector: nameOf(t, sector) }) : t("stadium.turf")}>
          {sector ? (
            <form className="formulario coluna" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
              <label>
                <span>{t("stadium.popup.seats", { seats: num.format(cover ? 0 : seats) })}</span>
                <input type="range" min={d.limits.minSeats} max={Math.max(d.limits.minSeats, headroom)} step={100} value={Math.min(seats, Math.max(d.limits.minSeats, headroom))} disabled={cover || headroom < d.limits.minSeats} onChange={(e) => setSeats(Number(e.target.value))} data-testid="stadium-seats" />
                {headroom < d.limits.minSeats && <small>{t("stadium.atMax")}</small>}
              </label>
              <label className="opcao">
                <input type="checkbox" checked={cover} disabled={sector.covered} onChange={(e) => setCover(e.target.checked)} data-testid="stadium-cover" />
                <span>{sector.covered ? t("stadium.coverDone") : t("stadium.popup.cover", { cost: eur(sector.coverCost) })}</span>
              </label>
              <label>
                <span>{t("stadium.popup.price")} (€)</span>
                <input type="number" min={0.5} step={0.5} value={price} onChange={(e) => setPrice(e.target.value)} onBlur={() => void savePrice()} data-testid="stadium-price" />
              </label>
              {tooBig && <Notice tone="aviso" title={t("stadium.notice.tooBig")}>{t("stadium.notice.tooBigBody", { max: num.format(quote?.maxSeats ?? 0) })}</Notice>}
              {quote && canOrder && !tooBig && <Data lines={[{ label: t("stadium.popup.cost"), value: eur(quote.cost) }, { label: t("stadium.popup.term"), value: t("stadium.popup.months", { months: quote.months }) }]} />}
              {(quote?.councilShare ?? 0) > 0 && canOrder && (
                <label className="opcao">
                  <input type="checkbox" checked={ask} onChange={(e) => setAsk(e.target.checked)} data-testid="stadium-ask-council" />
                  <span>{t("stadium.askCouncil", { pct: Math.round((quote?.councilShare ?? 0) * 100), value: eur(Math.round((quote?.cost ?? 0) * (quote?.councilShare ?? 0))) })}</span>
                </label>
              )}
              {message && <Notice tone="erro" title={t("stadium.notice.failed")}>{message}</Notice>}
              <div className="acoes">
                <button type="submit" className="primario" disabled={!canOrder} data-testid="stadium-start">{t("stadium.start")}</button>
                <button type="button" onClick={() => setOpen(undefined)}>{t("stadium.popup.close")}</button>
              </div>
            </form>
          ) : (
            <div className="formulario coluna">
              <p className="suave">{t("stadium.turf.hint")}</p>
              <div className="estadio-opcoes">
                {!synthetic && <button type="button" onClick={() => void turf("treat")} data-testid="turf-treat">{t("stadium.turf.treat", { cost: eur(d.turf.treatCost) })}</button>}
                <button type="button" onClick={() => void turf("replace")} data-testid="turf-replace">{t(synthetic ? "stadium.turf.backNatural" : "stadium.turf.replace", { cost: eur(d.turf.replaceCost) })}</button>
                {!synthetic && <button type="button" onClick={() => void turf("synthetic")} data-testid="turf-synthetic">{t("stadium.turf.installSynthetic", { cost: eur(d.turf.syntheticCost) })}</button>}
              </div>
              {message && <Notice tone="erro" title={t("stadium.notice.failed")}>{message}</Notice>}
              <div className="acoes"><button type="button" onClick={() => setOpen(undefined)}>{t("stadium.popup.close")}</button></div>
            </div>
          )}
        </PlanDialog>
      )}
    </div>
  );
}

/** Popup modal do produto (`<dialog class="popup">`), como os outros: cruz no canto, fecha com Esc ou clicando fora. */
function PlanDialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return (
    <dialog ref={ref} className="popup popup-estadio" aria-label={title} data-testid="stadium-popup" onClose={onClose} onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}>
      <CloseButton onClose={() => ref.current?.close()} />
      <h2>{title}</h2>
      {children}
    </dialog>
  );
}

/** Aviso com ícone e cor (como o resultado de uma negociação): para o que impede ou corrige um pedido. */
function Notice({ tone, title, children }: { tone: "aviso" | "erro"; title: string; children: React.ReactNode }) {
  return (
    <div className={`resultado-negocio ${tone}`} role="alert"><Icon name="warning" /><div><b>{title}</b><span>{children}</span></div></div>
  );
}
