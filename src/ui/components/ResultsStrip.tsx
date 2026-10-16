"use client";
import Link from "next/link";
import type React from "react";
import type { DayMatch } from "@/engine/season/advance";
import { useT } from "@/ui/i18n/LocaleProvider";

/** Marcadores de um jogo: «Silva 12', Costa 55'». Só golos: cartões e lesões não entram na fita. */
const scorers = (j: DayMatch) => j.goals.map((g) => `${g.name} ${Math.floor(g.minute)}'`).join(", ");

/**
 * Fita de resultados (RZ-166): corre sem parar no rodapé da página inicial com os resultados e os marcadores do último
 * avanço. Pára com o rato por cima ou com o foco; com «reduzir movimento» fica estática e rola-se à mão. Sem resultados, não aparece.
 */
export function ResultsFita({ matches }: { matches: DayMatch[] }) {
  const { t } = useT();
  if (matches.length === 0) return null;
  const items = (copy: number) =>
    matches.map((j) => {
      const text = (
        <>
          <b>{j.homeName} {j.homeGoals}–{j.awayGoals} {j.awayName}</b>
          {j.goals.length > 0 && <span className="suave"> ({scorers(j)})</span>}
        </>
      );
      return (
        <li key={`${copy}-${j.id}`} aria-hidden={copy > 0 || undefined}>
          {j.level === 0 ? <Link href={`/match/?id=${encodeURIComponent(j.id)}`} tabIndex={copy > 0 ? -1 : undefined}>{text}</Link> : text}
        </li>
      );
    });
  // velocidade constante (cerca de 7 caracteres por segundo) seja qual for o número de jogos
  const characters = matches.reduce((s, j) => s + j.homeName.length + j.awayName.length + scorers(j).length + 12, 0);
  // repete-se o conjunto até encher bem o dobro de um ecrã largo, para a fita nunca ter buracos (cerca de 7 px por caractere)
  const groups = Math.max(2, Math.ceil(2200 / Math.max(1, characters * 7)));
  return (
    <section className="fita" aria-label={t("start.results")}>
      <span className="fita-rotulo">{t("start.results")}</span>
      <div className="fita-janela">
        <ul className="fita-pista" style={{ animationDuration: `${Math.max(20, Math.round(characters / 7))}s`, "--grupos": groups } as React.CSSProperties}>
          {Array.from({ length: groups }, (_, i) => items(i))}
        </ul>
      </div>
    </section>
  );
}
