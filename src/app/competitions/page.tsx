"use client";
import { useEffect, useRef, useState } from "react";
import type { CompetitionPage, CompeticaoResumo } from "@/engine/api/contratos";
import { Cartao } from "@/ui/components/Cartao";
import { TabelaLiga } from "@/ui/components/competicao/TabelaLiga";
import { Ligacao } from "@/ui/components/Ligacao";
import { guardar, ler } from "@/ui/armazenamento";
import type { Chave } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";
import { useMotor } from "@/ui/MotorProvider";

const GRUPOS: { chave: Chave; escaloes: readonly string[]; colunas?: true }[] = [
  { chave: "competicoes.profissionais", escaloes: ["primeiraLiga", "segundaLiga", "terceiraLiga"] },
  { chave: "escalao.cp", escaloes: ["cp"], colunas: true },
  { chave: "escalao.distrital", escaloes: ["distrital"], colunas: true },
];
const CHAVE = "raizes.competitions.selected";
const PADRAO = ["Primeira Liga", "Segunda Liga", "Terceira Liga"];
const MINIMO = 3;
const eLista = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");

function Destaques({ p }: { p: CompetitionPage }) {
  const { t } = useT();
  const h = p.highlights;
  const linha = (rotulo: string, valor: React.ReactNode) => (
    <li><span className="suave">{rotulo}</span><span>{valor}</span></li>
  );
  const jog = (x: CompetitionPage["highlights"]["topScorers"][number] | undefined, fmt?: (v: number) => string) =>
    x ? <><Ligacao k="pessoa" id={x.player}>{x.name}</Ligacao> <b>{fmt ? fmt(x.value) : x.value}</b></> : "—";
  const clube = (x: { club: string; name: string; value: number } | undefined) => (x ? <><Ligacao k="clube" id={x.club}>{x.name}</Ligacao> <b>{x.value}</b></> : "—");
  return (
    <ul className="destaques-mini">
      {linha(t("competicoes.melhorMarcador"), jog(h.topScorers[0]))}
      {linha(t("competicoes.melhorJogador"), jog(h.bestRated[0], (v) => v.toFixed(2)))}
      {linha(t("competicoes.melhorAtaque"), clube(h.bestAttack))}
      {linha(t("competicoes.melhorDefesa"), clube(h.bestDefence))}
    </ul>
  );
}

/** Competições (RZ-145): as classificações das ligas escolhidas, cada uma com os seus destaques. */
export default function PaginaCompeticoes() {
  const { t } = useT();
  const motor = useMotor();
  const [lista, setLista] = useState<CompeticaoResumo[] | null | undefined>(undefined);
  const [escolhidas, setEscolhidas] = useState<string[]>(PADRAO);
  const [aberto, setAberto] = useState(false);
  const seletor = useRef<HTMLDivElement>(null);
  const [paginas, setPaginas] = useState<Record<string, CompetitionPage>>({});

  useEffect(() => {
    const guardadas = ler(CHAVE, eLista);
    setEscolhidas(guardadas && guardadas.length >= MINIMO ? guardadas : PADRAO);
  }, []);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (!seletor.current?.contains(e.target as Node)) setAberto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAberto(false); };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", fora); document.removeEventListener("keydown", esc); };
  }, [aberto]);
  useEffect(() => {
    if (!motor) return;
    let vivo = true;
    motor.chamar("estadoMundo", null).then((m) => (m ? motor.chamar("competicoes", null) : null)).then((c) => vivo && setLista(c)).catch(() => vivo && setLista(null));
    return () => { vivo = false; };
  }, [motor]);
  useEffect(() => {
    if (!motor || !lista) return;
    let vivo = true;
    (async () => {
      for (const liga of escolhidas) {
        if (paginas[liga] || !lista.some((c) => c.liga === liga)) continue;
        const p = await motor.chamar("competitionPage", { league: liga });
        if (vivo && p) setPaginas((antes) => ({ ...antes, [liga]: p }));
      }
    })().catch(() => undefined);
    return () => { vivo = false; };
    // as páginas já carregadas não voltam a pedir-se
  }, [motor, lista, escolhidas]);

  const definir = (novas: string[]) => {
    setEscolhidas(novas);
    guardar(CHAVE, novas);
  };
  const alternar = (liga: string) => {
    if (escolhidas.includes(liga)) {
      if (escolhidas.length > MINIMO) definir(escolhidas.filter((x) => x !== liga));
    } else definir([...escolhidas, liga]);
  };
  const visiveis = lista ? lista.filter((c) => escolhidas.includes(c.liga)) : [];

  return (
    <section>
      <h1>{t("competicoes.titulo")}</h1>
      {lista === null && <p className="vazio">{t("hoje.semMundo")}</p>}
      {lista && (
        <>
          <div className="seletor-ligas" ref={seletor}>
            <button type="button" aria-expanded={aberto} aria-haspopup="true" onClick={() => setAberto((v) => !v)}>
              {t("competicoes.escolher")} ({escolhidas.length}/{lista.length}) <span aria-hidden="true">▾</span>
            </button>
            {aberto && (
              <div className="seletor-painel" role="group" aria-label={t("competicoes.escolher")}>
                <div className="seletor-acoes">
                  <button type="button" onClick={() => definir(lista.map((c) => c.liga))}>{t("competicoes.todas")}</button>
                  <button type="button" onClick={() => definir(PADRAO)}>{t("competicoes.padrao")}</button>
                  <span className="suave">{t("competicoes.minimo", { n: MINIMO })}</span>
                </div>
                {GRUPOS.map((g) => {
                  const ligas = lista.filter((c) => (g.escaloes as readonly string[]).includes(c.escalao));
                  return ligas.length === 0 ? null : (
                    <fieldset key={g.chave} className={g.colunas ? "seletor-colunas" : undefined}>
                      <legend>{t(g.chave)}</legend>
                      {ligas.map((c) => {
                        const marcada = escolhidas.includes(c.liga);
                        return (
                          <label key={c.liga}>
                            <input type="checkbox" checked={marcada} disabled={marcada && escolhidas.length <= MINIMO} onChange={() => alternar(c.liga)} />
                            <span>{c.liga}</span>
                          </label>
                        );
                      })}
                    </fieldset>
                  );
                })}
              </div>
            )}
          </div>
          {visiveis.length === 0 && <p className="vazio">{t("competicoes.semSelecao")}</p>}
          <div className="ligas-grelha">
            {visiveis.map((c) => {
              const p = paginas[c.liga];
              return (
                <Cartao key={c.liga} titulo={<Ligacao k="competicao" id={c.liga}>{c.liga}</Ligacao>}>
                  <p className="suave cartao-sub">{t("competicoes.clubes", { n: c.clubes })}</p>
                  {p ? (
                    <>
                      <Destaques p={p} />
                      <TabelaLiga page={p} compacta />
                    </>
                  ) : (
                    <p className="vazio">{t("ficha.aCarregar")}</p>
                  )}
                </Cartao>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
