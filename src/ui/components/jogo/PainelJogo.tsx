"use client";
import type { JogadorVivo, JogoVivo, LinhaVivo } from "@/engine/epoca/jogoAoVivo";
import { useEffect, useRef } from "react";
import type { Estilo, Nivel, Tatica } from "@/engine/jogo/tipos";
import type { ReactNode } from "react";
import { AmostraClube } from "@/ui/components/AmostraClube";
import { Ligacao } from "@/ui/components/Ligacao";
import type { Chave } from "@/ui/i18n";
import { siglaPosicao } from "@/ui/i18n/posicao";
import { useT } from "@/ui/i18n/LocaleProvider";
import { estatisticasDoJogo, marcadorAo, tabelaAoVivo, zonaDaPosicao } from "@/ui/jogo/vistaJogo";

type T = (c: Chave, v?: Record<string, string | number>) => string;
const VARIANTES: Record<string, number> = { "jogo.golo.abre": 2, "jogo.golo.empata": 2, "jogo.golo.vira": 2, "jogo.golo.aumenta": 2, "jogo.golo.reduz": 2, "jogo.remate.defendido": 3, "jogo.remate.fora": 3, "jogo.remate.bloqueado": 3, "jogo.remate.golo": 3, "jogo.canto": 2, "jogo.penalti": 2, "jogo.amarelo": 2, "jogo.vermelho": 2, "jogo.lesao": 2 };

/** Frase do comentário: várias por tipo de lance, escolhida de forma estável pelo minuto e pelo nome (RZ-131). */
function frase(base: string, l: LinhaVivo, t: T): string {
  const n = VARIANTES[base] ?? 1;
  const h = Math.abs(Math.floor(l.minuto * 7) + (l.nome ?? "").length * 13);
  return t((n === 1 ? base : `${base}.${(h % n) + 1}`) as Chave, { nome: MARCA.nome });
}

/** O texto do comentário leva marcas no lugar dos nomes; `comLigacoes` troca-as por ligações às fichas. */
const MARCA = { nome: "\uE000n\uE000", assistente: "\uE000a\uE000", entra: "\uE000e\uE000" };
function comLigacoes(texto: string, l: LinhaVivo): ReactNode[] {
  const alvo = (c: string) => (c === "n" ? { id: l.jogador, nome: l.nome } : c === "a" ? { id: l.assistenteId, nome: l.assistente } : { id: l.entraId, nome: l.entra });
  return texto.split(/\uE000([nae])\uE000/).map((parte, i) => {
    if (i % 2 === 0) return parte;
    const a = alvo(parte);
    return a.id ? <Ligacao key={i} k="pessoa" id={a.id}>{a.nome}</Ligacao> : (a.nome ?? "");
  });
}

