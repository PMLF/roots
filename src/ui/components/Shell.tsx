"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { LOCALES, type Key } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";
import { save, read } from "@/ui/armazenamento";
import { useDevMode, useSeeAll } from "@/ui/dev";
import { useInboxUnread } from "@/ui/useCaixa";
import { AdvanceButton } from "@/ui/components/BotaoAvancar";
import { Icon, type IconName } from "@/ui/components/Icone";
import { Search } from "@/ui/components/Pesquisa";
import { useTime } from "@/ui/useTempo";
import { ClubSelector, useClubs } from "@/ui/components/ComClube";
import { MatchProgress, useOngoingMatch } from "@/ui/components/ProgressoJogo";
import { useOwnClub } from "@/ui/meuClube";

type ItemMenu = { rowKey: Key; icon: IconName; href?: string; whenActive: (path: string) => boolean; /** Ferramenta de developer: só no modo dev (`ui/dev.ts`). */ devOnly?: true; /** Não aparece no menu (tem lugar noutra página), mas continua a ter rota e migalhas. */ hidden?: true };

// Máximo 2 níveis (TOM_E_UX §3.5): secção no menu, separadores dentro da página. Sem href = ainda não existe.
const MENU: ItemMenu[] = [
  { rowKey: "menu.hoje", icon: "today", href: "/", whenActive: (c) => c === "/" },
  { rowKey: "menu.noticias", icon: "news", href: "/news/", whenActive: (c) => c.startsWith("/news") },
  { rowKey: "menu.caixa", icon: "inbox", href: "/inbox/", whenActive: (c) => c.startsWith("/inbox"), hidden: true },
  { rowKey: "menu.competicoes", icon: "competitions", href: "/competitions/", whenActive: (c) => c.startsWith("/competitions") },
  { rowKey: "menu.clube", icon: "club", href: "/club/", whenActive: (c) => c.startsWith("/club") },
  { rowKey: "menu.plantel", icon: "squad", href: "/squad/", whenActive: (c) => c.startsWith("/squad") },
  { rowKey: "menu.tatica", icon: "tactic", href: "/tactics/", whenActive: (c) => c.startsWith("/tactics") },
  { rowKey: "menu.jogos", icon: "matches", href: "/fixtures/", whenActive: (c) => c.startsWith("/fixtures") },
  { rowKey: "menu.cidade", icon: "city", href: "/city/", whenActive: (c) => c.startsWith("/city") },
  { rowKey: "menu.mundo", icon: "world", href: "/world/", whenActive: (c) => c.startsWith("/world"), devOnly: true },
  { rowKey: "menu.laboratorio", icon: "lab", href: "/lab/", whenActive: (c) => c.startsWith("/lab"), devOnly: true },
];

type Theme = "auto" | "light" | "dark";
const isTheme = (v: unknown): v is Theme => v === "auto" || v === "light" || v === "dark";
const NEXT_THEME: Record<Theme, Theme> = { auto: "light", light: "dark", dark: "auto" };

type Density = "normal" | "compact";
const isDensity = (v: unknown): v is Density => v === "normal" || v === "compact";

