"use client";
import { useEffect, useRef, useState } from "react";
import type { JogadorVivo, JogoVivo, SubsVivo } from "@/engine/epoca/jogoAoVivo";
import { IconeEvento } from "@/ui/components/IconeEvento";
import { siglaPosicao } from "@/ui/i18n/posicao";
import { useT } from "@/ui/i18n/LocaleProvider";

/** Barrinhas com o que resta: uma por substituição (5) e uma por pausa (3). */
export function ContadoresSubs({ subs }: { subs: SubsVivo }) {
  const { t } = useT();
  const barras = (usadas: number, max: number, rotulo: string) => (
    <span className="contador-subs" role="img" aria-label={`${rotulo}: ${max - usadas} / ${max}`}>
      <span>{rotulo}</span>
      <span className="contador-barras" aria-hidden="true">
        {Array.from({ length: max }, (_, i) => <i key={i} className={i < max - usadas ? "livre" : "gasta"} />)}
      </span>
    </span>
  );
  return <span className="contadores-subs">{barras(subs.usadas, subs.max, t("jogo.subs.contSubs"))}{barras(subs.pausasUsadas, subs.maxPausas, t("jogo.subs.contPausas"))}</span>;
}

/** Já não se pode fazer mais nenhuma substituição agora? (sem substituições, ou sem pausas fora do intervalo) */
export function semSubstituicoes(subs: SubsVivo | undefined, noIntervalo: boolean): boolean {
  return !subs || subs.usadas >= subs.max || (!noIntervalo && subs.pausasUsadas >= subs.maxPausas);
}

type Par = { sai: string; entra: string };

/**
 * Popup das substituições (RZ-215): escolhe-se quem sai (em campo) e quem entra (banco) e confirma-se tudo de uma vez.
 * Uma paragem gasta uma pausa, façam-se uma ou várias trocas; ao intervalo não gasta pausas. Quem sai não volta.
 */
export function SubstituicoesNoJogo({ jogo, noIntervalo, ocupado, erro, aoConfirmar, aoFechar }: { jogo: JogoVivo; noIntervalo: boolean; ocupado: boolean; erro?: string; aoConfirmar: (trocas: Par[]) => void; aoFechar: () => void }) {
  const { t } = useT();
  const ref = useRef<HTMLDialogElement>(null);
  const [sai, setSai] = useState<string | null>(null);
  const [pares, setPares] = useState<Par[]>([]);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  const subs = jogo.subs;
  const lado = jogo.ladoGamer ?? "casa";
  const todos = jogo.equipas?.[lado] ?? [];
  const campo = todos.filter((j) => j.estado === "campo");
  const banco = todos.filter((j) => j.estado === "banco");
  const restantes = subs ? subs.max - subs.usadas - pares.length : 0;
  const nome = (id: string) => todos.find((j) => j.id === id)?.nome ?? id;
  const jSai = sai ? todos.find((j) => j.id === sai) : undefined;
  const usadosSai = new Set(pares.map((p) => p.sai));
  const usadosEntra = new Set(pares.map((p) => p.entra));

  const escolherEntra = (j: JogadorVivo) => {
    if (!sai || restantes <= 0) return;
    setPares((p) => [...p, { sai, entra: j.id }]);
    setSai(null);
  };
  const aptidaoNa = (j: JogadorVivo): number | undefined => (jSai ? j.posicoes?.find((x) => x.pos === jSai.posicao)?.aptidao : undefined);

  return (
    <dialog ref={ref} className="popup subs-jogo" aria-labelledby="h-subs" onClose={aoFechar} onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}>
      <h2 id="h-subs">{t("jogo.subs.titulo")}</h2>
      {subs && <p className="subs-resumo"><ContadoresSubs subs={subs} /></p>}
      <p className="suave subs-aviso">{noIntervalo ? t("jogo.subs.avisoIntervalo") : t("jogo.subs.aviso")}</p>
      {pares.length > 0 && (
        <ul className="subs-pares" aria-label={t("jogo.subs.escolhidas")}>
          {pares.map((p) => (
            <li key={p.sai}>
              <span className="sub-sai">▼ {nome(p.sai)}</span> <span className="sub-entra">▲ {nome(p.entra)}</span>
              <button type="button" className="ligacao-botao" onClick={() => setPares((x) => x.filter((y) => y.sai !== p.sai))}>{t("jogo.subs.remover")}</button>
            </li>
          ))}
        </ul>
      )}
      <div className="subs-listas">
        <section aria-label={t("jogo.subs.emCampo")}>
          <h3>{t("jogo.subs.sai")}</h3>
          <ul>
            {campo.map((j) => (
              <li key={j.id}>
                <button type="button" className={`subs-jogador${sai === j.id ? " escolhido" : ""}`} aria-pressed={sai === j.id} disabled={usadosSai.has(j.id) || ocupado} onClick={() => setSai(sai === j.id ? null : j.id)}>
                  <b className="nota-pequena">{j.nota !== undefined ? j.nota.toFixed(1) : "–"}</b>
                  <span className="pos">{siglaPosicao(t, j.posicao)}</span>
                  <span className="subs-nome">{j.nome}</span>
                  <span className="inds">
                    {j.amarelos > 0 && <span className="ind"><IconeEvento chave="cartao" cor="amarelo" /></span>}
                    {j.lesionado && <span className="ind"><IconeEvento chave="lesao" /></span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
        <section aria-label={t("jogo.banco")}>
          <h3>{t("jogo.subs.entra")}</h3>
          <ul>
            {banco.map((j) => {
              const apt = aptidaoNa(j);
              return (
                <li key={j.id}>
                  <button type="button" className="subs-jogador" disabled={!sai || restantes <= 0 || usadosEntra.has(j.id) || ocupado} onClick={() => escolherEntra(j)}>
                    <span className="pos">{siglaPosicao(t, j.posicao)}</span>
                    <span className="subs-nome">{j.nome}</span>
                    {jSai && <span className={`subs-apt${apt === undefined || apt < 10 ? " fraca" : ""}`}>{apt === undefined ? t("jogo.subs.foraPosicao") : `${apt}/20`}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
      {!sai && pares.length === 0 && <p className="suave">{t("jogo.subs.escolhe")}</p>}
      {sai && <p className="suave">{t("jogo.subs.escolheEntra", { nome: jSai?.nome ?? "" })}</p>}
      {erro && <p className="erro" role="alert">{erro}</p>}
      <p className="acoes">
        <button type="button" onClick={() => ref.current?.close()}>{t("jogo.taticaFechar")}</button>
        <button type="button" className="primario" disabled={pares.length === 0 || ocupado} onClick={() => aoConfirmar(pares)}>{t("jogo.subs.confirmar")}{pares.length > 0 ? ` (${pares.length})` : ""}</button>
      </p>
    </dialog>
  );
}
