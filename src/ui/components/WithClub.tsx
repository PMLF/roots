"use client";
import { isInSecondDistrict } from "@/engine/season/districts";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { SummaryClub, ClubOffer } from "@/engine/api/contracts";
import type { Key } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";
import { useOwnClub } from "@/ui/myClub";
import { useEngine } from "@/ui/EngineProvider";

const RESULTS_MAX = 40;
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Dropdown com pesquisa para escolher o clube (mesma lógica do seletor de ligas). */
export function ClubSelector({ clubs, current, onChoose, isOpen0 }: { clubs: SummaryClub[]; current?: string; onChoose: (id: string) => void; isOpen0?: boolean }) {
  const { t } = useT();
  const [isOpen, setIsOpen] = useState(isOpen0 ?? !current);
  const [text, setText] = useState("");
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isOpen || !current) return;
    const away = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setIsOpen(false); };
    const tier = (e: KeyboardEvent) => { if (e.key === "Escape") setIsOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", tier);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", tier); };
  }, [isOpen, current]);
  const name = clubs.find((c) => c.id === current)?.name;
  const visible = useMemo(() => {
    const q = norm(text.trim());
    return clubs.filter((c) => !isInSecondDistrict(c.league) && (!q || norm(c.name).includes(q) || norm(c.league).includes(q))).slice(0, RESULTS_MAX);
  }, [clubs, text]);
  return (
    <div className="seletor-ligas" ref={root}>
      <button type="button" aria-expanded={isOpen} aria-haspopup="true" onClick={() => setIsOpen((v) => !v)}>
        {name ?? t("myClub.choose")} <span aria-hidden="true">▾</span>
      </button>
      {isOpen && (
        <div className="seletor-painel" role="group" aria-label={t("myClub.choose")}>
          <input type="search" autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={t("myClub.find")} aria-label={t("myClub.find")} />
          <ul className="seletor-lista">
            {visible.map((c) => (
              <li key={c.id}>
                <button type="button" className={c.id === current ? "active" : undefined} onClick={() => { onChoose(c.id); setIsOpen(false); setText(""); }}>
                  {c.name} <span className="suave">{c.league}</span>
                </button>
              </li>
            ))}
            {visible.length === 0 && <li className="vazio">{t("myClub.noResults")}</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Os clubes do mundo (vazio até haver mundo; `null` se não há mundo). */
export function useClubs(): SummaryClub[] | null | undefined {
  const engine = useEngine();
  const [clubs, setClubs] = useState<SummaryClub[] | null | undefined>(undefined);
  useEffect(() => {
    if (!engine) return;
    let live = true;
    const load = () => { engine.call("worldState", null).then((m) => (m ? engine.call("clubs", null) : null)).then((c) => live && setClubs(c)).catch(() => live && setClubs(null)); };
    load();
    window.addEventListener("raizes:mundo", load);
    return () => { live = false; window.removeEventListener("raizes:mundo", load); };
  }, [engine]);
  return clubs;
}

/** Ofertas de clubes quando o gamer está sem clube (RZ-157). */
function ClubsOffers({ offers, previous }: { offers: ClubOffer[]; previous?: string }) {
  const { t, locale } = useT();
  const engine = useEngine();
  const [error, setError] = useState<string | undefined>(undefined);
  const accept = async (id: string) => {
    try {
      await engine?.call("acceptOffer", { id });
      window.dispatchEvent(new Event("raizes:meuClube"));
      window.dispatchEvent(new Event("raizes:tempo"));
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  return (
    <div className="pagina-clube">
      <p>{previous ? t("myClub.noClubOf", { club: previous }) : t("myClub.noClub")}</p>
      {offers.length === 0 ? <p className="vazio">{t("myClub.noOffers")}</p> : (
        <ul className="ofertas">
          {offers.map((o) => (
            <li key={o.id}>
              <b>{o.name}</b> <span className="suave">{o.league} · {t(`reputation.level.${o.levelReputation}` as Key)}</span>{" "}
              <span className="suave">{t("contract.wageOffer", { value: new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(o.wage) })}</span>{" "}
              <Link href={`/contract/?club=${o.id}`} className="botao" data-testid={`oferta-negociar-${o.id}`}>{t("contract.negotiate")}</Link>{" "}
              <button type="button" className="primario" onClick={() => void accept(o.id)}>{t("myClub.accept")}</button>
            </li>
          ))}
        </ul>
      )}
      <p className="suave">{t("myClub.renewalOffers")}</p>
      {error && <p className="erro">{error}</p>}
    </div>
  );
}

/** Escolha do clube para começar o save (onboarding provisório até RZ-138); sem clube depois de uma demissão, as ofertas. */
export function ChooseInitialClub() {
  const { t } = useT();
  const engine = useEngine();
  const clubs = useClubs();
  const [, set] = useOwnClub();
  const [situation, setSituation] = useState<Awaited<ReturnType<NonNullable<typeof engine>["call"]>> | undefined>(undefined);
  useEffect(() => {
    if (!engine) return;
    let live = true;
    const load = () => { engine.call("offers", null).then((o) => live && setSituation(o)).catch(() => undefined); };
    load();
    window.addEventListener("raizes:tempo", load);
    window.addEventListener("raizes:meuClube", load);
    return () => { live = false; window.removeEventListener("raizes:tempo", load); window.removeEventListener("raizes:meuClube", load); };
  }, [engine]);
  const o = situation as { unemployed: boolean; previous?: string; offers: ClubOffer[] } | undefined;
  if (!clubs || !o) return null;
  if (o.unemployed) return <ClubsOffers offers={o.offers} {...(o.previous ? { previous: o.previous } : {})} />;
  return (
    <div className="pagina-clube">
      <p>{t("myClub.start")}</p>
      <ClubSelector clubs={clubs} isOpen0 onChoose={(id) => void set(id)} />
    </div>
  );
}

/** Ligação para pedir um aumento (só aparece se o save tem contrato do gamer, RZ-161). */
export function ContractLink() {
  const { t } = useT();
  const engine = useEngine();
  const [has, setHas] = useState(false);
  useEffect(() => {
    if (!engine) return;
    let live = true;
    const load = () => { engine.call("gamerContract", null).then((c) => live && setHas(c !== null)).catch(() => undefined); };
    load();
    window.addEventListener("raizes:meuClube", load);
    return () => { live = false; window.removeEventListener("raizes:meuClube", load); };
  }, [engine]);
  return has ? <Link href="/contract/" data-testid="link-contrato">{t("contract.askRaise")}</Link> : null;
}

/** Demitir-se do clube (pede confirmação). */
export function ResignButton() {
  const { t, locale } = useT();
  const engine = useEngine();
  const [confirm, setConfirm] = useState(false);
  const [cost, setCost] = useState(0);
  const money = new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const ask = async () => {
    const c = await engine?.call("gamerContract", null);
    setCost(c?.resignCost ?? 0);
    setConfirm(true);
  };
  const resign = async () => {
    await engine?.call("resign", null);
    setConfirm(false);
    window.dispatchEvent(new Event("raizes:meuClube"));
    window.dispatchEvent(new Event("raizes:tempo"));
  };
  return confirm ? (
    <span className="acoes">
      <span className="suave">{t("myClub.confirmResign")}{cost > 0 && ` ${t("myClub.resignCost", { amount: money.format(cost) })}`}</span>
      <button type="button" onClick={() => void resign()}>{t("myClub.resignYes")}</button>
      <button type="button" onClick={() => setConfirm(false)}>{t("myClub.cancel")}</button>
    </span>
  ) : (
    <button type="button" onClick={() => void ask()}>{t("myClub.resign")}</button>
  );
}

/**
 * Moldura das páginas do clube (Clube, Plantel, Jogos, Cidade): mostra sempre o clube do save. Sem mundo ou sem clube
 * escolhido, leva a criar o mundo ou a escolher o clube.
 */
export function WithClub({ title, children }: { title: string; children: (club: string) => ReactNode }) {
  const { t } = useT();
  const clubs = useClubs();
  const [mine, , ready] = useOwnClub();
  if (clubs === null) return <p className="vazio" data-testid="sem-mundo">{t("today.noWorld")} <Link href="/new/">{t("today.createWorld")}</Link></p>;
  if (clubs === undefined || !ready) return <p>{t("profile.loading")}</p>;
  if (!mine || !clubs.some((c) => c.id === mine)) return <ChooseInitialClub />;
  return (
    <section className="pagina-clube">
      {title && <h1>{title}</h1>}
      {children(mine)}
    </section>
  );
}
