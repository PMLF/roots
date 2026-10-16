"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { LOCALES, type Chave } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";
import { guardar, ler } from "@/ui/armazenamento";
import { useModoDev, useVerTudo } from "@/ui/dev";
import { useCaixaNaoLidas } from "@/ui/useCaixa";
import { BotaoAvancar } from "@/ui/components/BotaoAvancar";
import { Icone, type NomeIcone } from "@/ui/components/Icone";
import { Pesquisa } from "@/ui/components/Pesquisa";
import { useTempo } from "@/ui/useTempo";
import { SeletorClube, useClubes } from "@/ui/components/ComClube";
import { useMeuClube } from "@/ui/meuClube";

type ItemMenu = { chave: Chave; icone: NomeIcone; href?: string; ativoQuando: (caminho: string) => boolean; /** Ferramenta de developer: só no modo dev (`ui/dev.ts`). */ soDev?: true; /** Não aparece no menu (tem lugar noutra página), mas continua a ter rota e migalhas. */ oculto?: true };

// Máximo 2 níveis (TOM_E_UX §3.5): secção no menu, separadores dentro da página. Sem href = ainda não existe.
const MENU: ItemMenu[] = [
  { chave: "menu.hoje", icone: "hoje", href: "/", ativoQuando: (c) => c === "/" },
  { chave: "menu.noticias", icone: "noticias", href: "/news/", ativoQuando: (c) => c.startsWith("/news") },
  { chave: "menu.caixa", icone: "caixa", href: "/inbox/", ativoQuando: (c) => c.startsWith("/inbox"), oculto: true },
  { chave: "menu.competicoes", icone: "competicoes", href: "/competitions/", ativoQuando: (c) => c.startsWith("/competitions") },
  { chave: "menu.clube", icone: "clube", href: "/club/", ativoQuando: (c) => c.startsWith("/club") },
  { chave: "menu.plantel", icone: "plantel", href: "/squad/", ativoQuando: (c) => c.startsWith("/squad") },
  { chave: "menu.tatica", icone: "tatica", href: "/tactics/", ativoQuando: (c) => c.startsWith("/tactics") },
  { chave: "menu.jogos", icone: "jogos", href: "/fixtures/", ativoQuando: (c) => c.startsWith("/fixtures") },
  { chave: "menu.cidade", icone: "cidade", href: "/city/", ativoQuando: (c) => c.startsWith("/city") },
  { chave: "menu.mundo", icone: "mundo", href: "/world/", ativoQuando: (c) => c.startsWith("/world"), soDev: true },
  { chave: "menu.laboratorio", icone: "laboratorio", href: "/lab/", ativoQuando: (c) => c.startsWith("/lab"), soDev: true },
];

type Tema = "auto" | "claro" | "escuro";
const eTema = (v: unknown): v is Tema => v === "auto" || v === "claro" || v === "escuro";
const PROXIMO_TEMA: Record<Tema, Tema> = { auto: "claro", claro: "escuro", escuro: "auto" };

type Densidade = "normal" | "compacta";
const eDensidade = (v: unknown): v is Densidade => v === "normal" || v === "compacta";

/** Estrutura base (docs/TOM_E_UX.md): menu à esquerda, página ao centro, caixa à direita, barra em baixo. */
export function Shell({ children }: { children: ReactNode }) {
  const { t, locale, setLocale } = useT();
  const tempo = useTempo();
  const clubes = useClubes();
  const [meuClube, escolherClube] = useMeuClube();
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

  const itens = MENU.filter((m) => (!m.soDev || dev) && !m.oculto);
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
              {clubes && (
                <li className="menu-clube-dev" title={t("dev.clube.dica")}>
                  <SeletorClube clubes={clubes} aberto0={false} {...(meuClube ? { atual: meuClube } : {})} aoEscolher={(id) => void escolherClube(id, true)} />
                </li>
              )}
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
            <span aria-current="page">{t(caminho.startsWith("/profile") ? "migalhas.ficha" : caminho.startsWith("/match") ? "migalhas.jogo" : (MENU.find((m) => m.href && m.href !== "/" && m.ativoQuando(caminho))?.chave ?? "menu.mundo"))}</span>
          </nav>
        )}
        {children}
      </main>
      <footer className="barra">
        <span>{t("barra.data")}: <b>{tempo.estado ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${tempo.estado.hoje}T00:00:00Z`)) : t("barra.semDados")}</b></span>
        <span>{t("barra.orcamento")}: <b>{t("barra.semDados")}</b></span>
        <span>{t("barra.humor")}: <b>{t("barra.semDados")}</b></span>
        <BotaoAvancar />
      </footer>
    </div>
  );
}

function DistintivoCaixa() {
  const { t } = useT();
  const naoLidas = useCaixaNaoLidas();
  return naoLidas > 0 ? <span className="distintivo" aria-label={t("caixa.naoLidas", { n: naoLidas })}>{naoLidas > 99 ? "99+" : naoLidas}</span> : null;
}

function ItemDoMenu({ m, caminho }: { m: ItemMenu; caminho: string }) {
  const { t } = useT();
  const ativo = m.ativoQuando(caminho);
  const conteudo = (
    <>
      <Icone nome={m.icone} />
      {t(m.chave)}
      {m.chave === "menu.hoje" && <DistintivoCaixa />}
    </>
  );
  return (
    <li aria-current={ativo ? "page" : undefined} className={ativo ? "ativo" : m.href ? undefined : "inativo"} title={m.href ? undefined : t("menu.brevemente")}>
      {m.href ? <Link href={m.href}>{conteudo}</Link> : <span>{conteudo}</span>}
    </li>
  );
}
