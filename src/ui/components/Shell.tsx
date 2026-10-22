"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { LOCALES, type Key } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";
import { save, read } from "@/ui/storage";
import { DevSimulate } from "@/ui/components/DevSimulate";
import { useDevMode, useSeeAll } from "@/ui/dev";
import { useInboxUnread } from "@/ui/useCash";
import { AdvanceButton } from "@/ui/components/AdvanceButton";
import { Icon, type IconName } from "@/ui/components/Icon";
import { Search } from "@/ui/components/Search";
import { CelebrationDialog } from "@/ui/components/CelebrationDialog";
import { useEngine } from "@/ui/EngineProvider";
import { ClubBar } from "@/ui/components/ClubBar";
import { useTime } from "@/ui/useTime";
import { ClubSelector, useClubs } from "@/ui/components/WithClub";
import { MatchProgress, useMatchProgress } from "@/ui/components/GameProgress";
import { useOwnClub } from "@/ui/myClub";

type ItemMenu = { rowKey: Key; icon: IconName; href?: string; whenActive: (path: string) => boolean; /** Ferramenta de developer: só no modo dev (`ui/dev.ts`). */ devOnly?: true; /** Não aparece no menu (tem lugar noutra página), mas continua a ter rota e migalhas. */ hidden?: true };

// Máximo 2 níveis (TOM_E_UX §3.5): secção no menu, separadores dentro da página. Sem href = ainda não existe.
const MENU: ItemMenu[] = [
  { rowKey: "menu.today", icon: "today", href: "/", whenActive: (c) => c === "/" },
  { rowKey: "menu.inbox", icon: "inbox", href: "/inbox/", whenActive: (c) => c.startsWith("/inbox"), hidden: true },
  { rowKey: "menu.competitions", icon: "competitions", href: "/competitions/", whenActive: (c) => c.startsWith("/competitions") },
  { rowKey: "menu.club", icon: "club", href: "/club/", whenActive: (c) => c.startsWith("/club") },
  { rowKey: "menu.squad", icon: "squad", href: "/squad/", whenActive: (c) => c.startsWith("/squad") },
  { rowKey: "menu.scouting", icon: "search", href: "/scouting/", whenActive: (c) => c.startsWith("/scouting") },
  { rowKey: "menu.tactic", icon: "tactic", href: "/tactics/", whenActive: (c) => c.startsWith("/tactics") },
  { rowKey: "menu.matches", icon: "matches", href: "/fixtures/", whenActive: (c) => c.startsWith("/fixtures") },
  { rowKey: "menu.city", icon: "city", href: "/city/", whenActive: (c) => c.startsWith("/city") },
  { rowKey: "menu.world", icon: "world", href: "/world/", whenActive: (c) => c.startsWith("/world"), devOnly: true },
  { rowKey: "menu.lab", icon: "lab", href: "/lab/", whenActive: (c) => c.startsWith("/lab"), devOnly: true },
];

/** As 4 secções que ficam sempre à mão do polegar, em baixo, no telemóvel; a 5.ª aba, «Mais», abre a gaveta com todas as outras. */
const TABS: Key[] = ["menu.today", "menu.club", "menu.squad", "menu.tactic"];

type Theme = "auto" | "light" | "dark";
const isTheme = (v: unknown): v is Theme => v === "auto" || v === "light" || v === "dark";
const NEXT_THEME: Record<Theme, Theme> = { auto: "light", light: "dark", dark: "auto" };

type Density = "normal" | "compact";
const isDensity = (v: unknown): v is Density => v === "normal" || v === "compact";

