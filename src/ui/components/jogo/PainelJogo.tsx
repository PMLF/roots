"use client";
import type { JogoVivo, LinhaVivo } from "@/engine/epoca/jogoAoVivo";
import { useEffect, useRef } from "react";
import type { Estilo, Nivel, Tatica } from "@/engine/jogo/tipos";
import { AmostraClube } from "@/ui/components/AmostraClube";
import type { Chave } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";
import { estatisticasDoJogo, marcadorAo, tabelaAoVivo } from "@/ui/jogo/vistaJogo";

type T = (c: Chave, v?: Record<string, string | number>) => string;
const VARIANTES: Record<string, number> = { "jogo.golo.abre": 2, "jogo.golo.empata": 2, "jogo.golo.vira": 2, "jogo.golo.aumenta": 2, "jogo.golo.reduz": 2, "jogo.remate.defendido": 3, "jogo.remate.fora": 3, "jogo.remate.bloqueado": 3, "jogo.remate.golo": 3, "jogo.canto": 2, "jogo.penalti": 2, "jogo.amarelo": 2, "jogo.vermelho": 2, "jogo.lesao": 2 };

/** Frase do comentário: várias por tipo de lance, escolhida de forma estável pelo minuto e pelo nome (RZ-131). */
function frase(base: string, l: LinhaVivo, t: T): string {
  const n = VARIANTES[base] ?? 1;
  const h = Math.abs(Math.floor(l.minuto * 7) + (l.nome ?? "").length * 13);
  return t((n === 1 ? base : `${base}.${(h % n) + 1}`) as Chave, { nome: l.nome ?? "" });
}

function textoDaLinha(l: LinhaVivo, t: T): string {
  switch (l.tipo) {
    case "inicio": return t("jogo.inicio");
    case "golo": return frase(`jogo.golo.${l.situacao ?? "abre"}`, l, t) + (l.assistente ? ` ${t("jogo.assistencia", { nome: l.assistente })}` : "");
    case "remate": return frase(`jogo.remate.${l.resultado ?? "fora"}`, l, t);
    case "canto": return frase("jogo.canto", l, t);
    case "penalti": return frase("jogo.penalti", l, t);
    case "cartao": return l.cor === "vermelho" && l.segundoAmarelo ? frase("jogo.segundoAmarelo", l, t) : frase(l.cor === "vermelho" ? "jogo.vermelho" : "jogo.amarelo", l, t);
    case "lesao": return frase("jogo.lesao", l, t);
    case "substituicao": return t("jogo.substituicao", { sai: l.nome ?? "", entra: l.entra ?? "" });
    case "intervalo": return t("jogo.intervalo");
    case "fim": return t("jogo.fim");
  }
}

/** O feed do jogo, do lance mais recente para o mais antigo. Só os lances do próprio jogo: os outros jogos têm cartão à parte. */
export function Eventos({ jogo, soImportante }: { jogo: JogoVivo; soImportante: boolean }) {
  const { t } = useT();
  const minuto = jogo.minuto ?? jogo.duracao;
  const linhas = jogo.linhas.filter((l) => l.minuto <= minuto && (!soImportante || l.importante || l.tipo === "fim" || l.tipo === "intervalo" || l.tipo === "inicio"));
  const nomeDe = (lado: "casa" | "fora" | undefined) => (lado === "casa" ? jogo.casa.nome : lado === "fora" ? jogo.fora.nome : "");
  return (
    <ol className="feed" reversed aria-label={t("jogo.eventos")}>
      {[...linhas].reverse().map((l, i) => (
        <li key={`${l.minuto}-${l.tipo}-${linhas.length - i}`} className={`feed-${l.tipo}${l.importante ? " importante" : ""}`}>
          <b>{Math.floor(l.minuto)}'</b> {l.lado && <span className="suave">{nomeDe(l.lado)} · </span>}{textoDaLinha(l, t)}
          {l.tipo === "golo" && <b> {l.golosCasa}–{l.golosFora}</b>}
        </li>
      ))}
      {linhas.length === 0 && <li className="vazio">{t("jogo.arranque")}</li>}
    </ol>
  );
}

/** A tabela da competição, com os resultados em curso somados. */
export function TabelaViva({ jogo, meu }: { jogo: JogoVivo; meu?: string }) {
  const { t } = useT();
  const minuto = jogo.minuto ?? jogo.duracao;
  const tabela = tabelaAoVivo(jogo, minuto);
  const emJogo = new Set([jogo.casa.id, jogo.fora.id]);
  return (
    <section className="painel" aria-labelledby="h-tabela">
      <h2 id="h-tabela">{t("jogo.tabela")}</h2>
      <table className="tabela-viva">
        <thead><tr><th>{t("jogo.col.pos")}</th><th>{t("jogo.col.clube")}</th><th>{t("jogo.col.j")}</th><th>{t("jogo.col.dg")}</th><th>{t("jogo.col.p")}</th></tr></thead>
        <tbody>
          {tabela.map((l) => (
            <tr key={l.clube} className={l.clube === meu ? "meu-clube" : emJogo.has(l.clube) ? "destaque" : l.aJogar ? "a-jogar" : undefined}>
              <td>{l.pos}{l.pos < l.antes ? <span className="sobe" aria-label="▲"> ▲</span> : l.pos > l.antes ? <span className="desce" aria-label="▼"> ▼</span> : null}</td>
              <td className="nome-clube"><AmostraClube cores={jogo.cores?.[l.clube]} />{l.nome}</td><td>{l.jogos}</td><td>{l.dg > 0 ? `+${l.dg}` : l.dg}</td><td><b>{l.pontos}</b></td>
            </tr>
          ))}
        </tbody>
      </table>
      {jogo.emCurso && <p className="suave">{t("jogo.tabelaProvisoria")}</p>}
    </section>
  );
}

