"use client";
import Link from "next/link";
import type React from "react";
import type { JogoDoDia } from "@/engine/epoca/avancar";
import { useT } from "@/ui/i18n/LocaleProvider";

/** Marcadores de um jogo: «Silva 12', Costa 55'». Só golos: cartões e lesões não entram na fita. */
const marcadores = (j: JogoDoDia) => j.golos.map((g) => `${g.nome} ${Math.floor(g.minuto)}'`).join(", ");

/**
 * Fita de resultados (RZ-166): corre sem parar no rodapé da página inicial com os resultados e os marcadores do último
 * avanço. Pára com o rato por cima ou com o foco; com «reduzir movimento» fica estática e rola-se à mão. Sem resultados, não aparece.
 */
export function FitaResultados({ jogos }: { jogos: JogoDoDia[] }) {
  const { t } = useT();
  if (jogos.length === 0) return null;
  const itens = (copia: number) =>
    jogos.map((j) => {
      const texto = (
        <>
          <b>{j.casaNome} {j.golosCasa}–{j.golosFora} {j.foraNome}</b>
          {j.golos.length > 0 && <span className="suave"> ({marcadores(j)})</span>}
        </>
      );
      return (
        <li key={`${copia}-${j.id}`} aria-hidden={copia > 0 || undefined}>
          {j.nivel === 0 ? <Link href={`/match/?id=${encodeURIComponent(j.id)}`} tabIndex={copia > 0 ? -1 : undefined}>{texto}</Link> : texto}
        </li>
      );
    });
  // velocidade constante (cerca de 7 caracteres por segundo) seja qual for o número de jogos
  const caracteres = jogos.reduce((s, j) => s + j.casaNome.length + j.foraNome.length + marcadores(j).length + 12, 0);
  // repete-se o conjunto até encher bem o dobro de um ecrã largo, para a fita nunca ter buracos (cerca de 7 px por caractere)
  const grupos = Math.max(2, Math.ceil(2200 / Math.max(1, caracteres * 7)));
  return (
    <section className="fita" aria-label={t("inicio.resultados")}>
      <span className="fita-rotulo">{t("inicio.resultados")}</span>
      <div className="fita-janela">
        <ul className="fita-pista" style={{ animationDuration: `${Math.max(20, Math.round(caracteres / 7))}s`, "--grupos": grupos } as React.CSSProperties}>
          {Array.from({ length: grupos }, (_, i) => itens(i))}
        </ul>
      </div>
    </section>
  );
}
