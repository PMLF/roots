"use client";
import type { ReactNode } from "react";
import { LOCALES, type Chave } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";

const MENU: { chave: Chave; ativo: boolean }[] = [
  { chave: "menu.inicio", ativo: true },
  { chave: "menu.clube", ativo: false },
  { chave: "menu.plantel", ativo: false },
  { chave: "menu.jogos", ativo: false },
  { chave: "menu.mundo", ativo: false },
  { chave: "menu.cidade", ativo: false },
];

/** Estrutura base (docs/TOM_E_UX.md): menu à esquerda, página ao centro, caixa à direita, barra em baixo. */
export function Shell({ children }: { children: ReactNode }) {
  const { t, locale, setLocale } = useT();
  return (
    <div className="shell">
      <header className="topo">
        <strong>{t("app.nome")}</strong>
        <span className="subtitulo">{t("app.subtitulo")}</span>
        <label className="idioma">
          {t("idioma.rotulo")}
          <select value={locale} onChange={(e) => setLocale(e.target.value as (typeof LOCALES)[number])}>
            {LOCALES.map((l) => (
              <option key={l} value={l}>{t(`idioma.${l}`)}</option>
            ))}
          </select>
        </label>
      </header>
      <nav className="menu" aria-label="Menu">
        <ul>
          {MENU.map((m) => (
            <li key={m.chave} aria-current={m.ativo ? "page" : undefined} className={m.ativo ? "ativo" : "inativo"} title={m.ativo ? undefined : t("menu.brevemente")}>
              {t(m.chave)}
            </li>
          ))}
        </ul>
      </nav>
      <main className="centro">{children}</main>
      <aside className="caixa" aria-label={t("caixa.titulo")}>
        <h2>{t("caixa.titulo")}</h2>
        <p className="vazio">{t("caixa.vazia")}</p>
      </aside>
      <footer className="barra">
        <span>{t("barra.data")}: {t("barra.semDados")}</span>
        <span>{t("barra.orcamento")}: {t("barra.semDados")}</span>
        <span>{t("barra.humor")}: {t("barra.semDados")}</span>
      </footer>
    </div>
  );
}
