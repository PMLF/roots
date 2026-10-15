"use client";
import { useState } from "react";
import type { CompetitionPage } from "@/engine/api/contratos";
import { Cartao } from "@/ui/components/Cartao";
import { Ligacao } from "@/ui/components/Ligacao";
import { useT } from "@/ui/i18n/LocaleProvider";

type Round = CompetitionPage["rounds"][number];

function estado(r: Round): "played" | "live" | "upcoming" {
  const jogados = r.matches.filter((m) => m.homeGoals !== undefined).length;
  return jogados === 0 ? "upcoming" : jogados === r.matches.length ? "played" : "live";
}

/**
 * Duas jornadas lado a lado — a última jogada (ou a atual, se estiver a meio) e a seguinte — com paginação.
 * A página mostrada fica em `round` no URL (sem nova entrada no histórico).
 */
export function Jornadas({ page }: { page: CompetitionPage }) {
  const { t } = useT();
  const total = page.rounds.length;
  const ultima = Math.max(1, total - 1);
  const [esquerda, setEsquerda] = useState(() => {
    const doUrl = Number(new URLSearchParams(typeof window === "undefined" ? "" : window.location.search).get("round"));
    return Math.min(ultima, Math.max(1, Number.isFinite(doUrl) && doUrl > 0 ? doUrl : page.currentRound || 1));
  });
  const ir = (n: number) => {
    const v = Math.min(ultima, Math.max(1, n));
    setEsquerda(v);
    const url = new URL(window.location.href);
    url.searchParams.set("round", String(v));
    window.history.replaceState(window.history.state, "", url);
  };
  const mostradas = page.rounds.filter((r) => r.number === esquerda || r.number === esquerda + 1);
  if (total === 0) return null;
  return (
    <section aria-label={t("jornadas.titulo")} className="jornadas">
      <div className="jornadas-barra">
        <h2>{t("jornadas.titulo")}</h2>
        <span className="suave">{t("jornadas.de", { n: esquerda, total })}</span>
        <span className="espaco" />
        <button type="button" onClick={() => ir(esquerda - 1)} disabled={esquerda <= 1} aria-label={t("jornadas.anterior")}>‹ {t("jornadas.anterior")}</button>
        <button type="button" onClick={() => ir(esquerda + 1)} disabled={esquerda >= ultima} aria-label={t("jornadas.seguinte")}>{t("jornadas.seguinte")} ›</button>
      </div>
      <div className="cartoes jornadas-par">
        {mostradas.map((r) => (
          <Cartao key={r.number} titulo={`${t("competicao.jornada", { n: r.number })} · ${r.date}`}>
            <p className="suave estado-jornada">{t(`jornadas.estado.${estado(r)}` as "jornadas.estado.played")}</p>
            <ul className="jogos-lista">
              {r.matches.map((g) => (
                <li key={g.id}>
                  <Ligacao k="clube" id={g.home}>{g.homeName}</Ligacao>
                  <b className="resultado">{g.homeGoals !== undefined ? `${g.homeGoals} – ${g.awayGoals}` : "–"}</b>
                  <Ligacao k="clube" id={g.away}>{g.awayName}</Ligacao>
                </li>
              ))}
            </ul>
            {r.bye && <p className="suave">{t("competicao.folga", { clube: r.bye })}</p>}
          </Cartao>
        ))}
      </div>
    </section>
  );
}
