"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ClubeResumo } from "@/engine/api/contratos";
import { useT } from "@/ui/i18n/LocaleProvider";
import { useMeuClube } from "@/ui/meuClube";
import { useMotor } from "@/ui/MotorProvider";

const MAX_RESULTADOS = 40;
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Dropdown com pesquisa para escolher o clube (mesma lógica do seletor de ligas). */
function SeletorClube({ clubes, atual, aoEscolher }: { clubes: ClubeResumo[]; atual?: string; aoEscolher: (id: string) => void }) {
  const { t } = useT();
  const [aberto, setAberto] = useState(!atual);
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
    return clubes.filter((c) => !q || norm(c.nome).includes(q) || norm(c.liga).includes(q)).slice(0, MAX_RESULTADOS);
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

/**
 * Moldura das páginas do clube (Clube, Plantel, Jogos, Cidade): trata de «sem mundo», de escolher o clube e de o
 * trocar, e só depois mostra o conteúdo.
 */
export function ComClube({ titulo, children }: { titulo: string; children: (clube: string) => ReactNode }) {
  const { t } = useT();
  const motor = useMotor();
  const [meu, definir, pronto] = useMeuClube();
  const [clubes, setClubes] = useState<ClubeResumo[] | null | undefined>(undefined);
  useEffect(() => {
    if (!motor) return;
    let vivo = true;
    motor.chamar("estadoMundo", null).then((m) => (m ? motor.chamar("clubes", null) : null)).then((c) => vivo && setClubes(c)).catch(() => vivo && setClubes(null));
    return () => { vivo = false; };
  }, [motor]);

  if (clubes === null) return <p className="vazio" data-testid="sem-mundo">{t("hoje.semMundo")} <Link href="/world/">{t("hoje.criarMundo")}</Link></p>;
  if (clubes === undefined || !pronto) return <p>{t("ficha.aCarregar")}</p>;
  const valido = meu && clubes.some((c) => c.id === meu) ? meu : undefined;
  return (
    <section className="pagina-clube">
      {titulo && <h1>{titulo}</h1>}
      <SeletorClube clubes={clubes} {...(valido ? { atual: valido } : {})} aoEscolher={definir} />
      {valido ? children(valido) : <p className="vazio">{t("meuClube.vazio")}</p>}
    </section>
  );
}
