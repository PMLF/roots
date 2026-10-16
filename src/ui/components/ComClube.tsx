"use client";
import { isInSecondDistrict } from "@/engine/epoca/distritais";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { SummaryClub, ClubOffer } from "@/engine/api/contratos";
import type { Key } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";
import { useOwnClub } from "@/ui/meuClube";
import { useEngine } from "@/ui/MotorProvider";

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
        {name ?? t("meuClube.escolher")} <span aria-hidden="true">▾</span>
      </button>
      {isOpen && (
        <div className="seletor-painel" role="group" aria-label={t("meuClube.escolher")}>
          <input type="search" autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={t("meuClube.pesquisar")} aria-label={t("meuClube.pesquisar")} />
          <ul className="seletor-lista">
            {visible.map((c) => (
              <li key={c.id}>
                <button type="button" className={c.id === current ? "active" : undefined} onClick={() => { onChoose(c.id); setIsOpen(false); setText(""); }}>
                  {c.name} <span className="suave">{c.league}</span>
                </button>
              </li>
            ))}
            {visible.length === 0 && <li className="vazio">{t("meuClube.semResultados")}</li>}
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
  const { t } = useT();
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
      <p>{previous ? t("meuClube.semClubeDe", { club: previous }) : t("meuClube.semClube")}</p>
      {offers.length === 0 ? <p className="vazio">{t("meuClube.ofertasVazio")}</p> : (
        <ul className="ofertas">
          {offers.map((o) => (
            <li key={o.id}>
              <b>{o.name}</b> <span className="suave">{o.league} · {t(`reputacao.nivel.${o.levelReputation}` as Key)}</span>{" "}
              <button type="button" className="primario" onClick={() => void accept(o.id)}>{t("meuClube.aceitar")}</button>
            </li>
          ))}
        </ul>
      )}
      <p className="suave">{t("meuClube.ofertasRenovam")}</p>
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
      <p>{t("meuClube.comecar")}</p>
      <ClubSelector clubs={clubs} isOpen0 onChoose={(id) => void set(id)} />
    </div>
  );
}

/** Demitir-se do clube (pede confirmação). */
export function ResignButton() {
  const { t } = useT();
  const engine = useEngine();
  const [confirm, setConfirm] = useState(false);
  const resign = async () => {
    await engine?.call("resign", null);
    setConfirm(false);
    window.dispatchEvent(new Event("raizes:meuClube"));
    window.dispatchEvent(new Event("raizes:tempo"));
  };
  return confirm ? (
    <span className="acoes">
      <span className="suave">{t("meuClube.confirmarDemitir")}</span>
      <button type="button" onClick={() => void resign()}>{t("meuClube.demitirSim")}</button>
      <button type="button" onClick={() => setConfirm(false)}>{t("meuClube.cancelar")}</button>
    </span>
  ) : (
    <button type="button" onClick={() => setConfirm(true)}>{t("meuClube.demitir")}</button>
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
  if (clubs === null) return <p className="vazio" data-testid="sem-mundo">{t("hoje.semMundo")} <Link href="/world/">{t("hoje.criarMundo")}</Link></p>;
  if (clubs === undefined || !ready) return <p>{t("ficha.aCarregar")}</p>;
  if (!mine || !clubs.some((c) => c.id === mine)) return <ChooseInitialClub />;
  return (
    <section className="pagina-clube">
      {title && <h1>{title}</h1>}
      {children(mine)}
    </section>
  );
}