function textoDaLinha(l: LinhaVivo, t: T): string {
  switch (l.tipo) {
    case "inicio": return t("jogo.inicio");
    case "golo": return frase(`jogo.golo.${l.situacao ?? "abre"}`, l, t) + (l.assistente ? ` ${t("jogo.assistencia", { nome: MARCA.assistente })}` : "");
    case "remate": return frase(`jogo.remate.${l.resultado ?? "fora"}`, l, t);
    case "canto": return frase("jogo.canto", l, t);
    case "penalti": return frase("jogo.penalti", l, t);
    case "cartao": return l.cor === "vermelho" && l.segundoAmarelo ? frase("jogo.segundoAmarelo", l, t) : frase(l.cor === "vermelho" ? "jogo.vermelho" : "jogo.amarelo", l, t);
    case "lesao": return frase("jogo.lesao", l, t);
    case "substituicao": return t("jogo.substituicao", { sai: MARCA.nome, entra: MARCA.entra });
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
          <b>{Math.floor(l.minuto)}'</b> {l.lado && <span className="suave"><Ligacao k="clube" id={l.lado === "casa" ? jogo.casa.id : jogo.fora.id} semAmostra>{nomeDe(l.lado)}</Ligacao> · </span>}{comLigacoes(textoDaLinha(l, t), l)}
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
      <table className="tabela-viva tabela">
        <thead><tr><th>{t("jogo.col.pos")}</th><th>{t("jogo.col.clube")}</th><th>{t("jogo.col.j")}</th><th>{t("jogo.col.dg")}</th><th>{t("jogo.col.p")}</th></tr></thead>
        <tbody>
          {tabela.map((l) => (
            <tr key={l.clube} className={[zonaDaPosicao(l.pos, tabela.length, jogo.zonas) ? `zona zona-${zonaDaPosicao(l.pos, tabela.length, jogo.zonas)}` : "", l.clube === meu ? "meu-clube" : emJogo.has(l.clube) ? "destaque" : l.aJogar ? "a-jogar" : ""].filter(Boolean).join(" ") || undefined}>
              <td>{l.pos}{l.pos < l.antes ? <span className="sobe" aria-label="▲"> ▲</span> : l.pos > l.antes ? <span className="desce" aria-label="▼"> ▼</span> : null}</td>
              <td className="nome-clube"><AmostraClube cores={jogo.cores?.[l.clube]} /><Ligacao k="clube" id={l.clube} semAmostra>{l.nome}</Ligacao></td><td>{l.jogos}</td><td>{l.dg > 0 ? `+${l.dg}` : l.dg}</td><td><b>{l.pontos}</b></td>
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
            <li key={o.id} className={o.casa.id === meu || o.fora.id === meu ? "meu-jogo" : undefined}>
              <AmostraClube cores={jogo.cores?.[o.casa.id]} className="amostra-esq" />
              <span className={`nome-clube nome-casa${o.casa.id === meu ? " meu-clube" : ""}`}><Ligacao k="clube" id={o.casa.id} semAmostra>{o.casa.nome}</Ligacao></span>
              <b className="marcador-pequeno">{a}–{b}</b>
              <span className={`nome-clube nome-fora${o.fora.id === meu ? " meu-clube" : ""}`}><Ligacao k="clube" id={o.fora.id} semAmostra>{o.fora.nome}</Ligacao></span>
              <AmostraClube cores={jogo.cores?.[o.fora.id]} className="amostra-dir" />
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

const classeNota = (n: number) => (n >= 7.5 ? "nota-alta" : n >= 6.5 ? "nota-boa" : n >= 5.5 ? "nota-media" : "nota-baixa");

function LinhaJogador({ j }: { j: JogadorVivo }) {
  const { t } = useT();
  const marcas = (n: number, glifo: string, chave: Chave) => (n > 0 ? <span className="ind" title={t(chave)} aria-label={`${n} ${t(chave)}`}>{glifo}{n > 1 ? `×${n}` : ""}</span> : null);
  return (
    <li className={`jogador-vivo jv-${j.estado}`}>
      <b className={`nota ${j.nota !== undefined ? classeNota(j.nota) : "nota-vazia"}`} title={t("jogo.nota")}>{j.nota !== undefined ? j.nota.toFixed(1) : "–"}</b>
      <span className="pos">{siglaPosicao(t, j.posicao)}</span>
      <span className="jv-nome"><Ligacao k="pessoa" id={j.id}>{j.nome}</Ligacao></span>
      <span className="inds">
        {marcas(j.golos, "⚽", "jogo.ind.golo")}
        {marcas(j.assistencias, "🅰", "jogo.ind.assistencia")}
        {marcas(j.amarelos, "🟨", "jogo.ind.amarelo")}
        {j.vermelho && <span className="ind" title={t("jogo.ind.vermelho")} aria-label={t("jogo.ind.vermelho")}>🟥</span>}
        {j.lesionado && <span className="ind" title={t("jogo.ind.lesao")} aria-label={t("jogo.ind.lesao")}>✚</span>}
        {j.entrou !== undefined && <span className="ind sub-entra" title={t("jogo.ind.entrou", { min: Math.floor(j.entrou) })}>▲ {Math.floor(j.entrou)}'</span>}
        {j.saiu !== undefined && j.estado !== "expulso" && <span className="ind sub-sai" title={t("jogo.ind.saiu", { min: Math.floor(j.saiu) })}>▼ {Math.floor(j.saiu)}'</span>}
        {j.estado === "expulso" && j.saiu !== undefined && <span className="ind sub-sai">{Math.floor(j.saiu)}'</span>}
      </span>
    </li>
  );
}

/** Os dois onzes (e bancos) com a nota de cada jogador ao minuto, o que fez e quando entrou ou saiu. */
export function Equipas({ jogo }: { jogo: JogoVivo }) {
  const { t } = useT();
  if (!jogo.equipas) return null;
  const lado = (l: "casa" | "fora") => {
    const todos = jogo.equipas![l];
    const campo = todos.filter((j) => j.estado !== "banco" && j.entrou === undefined);
    const entraram = todos.filter((j) => j.entrou !== undefined);
    const banco = todos.filter((j) => j.estado === "banco");
    return (
      <div className="equipa-vivo">
        <h3><AmostraClube cores={jogo.cores?.[jogo[l].id]} /> <Ligacao k="clube" id={jogo[l].id} semAmostra>{jogo[l].nome}</Ligacao></h3>
        <ul>{campo.map((j) => <LinhaJogador key={j.id} j={j} />)}</ul>
        {entraram.length > 0 && <><h4>{t("jogo.entraram")}</h4><ul>{entraram.map((j) => <LinhaJogador key={j.id} j={j} />)}</ul></>}
        {banco.length > 0 && <><h4>{t("jogo.banco")}</h4><ul>{banco.map((j) => <LinhaJogador key={j.id} j={j} />)}</ul></>}
      </div>
    );
  };
  return (
    <section className="painel painel-equipas" aria-labelledby="h-equipas">
      <h2 id="h-equipas">{t("jogo.equipas")}</h2>
      <div className="equipas-vivo">{lado("casa")}{lado("fora")}</div>
    </section>
  );
}
