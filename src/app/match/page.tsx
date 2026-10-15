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

function textoDaLinha(l: LinhaVivo, t: (c: Chave, v?: Record<string, string | number>) => string): string {
  const nome = l.nome ?? "";
  switch (l.tipo) {
    case "golo": return t("jogo.golo", { nome }) + (l.assistente ? ` ${t("jogo.assistencia", { nome: l.assistente })}` : "");
    case "remate": return t(`jogo.remate.${l.resultado ?? "fora"}` as Chave, { nome });
    case "canto": return t("jogo.canto");
    case "penalti": return t("jogo.penalti", { nome });
    case "cartao": return t(l.cor === "vermelho" ? (l.segundoAmarelo ? "jogo.segundoAmarelo" : "jogo.vermelho") : "jogo.amarelo", { nome });
    case "lesao": return t("jogo.lesao", { nome });
    case "substituicao": return t("jogo.substituicao", { sai: nome, entra: l.entra ?? "" });
    case "intervalo": return t("jogo.intervalo");
    case "fim": return t("jogo.fim");
  }
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

  const vistas = useMemo(() => (jogo ? jogo.linhas.filter((l) => l.minuto <= minuto && (!soImportante || l.importante || l.tipo === "fim" || l.tipo === "intervalo")) : []), [jogo, minuto, soImportante]);
  if (jogo === undefined) return <p>{t("ficha.aCarregar")}</p>;
  if (jogo === null) return <p className="vazio">{t("jogo.semJogo")} <Link href="/">{t("jogo.voltar")}</Link></p>;
  const ultima = jogo.linhas.filter((l) => l.minuto <= minuto).at(-1);
  const gc = ultima?.golosCasa ?? 0;
  const gf = ultima?.golosFora ?? 0;
  const acabou = minuto >= fim;
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
      <ol className="feed" reversed>
        {[...vistas].reverse().map((l, i) => (
          <li key={`${l.minuto}-${l.tipo}-${i}`} className={`feed-${l.tipo}${l.importante ? " importante" : ""}`}>
            <b>{Math.floor(l.minuto)}'</b> {l.lado && <span className="suave">{l.lado === "casa" ? jogo.casa.nome : jogo.fora.nome} · </span>}{textoDaLinha(l, t)}
            {l.tipo === "golo" && <b> {l.golosCasa}–{l.golosFora}</b>}
          </li>
        ))}
        {vistas.length === 0 && <li className="vazio">{t("jogo.arranque")}</li>}
      </ol>
      {acabou && <p><Link href="/">{t("jogo.voltar")}</Link></p>}
    </section>
  );
}

/** Jogo ao vivo (RZ-130): o jogo do teu clube minuto a minuto, com pausa e velocidade. */
export default function PaginaJogo() {
  return <Suspense fallback={null}><Conteudo /></Suspense>;
}
