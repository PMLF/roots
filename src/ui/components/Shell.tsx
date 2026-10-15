"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { LOCALES, type Chave } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";
import { guardar, ler } from "@/ui/armazenamento";
import { Pesquisa } from "@/ui/components/Pesquisa";

type ItemMenu = { chave: Chave; href?: string; ativoQuando: (caminho: string) => boolean };

// Máximo 2 níveis (TOM_E_UX §3.5): secção no menu, separadores dentro da página. Sem href = ainda não existe.
const MENU: ItemMenu[] = [
  { chave: "menu.hoje", href: "/", ativoQuando: (c) => c === "/" },
  { chave: "menu.clube", ativoQuando: () => false },
  { chave: "menu.plantel", ativoQuando: () => false },
  { chave: "menu.jogos", ativoQuando: () => false },
  { chave: "menu.mundo", href: "/mundo/", ativoQuando: (c) => c.startsWith("/mundo") },
  { chave: "menu.cidade", ativoQuando: () => false },
];

type Densidade = "normal" | "compacta";
const eDensidade = (v: unknown): v is Densidade => v === "normal" || v === "compacta";

/** Estrutura base (docs/TOM_E_UX.md): menu à esquerda, página ao centro, caixa à direita, barra em baixo. */
export function Shell({ children }: { children: ReactNode }) {
  const { t, locale, setLocale } = useT();
  const caminho = usePathname() ?? "/";
  const router = useRouter();
  const [densidade, setDensidade] = useState<Densidade>("normal");

  useEffect(() => {
    setDensidade(ler("raizes.densidade", eDensidade) ?? "normal");
  }, []);
  useEffect(() => {
    document.documentElement.dataset.densidade = densidade;
  }, [densidade]);
  const alternarDensidade = () => {
    const nova: Densidade = densidade === "normal" ? "compacta" : "normal";
    setDensidade(nova);
    guardar("raizes.densidade", nova);
  };

  return (
    <div className="shell">
      <header className="topo">
        <strong>{t("app.nome")}</strong>
        <span className="subtitulo">{t("app.subtitulo")}</span>
        <Pesquisa />
        <button type="button" onClick={alternarDensidade} aria-pressed={densidade === "compacta"} data-testid="densidade">
          {t(densidade === "compacta" ? "densidade.compacta" : "densidade.normal")}
        </button>
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
          {MENU.map((m) => {
            const ativo = m.ativoQuando(caminho);
            return (
              <li key={m.chave} aria-current={ativo ? "page" : undefined} className={ativo ? "ativo" : m.href ? undefined : "inativo"} title={m.href ? undefined : t("menu.brevemente")}>
                {m.href ? <Link href={m.href}>{t(m.chave)}</Link> : t(m.chave)}
              </li>
            );
          })}
        </ul>
      </nav>
      <main className="centro">
        {caminho !== "/" && (
          <nav className="migalhas" aria-label={t("migalhas.rotulo")}>
            <button type="button" onClick={() => router.back()}>← {t("migalhas.voltar")}</button>
            <Link href="/">{t("menu.hoje")}</Link>
            <span aria-hidden="true">›</span>
            <span aria-current="page">{t(caminho.startsWith("/ficha") ? "migalhas.ficha" : "menu.mundo")}</span>
          </nav>
        )}
        {children}
      </main>
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
