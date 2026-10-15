"use client";
import { useEffect, useState } from "react";
import type { CompetitionPage, CompeticaoResumo } from "@/engine/api/contratos";
import { Cartao } from "@/ui/components/Cartao";
import { TabelaLiga } from "@/ui/components/competicao/TabelaLiga";
import { Ligacao } from "@/ui/components/Ligacao";
import { guardar, ler } from "@/ui/armazenamento";
import type { Chave } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";
import { useMotor } from "@/ui/MotorProvider";

const ORDEM = ["primeiraLiga", "segundaLiga", "terceiraLiga", "cp", "distrital"] as const;
const CHAVE = "raizes.competitions.selected";
const PADRAO = ["Primeira Liga", "Segunda Liga", "Terceira Liga"];
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
      {linha(t("destaques.melhorAtaque"), clube(h.bestAttack))}
      {linha(t("destaques.melhorDefesa"), clube(h.bestDefence))}
    </ul>
  );
}

/** Competições (RZ-145): as classificações das ligas escolhidas, cada uma com os seus destaques. */
export default function PaginaCompeticoes() {
  const { t } = useT();
  const motor = useMotor();
  const [lista, setLista] = useState<CompeticaoResumo[] | null | undefined>(undefined);
  const [escolhidas, setEscolhidas] = useState<string[]>(PADRAO);
  const [paginas, setPaginas] = useState<Record<string, CompetitionPage>>({});

  useEffect(() => {
    setEscolhidas(ler(CHAVE, eLista) ?? PADRAO);
  }, []);
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
  const alternar = (liga: string) => definir(escolhidas.includes(liga) ? escolhidas.filter((x) => x !== liga) : [...escolhidas, liga]);
  const visiveis = lista ? lista.filter((c) => escolhidas.includes(c.liga)) : [];

  return (
    <section>
      <h1>{t("competicoes.titulo")}</h1>
      {lista === null && <p className="vazio">{t("hoje.semMundo")}</p>}
      {lista && (
        <>
          <details className="seletor-ligas">
            <summary>{t("competicoes.escolher")} ({escolhidas.filter((l) => lista.some((c) => c.liga === l)).length}/{lista.length})</summary>
            <div className="seletor-acoes">
              <button type="button" onClick={() => definir(lista.map((c) => c.liga))}>{t("competicoes.todas")}</button>
              <button type="button" onClick={() => definir([])}>{t("competicoes.nenhuma")}</button>
            </div>
            {ORDEM.map((e) => {
              const ligas = lista.filter((c) => c.escalao === e);
              return ligas.length === 0 ? null : (
                <fieldset key={e}>
                  <legend>{t(`escalao.${e}` as Chave)}</legend>
                  {ligas.map((c) => (
                    <label key={c.liga}><input type="checkbox" checked={escolhidas.includes(c.liga)} onChange={() => alternar(c.liga)} /> {c.liga}</label>
                  ))}
                </fieldset>
              );
            })}
          </details>
          {visiveis.length === 0 && <p className="vazio">{t("competicoes.semSelecao")}</p>}
          <div className="ligas-grelha">
            {visiveis.map((c) => {
              const p = paginas[c.liga];
              return (
                <Cartao key={c.liga} titulo={c.liga}>
                  <p className="suave cartao-sub"><Ligacao k="competicao" id={c.liga}>{t("competicoes.verFicha")}</Ligacao> · {t("competicoes.clubes", { n: c.clubes })}</p>
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
