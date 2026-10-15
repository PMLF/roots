"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { JogoVivo, LinhaVivo } from "@/engine/epoca/jogoAoVivo";
import type { Chave } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";
import { useMotor } from "@/ui/MotorProvider";

/** Segundos de relógio por minuto de jogo em cada velocidade. */
const VELOCIDADES = [{ rotulo: "1×", seg: 0.5 }, { rotulo: "2×", seg: 0.25 }, { rotulo: "4×", seg: 0.1 }] as const;

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

/** Marcador de um jogo à passagem de um minuto. */
function marcadorAo(golos: { minuto: number; lado: "casa" | "fora" }[], minuto: number): [number, number] {
  const v = golos.filter((g) => g.minuto <= minuto);
  return [v.filter((g) => g.lado === "casa").length, v.filter((g) => g.lado === "fora").length];
}

type LinhaTabela = { clube: string; nome: string; jogos: number; pontos: number; dg: number; gm: number; pos: number; antes: number; aJogar: boolean };

/** A tabela da competição com os resultados que estão a decorrer somados (provisória). */
function tabelaAoVivo(jogo: JogoVivo, minuto: number): LinhaTabela[] {
  const golosDoJogo = jogo.linhas.filter((l) => l.tipo === "golo").map((l) => ({ minuto: l.minuto, lado: l.lado as "casa" | "fora" }));
  const emCurso = [
    { casa: jogo.casa.id, fora: jogo.fora.id, golos: golosDoJogo },
    ...jogo.outros.map((o) => ({ casa: o.casa.id, fora: o.fora.id, golos: o.golos })),
  ];
  const ordenar = <L extends { pontos: number; dg: number; gm: number; nome: string }>(l: L[]): L[] => l.sort((a, b) => b.pontos - a.pontos || b.dg - a.dg || b.gm - a.gm || a.nome.localeCompare(b.nome));
  const base = jogo.tabela.map((l) => ({ clube: l.clube, nome: l.nome, jogos: l.jogos, pontos: l.pontos, dg: l.golosMarcados - l.golosSofridos, gm: l.golosMarcados, aJogar: false }));
  const antes = new Map(ordenar([...base]).map((l, i) => [l.clube, i + 1] as const));
  const linhas = new Map<string, (typeof base)[number]>(base.map((l) => [l.clube, { ...l }]));
  for (const e of emCurso) {
    const [gc, gf] = marcadorAo(e.golos, minuto);
    for (const [clube, gm, gs] of [[e.casa, gc, gf], [e.fora, gf, gc]] as const) {
      const l = linhas.get(clube);
      if (!l) continue;
      l.jogos += 1; l.gm += gm; l.dg += gm - gs; l.aJogar = true;
      l.pontos += gm > gs ? jogo.pontosVitoria : gm === gs ? jogo.pontosEmpate : 0;
    }
  }
  return ordenar([...linhas.values()]).map((l, i) => ({ ...l, pos: i + 1, antes: antes.get(l.clube) ?? i + 1 }));
}

