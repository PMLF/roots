"use client";
import type { JogadorVivo, JogoVivo, LinhaVivo } from "@/engine/epoca/jogoAoVivo";
import { useEffect, useRef, useState } from "react";
import { corPredominante } from "@/ui/cores";
import type { Estilo, Nivel, Tatica } from "@/engine/jogo/tipos";
import type { ReactNode } from "react";
import { AmostraClube } from "@/ui/components/AmostraClube";
import { Icone } from "@/ui/components/Icone";
import { BotaoFechar } from "@/ui/components/BotaoFechar";
import { IconeEvento, chaveIcone } from "@/ui/components/IconeEvento";
import { ContadoresSubs, semSubstituicoes } from "@/ui/components/jogo/Substituicoes";
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
    case "golo": return frase(`jogo.golo.${l.situacao ?? "abre"}`, l, t);
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
        <li key={`${l.minuto}-${l.tipo}-${linhas.length - i}`} className={`feed-${l.tipo}${l.tipo === "cartao" && l.cor ? ` feed-cartao-${l.cor}` : ""}${l.importante ? " importante" : ""}`}>
          <span className="feed-cab"><IconeEvento chave={chaveIcone(l)} {...(l.tipo === "cartao" && l.cor ? { cor: l.cor } : {})} /><b>{Math.floor(l.minuto)}'</b>{l.lado && <span className="feed-clube"><Ligacao k="clube" id={l.lado === "casa" ? jogo.casa.id : jogo.fora.id} semAmostra>{nomeDe(l.lado)}</Ligacao></span>}{l.tipo === "golo" && <b className="feed-marcador">{l.golosCasa}–{l.golosFora}</b>}</span>
          <span className="feed-texto">{comLigacoes(textoDaLinha(l, t), l)}</span>
          {l.tipo === "golo" && l.assistente && <span className="feed-assist">{comLigacoes(t("jogo.assistencia", { nome: MARCA.assistente }), l)}</span>}
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
export function Estatisticas({ jogo, semPainel = false }: { jogo: JogoVivo; semPainel?: boolean }) {
  const { t } = useT();
  if (!jogo.resumo) return null;
  const linhas = estatisticasDoJogo(jogo.resumo);
  const lista = (
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
  );
  if (semPainel) return lista;
  return (
    <section className="painel" aria-labelledby="h-estat">
      <h2 id="h-estat">{t("jogo.estatisticas")}</h2>
      {lista}
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
      <BotaoFechar aoFechar={() => ref.current?.close()} />
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
    </dialog>
  );
}

/** Popup do intervalo: o jogo está parado; resumo da primeira parte e as decisões possíveis (tática; substituições no RZ-215). */
export function Intervalo({ jogo, aoTatica, aoSubs, aoContinuar }: { jogo: JogoVivo; aoTatica: () => void; aoSubs: () => void; aoContinuar: () => void }) {
  const { t } = useT();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  const CHAVES = ["posse", "xg", "remates", "aBaliza", "oportunidades", "cantos", "faltas", "amarelos"];
  const linhas = jogo.resumo ? estatisticasDoJogo(jogo.resumo).filter((l) => CHAVES.includes(l.chave)).sort((x, y) => CHAVES.indexOf(x.chave) - CHAVES.indexOf(y.chave)) : [];
  return (
    <dialog ref={ref} className="popup intervalo-jogo" aria-labelledby="h-intervalo" onCancel={(e) => { e.preventDefault(); aoContinuar(); }}>
      <h2 id="h-intervalo">{t("jogo.intervaloTitulo")}</h2>
      <div className="intervalo-corpo">
        {linhas.length > 0 && (
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
        )}
        <div className="intervalo-xg"><GraficoXg jogo={jogo} semPainel preencher /></div>
      </div>
      {jogo.subs && <p className="subs-resumo"><ContadoresSubs subs={jogo.subs} /></p>}
      <p className="acoes">
        <button type="button" onClick={aoTatica}><Icone nome="tatica" />{t("jogo.intervaloTatica")}</button>
        <button type="button" onClick={aoSubs} disabled={semSubstituicoes(jogo.subs, true)}><IconeEvento chave="substituicao" />{t("jogo.subs.botao")}</button>
        <button type="button" className="primario" onClick={aoContinuar} autoFocus>{t("jogo.segundaParte")}</button>
      </p>
    </dialog>
  );
}