/** Os outros jogos da mesma competição, no mesmo dia, com o marcador ao minuto. */
export function OutrosJogos({ jogo, meu }: { jogo: JogoVivo; meu?: string }) {
  const { t } = useT();
  const minuto = jogo.minuto ?? jogo.duracao;
  if (jogo.outros.length === 0) return null;
  return (
    <section className="painel" aria-labelledby="h-outros">
      <h2 id="h-outros">{t("jogo.outrosJogos")}</h2>
      <ul className="outros-jogos">
        {jogo.outros.map((o) => {
          const [a, b] = marcadorAo(o.golos, minuto);
          return (
            <li key={o.id}>
              <span className={`nome-clube${o.casa.id === meu ? " meu-clube" : ""}`}><AmostraClube cores={jogo.cores?.[o.casa.id]} />{o.casa.nome}</span>
              <b className="marcador-pequeno">{a}</b>
              <span className={`nome-clube${o.fora.id === meu ? " meu-clube" : ""}`}><AmostraClube cores={jogo.cores?.[o.fora.id]} />{o.fora.nome}</span>
              <b className="marcador-pequeno">{b}</b>
              {minuto >= o.duracao && <span className="suave fim-jogo">{t("jogo.fimJogo")}</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const fmt = (v: number, formato: "inteiro" | "decimal" | "percentagem") => (formato === "inteiro" ? String(Math.round(v)) : formato === "decimal" ? v.toFixed(2) : `${Math.round(v * 100)}%`);

/** Estatísticas lado a lado; a barra mostra a parte de cada equipa. */
export function Estatisticas({ jogo }: { jogo: JogoVivo }) {
  const { t } = useT();
  if (!jogo.resumo) return null;
  const linhas = estatisticasDoJogo(jogo.resumo);
  return (
    <section className="painel" aria-labelledby="h-estat">
      <h2 id="h-estat">{t("jogo.estatisticas")}</h2>
      <ul className="estatisticas">
        {linhas.map((l) => {
          const total = l.casa + l.fora;
          const pc = total > 0 ? (l.casa / total) * 100 : 50;
          return (
            <li key={l.chave}>
              <span className="estat-valor estat-casa">{fmt(l.casa, l.formato)}</span>
              <span className="estat-nome">{t(`jogo.stat.${l.chave}` as Chave)}</span>
              <span className="estat-valor estat-fora">{fmt(l.fora, l.formato)}</span>
              <span className="estat-barra" aria-hidden="true"><i style={{ width: `${pc}%` }} /></span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const ESTILOS: Estilo[] = ["bonito", "equilibrado", "direto", "contraAtaque"];
const CAMPOS_NIVEL = ["intensidade", "linha", "ritmo", "fairPlay"] as const;

/** Mudanças de tática durante o jogo, num popup: contam a partir do minuto seguinte. A formação e o onze ficam como estavam. */
export function TaticaNoJogo({ tatica, aoMudar, aoFechar, ocupado }: { tatica: Tatica; aoMudar: (t: Tatica) => void; aoFechar: () => void; ocupado: boolean }) {
  const { t } = useT();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => { if (d?.open) d.close(); };
  }, []);
  return (
    <dialog ref={ref} className="popup tatica-jogo" aria-labelledby="h-tatica-jogo" onClose={aoFechar} onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}>
      <h2 id="h-tatica-jogo">{t("jogo.taticaTitulo")}</h2>
      <div className="formulario">
        <p className="suave">{t("lab.formacao")}: <b>{tatica.formacao}</b></p>
        <label>{t("lab.estilo")}{" "}
          <select value={tatica.estilo} disabled={ocupado} onChange={(e) => aoMudar({ ...tatica, estilo: e.target.value as Estilo })}>
            {ESTILOS.map((s) => <option key={s} value={s}>{t(`lab.estilo.${s}` as Chave)}</option>)}
          </select>
        </label>
        {CAMPOS_NIVEL.map((k) => (
          <label key={k}>{t(`tatica.${k}` as Chave)}{" "}
            <select value={tatica[k]} disabled={ocupado} onChange={(e) => aoMudar({ ...tatica, [k]: Number(e.target.value) as Nivel })}>
              {([1, 2, 3, 4, 5] as const).map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        ))}
      </div>
      <p className="suave">{t("jogo.taticaAviso")}</p>
      <p className="acoes"><button type="button" className="primario" onClick={() => ref.current?.close()}>{t("jogo.taticaFechar")}</button></p>
    </dialog>
  );
}
