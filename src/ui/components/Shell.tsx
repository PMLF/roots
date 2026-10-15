"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { LOCALES, type Chave } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";
import { guardar, ler } from "@/ui/armazenamento";
import { useModoDev, useVerTudo } from "@/ui/dev";
import { Icone, type NomeIcone } from "@/ui/components/Icone";
import { Pesquisa } from "@/ui/components/Pesquisa";

type ItemMenu = { chave: Chave; icone: NomeIcone; href?: string; ativoQuando: (caminho: string) => boolean; /** Ferramenta de developer: só no modo dev (`ui/dev.ts`). */ soDev?: true };

// Máximo 2 níveis (TOM_E_UX §3.5): secção no menu, separadores dentro da página. Sem href = ainda não existe.
const MENU: ItemMenu[] = [
  { chave: "menu.hoje", icone: "hoje", href: "/", ativoQuando: (c) => c === "/" },
  { chave: "menu.competicoes", icone: "competicoes", href: "/competicoes/", ativoQuando: (c) => c.startsWith("/competicoes") },
  { chave: "menu.clube", icone: "clube", ativoQuando: () => false },
  { chave: "menu.plantel", icone: "plantel", ativoQuando: () => false },
  { chave: "menu.jogos", icone: "jogos", ativoQuando: () => false },
  { chave: "menu.cidade", icone: "cidade", ativoQuando: () => false },
  { chave: "menu.mundo", icone: "mundo", href: "/mundo/", ativoQuando: (c) => c.startsWith("/mundo"), soDev: true },
  { chave: "menu.laboratorio", icone: "laboratorio", href: "/laboratorio/", ativoQuando: (c) => c.startsWith("/laboratorio"), soDev: true },
];

type Tema = "auto" | "claro" | "escuro";
const eTema = (v: unknown): v is Tema => v === "auto" || v === "claro" || v === "escuro";
const PROXIMO_TEMA: Record<Tema, Tema> = { auto: "claro", claro: "escuro", escuro: "auto" };

type Densidade = "normal" | "compacta";
const eDensidade = (v: unknown): v is Densidade => v === "normal" || v === "compacta";

/** Estrutura base (docs/TOM_E_UX.md): menu à esquerda, página ao centro, caixa à direita, barra em baixo. */
export function Shell({ children }: { children: ReactNode }) {
  const { t, locale, setLocale } = useT();
  const caminho = usePathname() ?? "/";
  const router = useRouter();
  const dev = useModoDev();
  const [verTudo, definirVerTudo] = useVerTudo();
  const [densidade, setDensidade] = useState<Densidade>("normal");
  const [tema, setTema] = useState<Tema>("auto");

  useEffect(() => {
    setDensidade(ler("raizes.densidade", eDensidade) ?? "normal");
    setTema(ler("raizes.tema", eTema) ?? "auto");
  }, []);
  useEffect(() => {
    document.documentElement.dataset.densidade = densidade;
  }, [densidade]);
  useEffect(() => {
    if (tema === "auto") delete document.documentElement.dataset.tema;
    else document.documentElement.dataset.tema = tema;
  }, [tema]);
  const alternarTema = () => {
    const novo = PROXIMO_TEMA[tema];
    setTema(novo);
    guardar("raizes.tema", novo);
  };
  const alternarDensidade = () => {
    const nova: Densidade = densidade === "normal" ? "compacta" : "normal";
    setDensidade(nova);
    guardar("raizes.densidade", nova);
  };

  const itens = MENU.filter((m) => !m.soDev || dev);
  return (
    <div className="shell">
      <nav className="menu" aria-label="Menu">
        <div className="marca">
          <span className="marca-sinal"><Icone nome="raiz" /></span>
          <div>
            <strong>{t("app.nome")}</strong>
            <small>{t("app.subtitulo")}</small>
          </div>
        </div>
        <ul>
          {itens.filter((m) => !m.soDev).map((m) => <ItemDoMenu key={m.chave} m={m} caminho={caminho} />)}
        </ul>
        {dev && (
          <div>
            <p className="menu-grupo">{t("menu.developer")}</p>
            <ul>
              {itens.filter((m) => m.soDev).map((m) => <ItemDoMenu key={m.chave} m={m} caminho={caminho} />)}
              <li className="menu-interruptor">
                <button type="button" onClick={() => definirVerTudo(!verTudo)} role="switch" aria-checked={verTudo} title={t("dev.verTudo.dica")} data-testid="ver-tudo">
                  <Icone nome="olho" />
                  {t("dev.verTudo.rotulo")}
                  <span className="interruptor" aria-hidden="true" />
                </button>
              </li>
            </ul>
          </div>
        )}
      </nav>
      <header className="topo">
        <Pesquisa />
        <span className="espaco" />
        <button type="button" onClick={alternarTema} data-testid="tema" title={t("tema.rotulo")}>{t(`tema.${tema}` as Chave)}</button>
        <button type="button" onClick={alternarDensidade} aria-pressed={densidade === "compacta"} data-testid="densidade">
          {t(densidade === "compacta" ? "densidade.compacta" : "densidade.normal")}
        </button>
        <label className="idioma">
          <span className="sr-so">{t("idioma.rotulo")}</span>
          <select value={locale} aria-label={t("idioma.rotulo")} onChange={(e) => setLocale(e.target.value as (typeof LOCALES)[number])}>
            {LOCALES.map((l) => (
              <option key={l} value={l}>{t(`idioma.${l}`)}</option>
            ))}
          </select>
        </label>
      </header>
      <main className="centro">
        {caminho !== "/" && (
          <nav className="migalhas" aria-label={t("migalhas.rotulo")}>
            <button type="button" onClick={() => router.back()}>← {t("migalhas.voltar")}</button>
            <Link href="/">{t("menu.hoje")}</Link>
            <span aria-hidden="true">›</span>
            <span aria-current="page">{t(caminho.startsWith("/ficha") ? "migalhas.ficha" : caminho.startsWith("/laboratorio") ? "menu.laboratorio" : caminho.startsWith("/competicoes") ? "migalhas.competicoes" : "menu.mundo")}</span>
          </nav>
        )}
        {children}
      </main>
      <footer className="barra">
        <span>{t("barra.data")}: <b>{t("barra.semDados")}</b></span>
        <span>{t("barra.orcamento")}: <b>{t("barra.semDados")}</b></span>
        <span>{t("barra.humor")}: <b>{t("barra.semDados")}</b></span>
      </footer>
    </div>
  );
}

function ItemDoMenu({ m, caminho }: { m: ItemMenu; caminho: string }) {
  const { t } = useT();
  const ativo = m.ativoQuando(caminho);
  const conteudo = (
    <>
      <Icone nome={m.icone} />
      {t(m.chave)}
    </>
  );
  return (
    <li aria-current={ativo ? "page" : undefined} className={ativo ? "ativo" : m.href ? undefined : "inativo"} title={m.href ? undefined : t("menu.brevemente")}>
      {m.href ? <Link href={m.href}>{conteudo}</Link> : <span>{conteudo}</span>}
    </li>
  );
}