function Conteudo() {
  const { t } = useT();
  const motor = useMotor();
  const id = useSearchParams().get("id") ?? undefined;
  const [jogo, setJogo] = useState<JogoVivo | null | undefined>(undefined);
  const [minuto, setMinuto] = useState(0);
  const [aCorrer, setACorrer] = useState(true);
  const [vel, setVel] = useState(0);
  const [soImportante, setSoImportante] = useState(false);
  const relogio = useRef(0);

  useEffect(() => {
    if (!motor) return;
    let vivo = true;
    motor.chamar("jogoAoVivo", id ? { id } : {}).then((j) => { if (vivo) { setJogo(j); setMinuto(0); setACorrer(true); } }).catch(() => vivo && setJogo(null));
    return () => { vivo = false; };
  }, [motor, id]);

  const fim = jogo?.duracao ?? 0;
  useEffect(() => {
    if (!jogo || !aCorrer) return;
    relogio.current = window.setInterval(() => {
      setMinuto((m) => {
        if (m >= fim) { setACorrer(false); return fim; }
        return Math.min(fim, m + 1);
      });
    }, (VELOCIDADES[vel] as { seg: number }).seg * 1000);
    return () => window.clearInterval(relogio.current);
  }, [jogo, aCorrer, vel, fim]);

  const outrosGolos = useMemo(() => (jogo ? jogo.outros.flatMap((o) => {
    const ordem = [...o.golos].sort((x, y) => x.minuto - y.minuto);
    return ordem.map((g, i) => ({ minuto: g.minuto, o, gc: ordem.slice(0, i + 1).filter((x) => x.lado === "casa").length, gf: ordem.slice(0, i + 1).filter((x) => x.lado === "fora").length }));
  }) : []), [jogo]);
  const vistas = useMemo(() => {
    if (!jogo) return [];
    const proprias = jogo.linhas.filter((l) => l.minuto <= minuto && (!soImportante || l.importante || l.tipo === "fim" || l.tipo === "intervalo" || l.tipo === "inicio")).map((l, i) => ({ chave: `p${i}`, minuto: l.minuto, linha: l as LinhaVivo | undefined, outro: undefined as { casa: string; fora: string; gc: number; gf: number } | undefined }));
    const outros = outrosGolos.filter((g) => g.minuto <= minuto).map((g, i) => ({ chave: `o${i}`, minuto: g.minuto, linha: undefined as LinhaVivo | undefined, outro: { casa: g.o.casa.nome, fora: g.o.fora.nome, gc: g.gc, gf: g.gf } }));
    return [...proprias, ...outros].sort((a, b) => a.minuto - b.minuto);
  }, [jogo, minuto, soImportante, outrosGolos]);
  const tabela = useMemo(() => (jogo ? tabelaAoVivo(jogo, minuto) : []), [jogo, minuto]);
  if (jogo === undefined) return <p>{t("ficha.aCarregar")}</p>;
  if (jogo === null) return <p className="vazio">{t("jogo.semJogo")} <Link href="/">{t("jogo.voltar")}</Link></p>;
  const ultima = jogo.linhas.filter((l) => l.minuto <= minuto).at(-1);
  const gc = ultima?.golosCasa ?? 0;
  const gf = ultima?.golosFora ?? 0;
  const acabou = minuto >= fim;
  const emJogo = new Set([jogo.casa.id, jogo.fora.id]);
  return (
    <section className="pagina-jogo">
      <p className="suave">{jogo.competicao} · {t("jogo.jornada", { n: jogo.jornada })} · {jogo.data}</p>
      <h1 className="marcador" aria-live="polite">
        <span>{jogo.casa.nome}</span> <b>{gc}–{gf}</b> <span>{jogo.fora.nome}</span>
      </h1>
      <p className="relogio">{acabou ? t("jogo.terminado") : `${Math.floor(minuto)}'`}</p>
      <div className="acoes">
        <button type="button" className="primario" disabled={acabou} onClick={() => setACorrer((v) => !v)}>{aCorrer && !acabou ? t("jogo.pausa") : t("jogo.continuar")}</button>
        {VELOCIDADES.map((v, i) => <button key={v.rotulo} type="button" aria-pressed={vel === i} className={vel === i ? "ativo" : undefined} onClick={() => setVel(i)}>{v.rotulo}</button>)}
        <button type="button" disabled={acabou} onClick={() => { setMinuto(fim); setACorrer(false); }}>{t("jogo.saltar")}</button>
        <label><input type="checkbox" checked={soImportante} onChange={(e) => setSoImportante(e.target.checked)} /> {t("jogo.soImportante")}</label>
      </div>
      <div className="jogo-grelha">
        <ol className="feed" reversed>
          {[...vistas].reverse().map((v) => v.linha ? (
            <li key={v.chave} className={`feed-${v.linha.tipo}${v.linha.importante ? " importante" : ""}`}>
              <b>{Math.floor(v.minuto)}'</b> {v.linha.lado && <span className="suave">{v.linha.lado === "casa" ? jogo.casa.nome : jogo.fora.nome} · </span>}{textoDaLinha(v.linha, t)}
              {v.linha.tipo === "golo" && <b> {v.linha.golosCasa}–{v.linha.golosFora}</b>}
            </li>
          ) : (
            <li key={v.chave} className="feed-outro"><b>{Math.floor(v.minuto)}'</b> {t("jogo.outroGolo", { casa: v.outro!.casa, fora: v.outro!.fora, gc: v.outro!.gc, gf: v.outro!.gf })}</li>
          ))}
          {vistas.length === 0 && <li className="vazio">{t("jogo.arranque")}</li>}
        </ol>
        <aside className="jogo-lateral">
          <section className="painel" aria-labelledby="h-tabela">
            <h2 id="h-tabela">{t("jogo.tabela")}</h2>
            <table className="tabela-viva">
              <thead><tr><th>{t("jogo.col.pos")}</th><th>{t("jogo.col.clube")}</th><th>{t("jogo.col.j")}</th><th>{t("jogo.col.dg")}</th><th>{t("jogo.col.p")}</th></tr></thead>
              <tbody>
                {tabela.map((l) => (
                  <tr key={l.clube} className={emJogo.has(l.clube) ? "destaque" : l.aJogar ? "a-jogar" : undefined}>
                    <td>{l.pos}{l.pos < l.antes ? <span className="sobe" aria-label="▲"> ▲</span> : l.pos > l.antes ? <span className="desce" aria-label="▼"> ▼</span> : null}</td>
                    <td>{l.nome}</td><td>{l.jogos}</td><td>{l.dg > 0 ? `+${l.dg}` : l.dg}</td><td><b>{l.pontos}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="suave">{t("jogo.tabelaProvisoria")}</p>
          </section>
          {jogo.outros.length > 0 && (
            <section className="painel" aria-labelledby="h-outros">
              <h2 id="h-outros">{t("jogo.outrosJogos")}</h2>
              <ul className="ligacoes">
                {jogo.outros.map((o) => {
                  const [a, b] = marcadorAo(o.golos, minuto);
                  return <li key={o.id}>{o.casa.nome} <b>{a}–{b}</b> {o.fora.nome}{minuto >= o.duracao && <span className="suave"> · {t("jogo.fimJogo")}</span>}</li>;
                })}
              </ul>
            </section>
          )}
        </aside>
      </div>
      {acabou && <p><Link href="/">{t("jogo.voltar")}</Link></p>}
    </section>
  );
}

/** Jogo ao vivo (RZ-130): o jogo do teu clube minuto a minuto, com pausa e velocidade. */
export default function PaginaJogo() {
  return <Suspense fallback={null}><Conteudo /></Suspense>;
}