/** Estrutura base (docs/TONE_AND_UX.md): menu à esquerda, página ao centro, caixa à direita, barra em baixo. */
export function Shell({ children }: { children: ReactNode }) {
  const { t, locale, setLocale } = useT();
  const time = useTime();
  const engine = useEngine();
  // título do clube do gamer por celebrar (RZ-261): verifica-se quando o tempo ou a página mudam
  const [title, setTitle] = useState<{ competition: string; cup: boolean } | undefined>(undefined);
  const clubs = useClubs();
  const [ownClub, chooseClub] = useOwnClub();
  const path = usePathname() ?? "/";
  const router = useRouter();
  const today = time.state?.today;
  useEffect(() => {
    if (!engine || !ownClub) return;
    let live = true;
    engine.call("celebration", null).then((c) => { if (live && c) setTitle((old) => old ?? { competition: c.competition, cup: c.cup }); }).catch(() => undefined);
    return () => { live = false; };
  }, [engine, ownClub, today, path]);
  const dev = useDevMode();
  const [seeAll, setSeeAll] = useSeeAll();
  const [density, setDensity] = useState<Density>("normal");
  const [theme, setTheme] = useState<Theme>("auto");
  // Telemóvel: o menu completo é uma gaveta aberta pelo hambúrguer; as 5 secções principais ficam em abas em baixo.
  const [drawer, setDrawer] = useState(false);
  useEffect(() => { setDrawer(false); }, [path]);
  useEffect(() => {
    if (!drawer) return;
    document.querySelector<HTMLElement>(".menu-fechar")?.focus();
    const hotkey = (e: KeyboardEvent) => { if (e.key === "Escape") { setDrawer(false); document.querySelector<HTMLElement>(".menu-abrir")?.focus(); } };
    document.addEventListener("keydown", hotkey);
    return () => document.removeEventListener("keydown", hotkey);
  }, [drawer]);

  useEffect(() => {
    setDensity(read("raizes.density", isDensity) ?? "normal");
    setTheme(read("raizes.theme", isTheme) ?? "auto");
  }, []);
  useEffect(() => {
    document.documentElement.dataset.densidade = density === "compact" ? "compacta" : "normal";
  }, [density]);
  useEffect(() => {
    // o CSS usa data-tema="claro|escuro" (sem atributo = automático)
    if (theme === "auto") delete document.documentElement.dataset.tema;
    else document.documentElement.dataset.tema = theme === "light" ? "claro" : "escuro";
  }, [theme]);
  const toggleTheme = () => {
    const fresh = NEXT_THEME[theme];
    setTheme(fresh);
    save("raizes.theme", fresh);
  };
  const toggleDensity = () => {
    const fresh: Density = density === "normal" ? "compact" : "normal";
    setDensity(fresh);
    save("raizes.density", fresh);
  };

  // o tempo a passar: o ecrã escurece e volta, de forma suave (visível mesmo que o avanço seja instantâneo)
  const [passing, setPassing] = useState(false);
  const passStart = useRef(0);
  useEffect(() => {
    if (time.advancing) { passStart.current = Date.now(); setPassing(true); return; }
    if (!passStart.current) return;
    const timer = window.setTimeout(() => setPassing(false), Math.max(0, 450 - (Date.now() - passStart.current)));
    return () => window.clearTimeout(timer);
  }, [time.advancing]);
  const progress = useMatchProgress();
  const matchRunning = progress !== null;
  const onMatchPage = path.startsWith("/match");
  const matchInProgress = matchRunning && onMatchPage;
  const items = MENU.filter((m) => (!m.devOnly || dev) && !m.hidden);
  // «Mais» fica ativa quando a página atual só se chega pela gaveta
  const onlyInMore = !MENU.filter((m) => TABS.includes(m.rowKey)).some((m) => m.whenActive(path));
  // o assistente de nova save (RZ-138) ocupa o ecrã todo, sem menu nem barras
  if (path.startsWith("/new")) return <main className="centro novo-centro">{children}</main>;
  return (
    <div className="shell">
      <nav className={`menu${drawer ? " aberto" : ""}`} aria-label="Menu" id="menu-principal">
        <div className="marca">
          <span className="marca-sinal"><Icon name="root" /></span>
          <div>
            <strong>{t("app.name")}</strong>
            <small>{t("app.subtitle")}</small>
          </div>
          <button type="button" className="menu-fechar" aria-label={t("menu.close")} onClick={() => setDrawer(false)}><Icon name="close" /></button>
        </div>
        <ul>
          {matchRunning && !onMatchPage && <MatchLink minute={progress.minute} />}
          {items.filter((m) => !m.devOnly).map((m) => <ItemDoMenu key={m.rowKey} m={m} path={path} />)}
        </ul>
        {dev && (
          <div>
            <p className="menu-grupo">{t("menu.developer")}</p>
            <ul>
              {items.filter((m) => m.devOnly).map((m) => <ItemDoMenu key={m.rowKey} m={m} path={path} />)}
              {clubs && (
                <li className="menu-clube-dev" title={t("dev.club.hint")}>
                  <ClubSelector clubs={clubs} isOpen0={false} {...(ownClub ? { current: ownClub } : {})} onChoose={(id) => void chooseClub(id, true)} />
                </li>
              )}
              <DevSimulate />
              <li className="menu-interruptor">
                <button type="button" onClick={() => setSeeAll(!seeAll)} role="switch" aria-checked={seeAll} title={t("dev.seeAll.hint")} data-testid="ver-tudo">
                  <Icon name="eye" />
                  {t("dev.seeAll.label")}
                  <span className="interruptor" aria-hidden="true" />
                </button>
              </li>
            </ul>
          </div>
        )}
        <Settings theme={theme} onTheme={toggleTheme} density={density} onDensity={toggleDensity} locale={locale} aoLocale={setLocale} />
      </nav>
      <div className={`tempo-passa${passing ? " ativo" : ""}`} aria-hidden="true" />
      {drawer && <div className="menu-fundo" onClick={() => setDrawer(false)} aria-hidden="true" />}
      {!matchInProgress && (
        <header className="topo">
          <button type="button" className="menu-abrir" aria-label={t("menu.open")} aria-expanded={drawer} aria-controls="menu-principal" onClick={() => setDrawer(true)}><Icon name="menu" /></button>
          <Search />
          <span className="data-topo">{time.state ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${time.state.today}T00:00:00Z`)) : ""}</span>
        </header>
      )}
      <main className="centro">
        {path !== "/" && !matchInProgress && (
          <nav className="migalhas" aria-label={t("breadcrumbs.label")}>
            <button type="button" onClick={() => router.back()}>← {t("breadcrumbs.back")}</button>
          </nav>
        )}
        {children}
      </main>
      {title && <CelebrationDialog club={clubs?.find((c) => c.id === ownClub)?.name ?? ''} competition={title.competition} cup={title.cup} onClose={() => { setTitle(undefined); void engine?.call("dismissCelebration", null); }} />}
      <footer className={matchInProgress ? "barra barra-jogo" : "barra"}>
        <MatchProgress />
        <ClubBar club={ownClub} time={time} />
        <AdvanceButton />
      </footer>
      {matchRunning && !onMatchPage && <MatchLink minute={progress.minute} strip />}
      <nav className="abas" aria-label={t("menu.tabs")}>
        <ul>
          {TABS.map((k) => MENU.filter((m) => m.rowKey === k).map((m) => <ItemDoMenu key={m.rowKey} m={m} path={path} tab />))}
          <li className={onlyInMore ? "ativo" : undefined}>
            <button type="button" aria-haspopup="dialog" aria-expanded={drawer} aria-controls="menu-principal" onClick={() => setDrawer(true)}>
              <Icon name="menu" />
              <span className="menu-texto">{t("menu.more")}</span>
            </button>
          </li>
        </ul>
      </nav>
    </div>
  );
}

/** Botão de definições no fundo do menu: abre um pequeno menu com tema, densidade e idioma. */
function Settings({ theme, onTheme, density, onDensity, locale, aoLocale }: { theme: Theme; onTheme: () => void; density: Density; onDensity: () => void; locale: string; aoLocale: (l: (typeof LOCALES)[number]) => void }) {
  const { t } = useT();
  const [isOpen, setIsOpen] = useState(false);
  const inbox = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isOpen) return;
    const away = (e: MouseEvent) => { if (inbox.current && !inbox.current.contains(e.target as Node)) setIsOpen(false); };
    const hotkey = (e: KeyboardEvent) => { if (e.key === "Escape") setIsOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", hotkey);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", hotkey); };
  }, [isOpen]);
  return (
    <div className="definicoes" ref={inbox}>
      <button type="button" className="definicoes-botao" aria-label={t("settings.label")} aria-expanded={isOpen} aria-haspopup="true" aria-controls="menu-definicoes" onClick={() => setIsOpen((v) => !v)}>
        <Icon name="settings" />
        <span>{t("settings.label")}</span>
      </button>
      {isOpen && (
        <div className="definicoes-menu" id="menu-definicoes" role="group" aria-label={t("settings.label")}>
          <div className="definicoes-linha"><span>{t("theme.label")}</span><button type="button" onClick={onTheme} data-testid="theme">{t(`theme.${theme}` as Key)}</button></div>
          <div className="definicoes-linha"><span>{t("settings.density")}</span><button type="button" onClick={onDensity} aria-pressed={density === "compact"} data-testid="density">{t(density === "compact" ? "density.compact" : "density.normal")}</button></div>
          <label className="definicoes-linha"><span>{t("language.label")}</span>
            <select value={locale} aria-label={t("language.label")} onChange={(e) => aoLocale(e.target.value as (typeof LOCALES)[number])}>
              {LOCALES.map((l) => <option key={l} value={l}>{t(`language.${l}`)}</option>)}
            </select>
          </label>
        </div>
      )}
    </div>
  );
}

function InboxBadge() {
  const { t } = useT();
  const unread = useInboxUnread();
  return unread > 0 ? <span className="distintivo" aria-label={t("inbox.unread", { n: unread })}>{unread > 99 ? "99+" : unread}</span> : null;
}

function ItemDoMenu({ m, path, tab = false }: { m: ItemMenu; path: string; tab?: boolean }) {
  const { t } = useT();
  const active = m.whenActive(path);
  const content = (
    <>
      <Icon name={m.icon} />
      <span className="menu-texto">{t(m.rowKey)}</span>
      {m.rowKey === "menu.today" && !tab && <InboxBadge />}
    </>
  );
  return (
    <li aria-current={active ? "page" : undefined} className={active ? "ativo" : m.href ? undefined : "inativo"} title={m.href ? undefined : t("menu.soon")}>
      {m.href ? <Link href={m.href}>{content}</Link> : <span>{content}</span>}
    </li>
  );
}

/** «Jogo a decorrer»: ponto vivo, minuto e ligação de volta à página do jogo; na barra lateral/gaveta ou, no telemóvel, como faixa por cima das abas. */
function MatchLink({ minute, strip = false }: { minute: number; strip?: boolean }) {
  const { t } = useT();
  const link = (
    <Link href="/match/" className="jogo-a-decorrer" data-testid={strip ? "match-strip" : "match-nav"}>
      <span className="ponto-vivo" aria-hidden="true" />
      <span className="menu-texto">{t("menu.matchLive")}</span>
      <span className="jogo-minuto">{Math.floor(minute)}&apos;</span>
    </Link>
  );
  return strip ? <div className="jogo-faixa">{link}</div> : <li className="menu-jogo">{link}</li>;
}
