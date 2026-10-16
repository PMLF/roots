"use client";
import { useEffect, useRef, useState } from "react";
import type { JogadorVivo, JogoVivo, SubsVivo } from "@/engine/epoca/jogoAoVivo";
import { BotaoFechar } from "@/ui/components/BotaoFechar";
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
type Nivel = "bom" | "medio" | "mau";
/** Semáforo de quão bem um suplente cobre uma posição: verde (14+), amarelo (8 a 13), vermelho (menos, ou sem registo). */
const nivelDe = (apt: number | undefined): Nivel => (apt !== undefined && apt >= 14 ? "bom" : apt !== undefined && apt >= 8 ? "medio" : "mau");
const aptidaoPara = (j: JogadorVivo, pos: string): number | undefined => j.posicoes?.find((x) => x.pos === pos)?.aptidao;
type Escolha = { tipo: "sai" | "entra"; id: string };

/**
 * Popup das substituições (RZ-215): escolhe-se quem sai (em campo) e quem entra (banco), por clique ou a arrastar, e confirma-se
 * tudo de uma vez. O semáforo mostra quão bem cada suplente cobre a posição de cada titular. Uma paragem gasta uma pausa,
 * façam-se uma ou várias trocas; ao intervalo não gasta pausas. Quem sai não volta.
 */
export function SubstituicoesNoJogo({ jogo, ocupado, erro, aoConfirmar, aoFechar }: { jogo: JogoVivo; ocupado: boolean; erro?: string; aoConfirmar: (trocas: Par[]) => void; aoFechar: () => void }) {
  const { t } = useT();
  const ref = useRef<HTMLDialogElement>(null);
  const [sel, setSel] = useState<Escolha | null>(null);
  const [arrastar, setArrastar] = useState<Escolha | null>(null);
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
  const porId = (id: string) => todos.find((j) => j.id === id);
  const usadosSai = new Set(pares.map((p) => p.sai));
  const usadosEntra = new Set(pares.map((p) => p.entra));
  const ativo = arrastar ?? sel;
  const jAtivo = ativo ? porId(ativo.id) : undefined;

  const juntar = (sai: string, entra: string) => {
    if (restantes <= 0 || usadosSai.has(sai) || usadosEntra.has(entra)) return;
    setPares((p) => [...p, { sai, entra }]);
    setSel(null);
    setArrastar(null);
  };
  const clicar = (tipo: "sai" | "entra", id: string) => {
    if (sel && sel.tipo !== tipo) { juntar(tipo === "sai" ? id : sel.id, tipo === "entra" ? id : sel.id); return; }
    setSel(sel?.id === id ? null : { tipo, id });
  };
  /** Cor do semáforo da linha `j` para o jogador ativo (do outro lado): quão bem o suplente cobre a posição do titular. */
  const semaforo = (j: JogadorVivo, tipo: "sai" | "entra"): { nivel: Nivel; apt: number | undefined } | undefined => {
    if (!jAtivo || !ativo || ativo.tipo === tipo) return undefined;
    const apt = tipo === "entra" ? aptidaoPara(j, jAtivo.posicao) : aptidaoPara(jAtivo, j.posicao);
    return { nivel: nivelDe(apt), apt };
  };
  const dica = (s: { nivel: Nivel; apt: number | undefined } | undefined) => (s ? (s.apt === undefined ? t("jogo.subs.foraPosicao") : `${s.apt}/20`) : undefined);
  const arrastavel = (tipo: "sai" | "entra", id: string, ativoRow: boolean) => ({
    draggable: ativoRow,
    onDragStart: (e: React.DragEvent) => { e.dataTransfer.setData("text/plain", id); e.dataTransfer.effectAllowed = "move"; setArrastar({ tipo, id }); setSel(null); },
    onDragEnd: () => setArrastar(null),
  });
  const largavel = (tipo: "sai" | "entra", id: string) => ({
    onDragOver: (e: React.DragEvent) => { if (arrastar && arrastar.tipo !== tipo) e.preventDefault(); },
    onDrop: (e: React.DragEvent) => { e.preventDefault(); if (arrastar && arrastar.tipo !== tipo) juntar(tipo === "sai" ? id : arrastar.id, tipo === "entra" ? id : arrastar.id); },
  });

  return (
    <dialog ref={ref} className="popup subs-jogo" aria-labelledby="h-subs" onClose={aoFechar} onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}>
      <BotaoFechar aoFechar={() => ref.current?.close()} />
      <h2 id="h-subs">{t("jogo.subs.titulo")}</h2>
      {subs && <p className="subs-resumo"><ContadoresSubs subs={subs} /></p>}
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
            {campo.map((j) => {
              const s = semaforo(j, "sai");
              const bloqueado = usadosSai.has(j.id) || ocupado || restantes <= 0;
              return (
                <li key={j.id} {...largavel("sai", j.id)}>
                  <button type="button" className={`subs-jogador${sel?.id === j.id ? " escolhido" : ""}${s ? ` apt-${s.nivel}` : ""}`} aria-pressed={sel?.id === j.id} title={dica(s)} disabled={bloqueado} onClick={() => clicar("sai", j.id)} {...arrastavel("sai", j.id, !bloqueado)}>
                    <b className="nota-pequena">{j.nota !== undefined ? j.nota.toFixed(1) : "–"}</b>
                    <span className="pos">{siglaPosicao(t, j.posicao)}</span>
                    <span className="subs-nome">{j.nome}</span>
                    <span className="inds">
                      {j.amarelos > 0 && <span className="ind"><IconeEvento chave="cartao" cor="amarelo" /></span>}
                      {j.lesionado && <span className="ind"><IconeEvento chave="lesao" /></span>}
                      {s && <i className="semaforo" aria-label={dica(s)} />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
        <section aria-label={t("jogo.banco")}>
          <h3>{t("jogo.subs.entra")}</h3>
          <ul>
            {banco.map((j) => {
              const s = semaforo(j, "entra");
              const bloqueado = usadosEntra.has(j.id) || ocupado || restantes <= 0;
              return (
                <li key={j.id} {...largavel("entra", j.id)}>
                  <button type="button" className={`subs-jogador${sel?.id === j.id ? " escolhido" : ""}${s ? ` apt-${s.nivel}` : ""}`} aria-pressed={sel?.id === j.id} title={dica(s)} disabled={bloqueado} onClick={() => clicar("entra", j.id)} {...arrastavel("entra", j.id, !bloqueado)}>
                    <span className="pos">{siglaPosicao(t, j.posicao)}</span>
                    <span className="subs-nome">{j.nome}</span>
                    {s && <i className="semaforo" aria-label={dica(s)} />}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
      {sel && jAtivo && <p className="suave subs-dica">{t(sel.tipo === "sai" ? "jogo.subs.escolheEntra" : "jogo.subs.escolheSai", { nome: jAtivo.nome })}</p>}
      {erro && <p className="erro" role="alert">{erro}</p>}
      <p className="acoes">
        <button type="button" className="primario" disabled={pares.length === 0 || ocupado} onClick={() => aoConfirmar(pares)}>{t("jogo.subs.confirmar")}{pares.length > 0 ? ` (${pares.length})` : ""}</button>
      </p>
    </dialog>
  );
}