const classeNota = (n: number) => (n >= 7.5 ? "nota-alta" : n >= 6.5 ? "nota-boa" : n >= 5.5 ? "nota-media" : "nota-baixa");

function LinhaJogador({ j }: { j: JogadorVivo }) {
  const { t } = useT();
  const marcas = (n: number, glifo: ReactNode, chave: Chave) => (n > 0 ? <span className="ind" title={t(chave)} aria-label={`${n} ${t(chave)}`}>{glifo}{n > 1 ? `×${n}` : ""}</span> : null);
  return (
    <li className={`jogador-vivo jv-${j.estado}`}>
      <b className={`nota ${j.nota !== undefined ? classeNota(j.nota) : "nota-vazia"}`} title={t("jogo.nota")}>{j.nota !== undefined ? j.nota.toFixed(1) : "–"}</b>
      <span className="pos">{siglaPosicao(t, j.posicao)}</span>
      <span className="jv-nome"><Ligacao k="pessoa" id={j.id}>{j.nome}</Ligacao></span>
      <span className="inds">
        {marcas(j.golos, <IconeEvento chave="golo" />, "jogo.ind.golo")}
        {marcas(j.assistencias, <b className="ind-assist">A</b>, "jogo.ind.assistencia")}
        {marcas(j.amarelos, <IconeEvento chave="cartao" cor="amarelo" />, "jogo.ind.amarelo")}
        {j.vermelho && <span className="ind" title={t("jogo.ind.vermelho")} aria-label={t("jogo.ind.vermelho")}><IconeEvento chave="cartao" cor="vermelho" /></span>}
        {j.lesionado && <span className="ind" title={t("jogo.ind.lesao")} aria-label={t("jogo.ind.lesao")}><IconeEvento chave="lesao" /></span>}
        {j.entrou !== undefined && <span className="ind sub-entra" title={t("jogo.ind.entrou", { min: Math.floor(j.entrou) })}>▲ {Math.floor(j.entrou)}'</span>}
        {j.saiu !== undefined && j.estado !== "expulso" && <span className="ind sub-sai" title={t("jogo.ind.saiu", { min: Math.floor(j.saiu) })}>▼ {Math.floor(j.saiu)}'</span>}
        {j.estado === "expulso" && j.saiu !== undefined && <span className="ind sub-sai">{Math.floor(j.saiu)}'</span>}
      </span>
    </li>
  );
}

/**
 * O onze tal como está agora: quem entrou ocupa o lugar de quem saiu (com a seta verde e o minuto). Por baixo, o banco que
 * resta e os que já saíram.
 */
function Onze({ jogo, lado, comBanco }: { jogo: JogoVivo; lado: "casa" | "fora"; comBanco: boolean }) {
  const { t } = useT();
  const todos = jogo.equipas?.[lado] ?? [];
  const porId = new Map(todos.map((j) => [j.id, j] as const));
  const iniciais = todos.filter((j) => j.entrou === undefined && j.estado !== "banco");
  const ocupante = (j: JogadorVivo): JogadorVivo => {
    let atual = j;
    const vistos = new Set<string>();
    while (atual.estado === "saiu" && atual.trocaCom && !vistos.has(atual.id)) {
      vistos.add(atual.id);
      const seguinte = porId.get(atual.trocaCom.id);
      if (!seguinte || seguinte.entrou === undefined) break;
      atual = seguinte;
    }
    return atual;
  };
  const campo = iniciais.map(ocupante);
  const banco = todos.filter((j) => j.estado === "banco");
  const saidos = todos.filter((j) => j.estado === "saiu");
  return (
    <div className="equipa-vivo">
      <ul>{campo.map((j) => <LinhaJogador key={j.id} j={j} />)}</ul>
      {comBanco && banco.length > 0 && <><h4>{t("jogo.banco")}</h4><ul>{banco.map((j) => <LinhaJogador key={j.id} j={j} />)}</ul></>}
      {comBanco && saidos.length > 0 && <><h4>{t("jogo.saiuLista")}</h4><ul>{saidos.map((j) => <LinhaJogador key={j.id} j={j} />)}</ul></>}
    </div>
  );
}

/** Cartão de uma equipa: o onze com notas e indicadores, os que entraram e o banco (recolhido). */
export function CartaoEquipa({ jogo, lado }: { jogo: JogoVivo; lado: "casa" | "fora" }) {
  const { t } = useT();
  const [comBanco, setComBanco] = useState(false);
  if (!jogo.equipas) return null;
  return (
    <section className="painel cartao-equipa" aria-label={jogo[lado].nome}>
      <div className="cartao-equipa-topo">
        <h2><AmostraClube cores={jogo.cores?.[jogo[lado].id]} /> <Ligacao k="clube" id={jogo[lado].id} semAmostra>{jogo[lado].nome}</Ligacao></h2>
        <label className="interruptor"><input type="checkbox" checked={comBanco} onChange={(e) => setComBanco(e.target.checked)} /> {t("jogo.verSuplentes")}</label>
      </div>
      <Onze jogo={jogo} lado={lado} comBanco={comBanco} />
    </section>
  );
}

/** Evolução do xG acumulado de cada equipa, minuto a minuto (degraus: o xG sobe quando há remate). */
export function GraficoXg({ jogo, semPainel = false, preencher = false }: { jogo: JogoVivo; semPainel?: boolean; /** Ocupa a altura que sobra ao pai (popup do intervalo). */ preencher?: boolean }) {
  const { t } = useT();
  const xg = jogo.xg;
  const caixa = useRef<HTMLDivElement>(null);
  const [tam, setTam] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const el = caixa.current;
    if (!preencher || !el) return;
    const ler = () => setTam({ w: Math.max(200, el.clientWidth), h: Math.max(120, el.clientHeight) });
    ler();
    const ro = new ResizeObserver(ler);
    ro.observe(el);
    return () => ro.disconnect();
  }, [preencher]);
  if (!xg || xg.casa.length < 2) return null;
  const W = preencher && tam ? tam.w : 320;
  const H = preencher && tam ? tam.h : 150;
  const m = { e: 26, d: 8, c: 8, b: 20 };
  const fim = Math.max(jogo.duracao, xg.casa.length - 1, 90);
  const topo = Math.max(1, Math.ceil(Math.max(...xg.casa, ...xg.fora) * 2) / 2);
  const x = (min: number) => m.e + (min / fim) * (W - m.e - m.d);
  const y = (v: number) => H - m.b - (v / topo) * (H - m.b - m.c);
  const degraus = (serie: number[]) => serie.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(serie[i - 1] ?? v).toFixed(1)} L${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const ultimo = xg.casa.length - 1;
  const marcas = [0, 15, 30, 45, 60, 75, 90].filter((n) => n <= fim);
  const nomes = { casa: jogo.casa.nome, fora: jogo.fora.nome };
  const cor = { casa: corPredominante(jogo.cores?.[jogo.casa.id]) ?? "var(--destaque)", fora: corPredominante(jogo.cores?.[jogo.fora.id]) ?? "var(--texto)" };
  const conteudo = (
    <>
      <div ref={caixa} className={preencher ? "grafico-xg-caixa" : undefined}><svg className="grafico-xg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("jogo.xg.aria", { casa: nomes.casa, a: xg.casa[ultimo]!.toFixed(2), fora: nomes.fora, b: xg.fora[ultimo]!.toFixed(2) })}>
        {[0, topo / 2, topo].map((v) => <g key={v}><line className="xg-grelha" x1={m.e} x2={W - m.d} y1={y(v)} y2={y(v)} /><text className="xg-eixo" x={m.e - 4} y={y(v) + 3} textAnchor="end">{v.toFixed(1)}</text></g>)}
        {marcas.map((n) => <text key={n} className="xg-eixo" x={x(n)} y={H - 6} textAnchor="middle">{n}'</text>)}
        <path className="xg-linha xg-fora" stroke={cor.fora} d={degraus(xg.fora)} />
        <path className="xg-linha xg-casa" stroke={cor.casa} d={degraus(xg.casa)} />
      </svg></div>
      <p className="xg-legenda">
        <span><i className="xg-chave xg-casa" style={{ borderTopColor: cor.casa }} /> {nomes.casa} <b>{xg.casa[ultimo]!.toFixed(2)}</b></span>
        <span><i className="xg-chave xg-fora" style={{ borderTopColor: cor.fora }} /> {nomes.fora} <b>{xg.fora[ultimo]!.toFixed(2)}</b></span>
      </p>
    </>
  );
  if (semPainel) return conteudo;
  return (
    <section className="painel" aria-labelledby="h-xg">
      <h2 id="h-xg">{t("jogo.xg.titulo")}</h2>
      {conteudo}
    </section>
  );
}

/** Últimos jogos entre as duas equipas e quem ganhou mais vezes. */
export function Confrontos({ jogo }: { jogo: JogoVivo }) {
  const { t } = useT();
  const lista = jogo.confrontos ?? [];
  const nome = (id: string) => (id === jogo.casa.id ? jogo.casa.nome : id === jogo.fora.id ? jogo.fora.nome : id);
  let a = 0;
  let b = 0;
  let e = 0;
  for (const c of lista) {
    if (c.golosCasa === c.golosFora) e++;
    else if ((c.golosCasa > c.golosFora ? c.casa : c.fora) === jogo.casa.id) a++;
    else b++;
  }
  return (
    <section className="painel" aria-labelledby="h-conf">
      <h2 id="h-conf">{t("jogo.confrontos.titulo")}</h2>
      {lista.length === 0 ? <p className="vazio">{t("jogo.confrontos.sem")}</p> : (
        <>
          <p className="confrontos-resumo"><b>{a}</b> {jogo.casa.nome} · <b>{e}</b> {t("jogo.confrontos.empates")} · <b>{b}</b> {jogo.fora.nome}</p>
          <ul className="confrontos">
            {lista.map((c) => (
              <li key={c.id}>
                <span className="suave">{c.data}</span>
                <span className="confronto-resultado">{nome(c.casa)} <b>{c.golosCasa}–{c.golosFora}</b> {nome(c.fora)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** Por baixo do resultado: estádio, adeptos com barra de ocupação, árbitro e quem transmite. */
export function InfoCabecalho({ jogo }: { jogo: JogoVivo }) {
  const { t } = useT();
  const i = jogo.info;
  if (!i) return null;
  const pct = Math.round((i.assistencia / i.estadio.capacidade) * 100);
  const meio = (m: "tv" | "streaming" | "radio") => t(`jogo.meio.${m}` as Chave);
  return (
    <div className="info-cabecalho">
      <p>
        <span>{i.estadio.nome} · {i.estadio.localidade}</span>
        <span className="info-adeptos" title={t("jogo.info.assistencia")}>
          <b>{i.assistencia.toLocaleString("pt-PT")}</b> / {i.estadio.capacidade.toLocaleString("pt-PT")}
          <span className="barra-ocupacao" role="img" aria-label={`${t("jogo.info.assistencia")}: ${pct}%`}><i style={{ width: `${pct}%` }} /></span>
          {pct}%
        </span>
      </p>
      {((i.arbitro) || (i.canais && i.canais.length > 0)) && (
        <p>
          {i.arbitro && <span>{t("jogo.info.arbitro")}: {i.arbitro}</span>}
          {i.canais && i.canais.length > 0 && <span>{t("jogo.info.canais")}: {i.canais.map((c) => `${c.nome} (${meio(c.meio)})`).join(", ")}</span>}
        </p>
      )}
    </div>
  );
}