/** Estrutura base (docs/TOM_E_UX.md): menu à esquerda, página ao centro, caixa à direita, barra em baixo. */
export function Shell({ children }: { children: ReactNode }) {
  const { t, locale, setLocale } = useT();
  const time = useTime();
  const clubs = useClubs();
  const [ownClub, chooseClub] = useOwnClub();
  const path = usePathname() ?? "/";
  const router = useRouter();
  const dev = useDevMode();
  const [seeAll, setSeeAll] = useSeeAll();
  const [density, setDensity] = useState<Density>("normal");
  const [theme, setTheme] = useState<Theme>("auto");

  useEffect(() => {
    setDensity(read("raizes.densidade", isDensity) ?? "normal");
    setTheme(read("raizes.tema", isTheme) ?? "auto");
  }, []);
  useEffect(() => {
    document.documentElement.dataset.densidade = density;
  }, [density]);
  useEffect(() => {
    if (theme === "auto") delete document.documentElement.dataset.tema;
    else document.documentElement.dataset.tema = theme;
  }, [theme]);
  const toggleTheme = () => {
    const fresh = NEXT_THEME[theme];
    setTheme(fresh);
    save("raizes.tema", fresh);
  };
  const toggleDensity = () => {
    const fresh: Density = density === "normal" ? "compact" : "normal";
    setDensity(fresh);
    save("raizes.densidade", fresh);
  };

  const matchInProgress = useOngoingMatch() && path.startsWith("/match");
  const items = MENU.filter((m) => (!m.devOnly || dev) && !m.hidden);
  return (
    <div className="shell">
      <nav className="menu" aria-label="Menu">
        <div className="marca">
          <span className="marca-sinal"><Icon name="root" /></span>
          <div>
            <strong>{t("app.nome")}</strong>
            <small>{t("app.subtitulo")}</small>
          </div>
        </div>
        <ul>
          {items.filter((m) => !m.devOnly).map((m) => <ItemDoMenu key={m.rowKey} m={m} path={path} />)}
        </ul>
        {dev && (
          <div>
            <p className="menu-grupo">{t("menu.developer")}</p>
            <ul>
              {items.filter((m) => m.devOnly).map((m) => <ItemDoMenu key={m.rowKey} m={m} path={path} />)}
              {clubs && (
                <li className="menu-clube-dev" title={t("dev.clube.dica")}>
                  <ClubSelector clubs={clubs} isOpen0={false} {...(ownClub ? { current: ownClub } : {})} onChoose={(id) => void chooseClub(id, true)} />
                </li>
              )}
              <li className="menu-interruptor">
                <button type="button" onClick={() => setSeeAll(!seeAll)} role="switch" aria-checked={seeAll} title={t("dev.verTudo.dica")} data-testid="ver-tudo">
                  <Icon name="eye" />
                  {t("dev.verTudo.rotulo")}
                  <span className="interruptor" aria-hidden="true" />
                </button>
              </li>
            </ul>
          </div>
        )}
        <Settings theme={theme} onTheme={toggleTheme} density={density} onDensity={toggleDensity} locale={locale} aoLocale={setLocale} />
      </nav>
      {!matchInProgress && (
        <header className="topo">
          <Search />
        </header>
      )}
      <main className="centro">
        {path !== "/" && !matchInProgress && (
          <nav className="migalhas" aria-label={t("migalhas.rotulo")}>
            <button type="button" onClick={() => router.back()}>← {t("migalhas.voltar")}</button>
            <Link href="/">{t("menu.hoje")}</Link>
            <span aria-hidden="true">›</span>
            <span aria-current="page">{t(path.startsWith("/profile") ? "migalhas.ficha" : path.startsWith("/match") ? "migalhas.jogo" : path.startsWith("/prematch") ? "prematch.titulo" : (MENU.find((m) => m.href && m.href !== "/" && m.whenActive(path))?.rowKey ?? "menu.mundo"))}</span>
          </nav>
        )}
        {children}
      </main>
      <footer className={matchInProgress ? "barra barra-jogo" : "barra"}>
        <MatchProgress />
        <span>{t("barra.data")}: <b>{time.state ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${time.state.today}T00:00:00Z`)) : t("barra.semDados")}</b></span>
        <span>{t("barra.orcamento")}: <b>{t("barra.semDados")}</b></span>
        <span>{t("barra.humor")}: <b>{t("barra.semDados")}</b></span>
        <AdvanceButton />
      </footer>
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
      <button type="button" className="definicoes-botao" aria-expanded={isOpen} aria-haspopup="true" aria-controls="menu-definicoes" onClick={() => setIsOpen((v) => !v)}>
        <Icon name="settings" />
        <span>{t("definicoes.rotulo")}</span>
      </button>
      {isOpen && (
        <div className="definicoes-menu" id="menu-definicoes" role="group" aria-label={t("definicoes.rotulo")}>
          <div className="definicoes-linha"><span>{t("tema.rotulo")}</span><button type="button" onClick={onTheme} data-testid="theme">{t(`tema.${theme}` as Key)}</button></div>
          <div className="definicoes-linha"><span>{t("definicoes.densidade")}</span><button type="button" onClick={onDensity} aria-pressed={density === "compact"} data-testid="density">{t(density === "compact" ? "densidade.compacta" : "densidade.normal")}</button></div>
          <label className="definicoes-linha"><span>{t("idioma.rotulo")}</span>
            <select value={locale} aria-label={t("idioma.rotulo")} onChange={(e) => aoLocale(e.target.value as (typeof LOCALES)[number])}>
              {LOCALES.map((l) => <option key={l} value={l}>{t(`idioma.${l}`)}</option>)}
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
  return unread > 0 ? <span className="distintivo" aria-label={t("caixa.naoLidas", { n: unread })}>{unread > 99 ? "99+" : unread}</span> : null;
}

function ItemDoMenu({ m, path }: { m: ItemMenu; path: string }) {
  const { t } = useT();
  const active = m.whenActive(path);
  const content = (
    <>
      <Icon name={m.icon} />
      {t(m.rowKey)}
      {m.rowKey === "menu.hoje" && <InboxBadge />}
    </>
  );
  return (
    <li aria-current={active ? "page" : undefined} className={active ? "active" : m.href ? undefined : "inativo"} title={m.href ? undefined : t("menu.brevemente")}>
      {m.href ? <Link href={m.href}>{content}</Link> : <span>{content}</span>}
    </li>
  );
}
