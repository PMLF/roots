"use client";
import { estaNaSegundaDistrital } from "@/engine/epoca/distritais";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ClubeResumo, OfertaDeClube } from "@/engine/api/contratos";
import type { Chave } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";
import { useMeuClube } from "@/ui/meuClube";
import { useMotor } from "@/ui/MotorProvider";

const MAX_RESULTADOS = 40;
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Dropdown com pesquisa para escolher o clube (mesma lógica do seletor de ligas). */
export function SeletorClube({ clubes, atual, aoEscolher, aberto0 }: { clubes: ClubeResumo[]; atual?: string; aoEscolher: (id: string) => void; aberto0?: boolean }) {
  const { t } = useT();
  const [aberto, setAberto] = useState(aberto0 ?? !atual);
  const [texto, setTexto] = useState("");
  const raiz = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto || !atual) return;
    const fora = (e: MouseEvent) => { if (!raiz.current?.contains(e.target as Node)) setAberto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAberto(false); };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", fora); document.removeEventListener("keydown", esc); };
  }, [aberto, atual]);
  const nome = clubes.find((c) => c.id === atual)?.nome;
  const visiveis = useMemo(() => {
    const q = norm(texto.trim());
    return clubes.filter((c) => !estaNaSegundaDistrital(c.liga) && (!q || norm(c.nome).includes(q) || norm(c.liga).includes(q))).slice(0, MAX_RESULTADOS);
  }, [clubes, texto]);
  return (
    <div className="seletor-ligas" ref={raiz}>
      <button type="button" aria-expanded={aberto} aria-haspopup="true" onClick={() => setAberto((v) => !v)}>
        {nome ?? t("meuClube.escolher")} <span aria-hidden="true">▾</span>
      </button>
      {aberto && (
        <div className="seletor-painel" role="group" aria-label={t("meuClube.escolher")}>
          <input type="search" autoFocus value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={t("meuClube.pesquisar")} aria-label={t("meuClube.pesquisar")} />
          <ul className="seletor-lista">
            {visiveis.map((c) => (
              <li key={c.id}>
                <button type="button" className={c.id === atual ? "ativo" : undefined} onClick={() => { aoEscolher(c.id); setAberto(false); setTexto(""); }}>
                  {c.nome} <span className="suave">{c.liga}</span>
                </button>
              </li>
            ))}
            {visiveis.length === 0 && <li className="vazio">{t("meuClube.semResultados")}</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Os clubes do mundo (vazio até haver mundo; `null` se não há mundo). */
export function useClubes(): ClubeResumo[] | null | undefined {
  const motor = useMotor();
  const [clubes, setClubes] = useState<ClubeResumo[] | null | undefined>(undefined);
  useEffect(() => {
    if (!motor) return;
    let vivo = true;
    const carregar = () => { motor.chamar("estadoMundo", null).then((m) => (m ? motor.chamar("clubes", null) : null)).then((c) => vivo && setClubes(c)).catch(() => vivo && setClubes(null)); };
    carregar();
    window.addEventListener("raizes:mundo", carregar);
    return () => { vivo = false; window.removeEventListener("raizes:mundo", carregar); };
  }, [motor]);
  return clubes;
}

/** Ofertas de clubes quando o gamer está sem clube (RZ-157). */
function OfertasDeClubes({ ofertas, anterior }: { ofertas: OfertaDeClube[]; anterior?: string }) {
  const { t } = useT();
  const motor = useMotor();
  const [erro, setErro] = useState<string | undefined>(undefined);
  const aceitar = async (id: string) => {
    try {
      await motor?.chamar("aceitarOferta", { id });
      window.dispatchEvent(new Event("raizes:meuClube"));
      window.dispatchEvent(new Event("raizes:tempo"));
    } catch (e) { setErro(e instanceof Error ? e.message : String(e)); }
  };
  return (
    <div className="pagina-clube">
      <p>{anterior ? t("meuClube.semClubeDe", { clube: anterior }) : t("meuClube.semClube")}</p>
      {ofertas.length === 0 ? <p className="vazio">{t("meuClube.ofertasVazio")}</p> : (
        <ul className="ofertas">
          {ofertas.map((o) => (
            <li key={o.id}>
              <b>{o.nome}</b> <span className="suave">{o.liga} · {t(`reputacao.nivel.${o.nivelReputacao}` as Chave)}</span>{" "}
              <button type="button" className="primario" onClick={() => void aceitar(o.id)}>{t("meuClube.aceitar")}</button>
            </li>
          ))}
        </ul>
      )}
      <p className="suave">{t("meuClube.ofertasRenovam")}</p>
      {erro && <p className="erro">{erro}</p>}
    </div>
  );
}

/** Escolha do clube para começar o save (onboarding provisório até RZ-138); sem clube depois de uma demissão, as ofertas. */
export function EscolherClubeInicial() {
  const { t } = useT();
  const motor = useMotor();
  const clubes = useClubes();
  const [, definir] = useMeuClube();
  const [situacao, setSituacao] = useState<Awaited<ReturnType<NonNullable<typeof motor>["chamar"]>> | undefined>(undefined);
  useEffect(() => {
    if (!motor) return;
    let vivo = true;
    const carregar = () => { motor.chamar("ofertas", null).then((o) => vivo && setSituacao(o)).catch(() => undefined); };
    carregar();
    window.addEventListener("raizes:tempo", carregar);
    window.addEventListener("raizes:meuClube", carregar);
    return () => { vivo = false; window.removeEventListener("raizes:tempo", carregar); window.removeEventListener("raizes:meuClube", carregar); };
  }, [motor]);
  const o = situacao as { desempregado: boolean; anterior?: string; ofertas: OfertaDeClube[] } | undefined;
  if (!clubes || !o) return null;
  if (o.desempregado) return <OfertasDeClubes ofertas={o.ofertas} {...(o.anterior ? { anterior: o.anterior } : {})} />;
  return (
    <div className="pagina-clube">
      <p>{t("meuClube.comecar")}</p>
      <SeletorClube clubes={clubes} aberto0 aoEscolher={(id) => void definir(id)} />
    </div>
  );
}

/** Demitir-se do clube (pede confirmação). */
export function BotaoDemitir() {
  const { t } = useT();
  const motor = useMotor();
  const [confirmar, setConfirmar] = useState(false);
  const demitir = async () => {
    await motor?.chamar("demitir", null);
    setConfirmar(false);
    window.dispatchEvent(new Event("raizes:meuClube"));
    window.dispatchEvent(new Event("raizes:tempo"));
  };
  return confirmar ? (
    <span className="acoes">
      <span className="suave">{t("meuClube.confirmarDemitir")}</span>
      <button type="button" onClick={() => void demitir()}>{t("meuClube.demitirSim")}</button>
      <button type="button" onClick={() => setConfirmar(false)}>{t("meuClube.cancelar")}</button>
    </span>
  ) : (
    <button type="button" onClick={() => setConfirmar(true)}>{t("meuClube.demitir")}</button>
  );
}

/**
 * Moldura das páginas do clube (Clube, Plantel, Jogos, Cidade): mostra sempre o clube do save. Sem mundo ou sem clube
 * escolhido, leva a criar o mundo ou a escolher o clube.
 */
export function ComClube({ titulo, children }: { titulo: string; children: (clube: string) => ReactNode }) {
  const { t } = useT();
  const clubes = useClubes();
  const [meu, , pronto] = useMeuClube();
  if (clubes === null) return <p className="vazio" data-testid="sem-mundo">{t("hoje.semMundo")} <Link href="/world/">{t("hoje.criarMundo")}</Link></p>;
  if (clubes === undefined || !pronto) return <p>{t("ficha.aCarregar")}</p>;
  if (!meu || !clubes.some((c) => c.id === meu)) return <EscolherClubeInicial />;
  return (
    <section className="pagina-clube">
      {titulo && <h1>{titulo}</h1>}
      {children(meu)}
    </section>
  );
}
