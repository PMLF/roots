"use client";
import { useState } from "react";
import type { CompetitionPage } from "@/engine/api/contracts";
import { Card } from "@/ui/components/Card";
import { EntityLink } from "@/ui/components/Link";
import { useT } from "@/ui/i18n/LocaleProvider";

type Round = CompetitionPage["rounds"][number];

function state(r: Round): "played" | "live" | "upcoming" {
  const played = r.matches.filter((m) => m.homeGoals !== undefined).length;
  return played === 0 ? "upcoming" : played === r.matches.length ? "played" : "live";
}

/**
 * Duas jornadas lado a lado — a última jogada (ou a atual, se estiver a meio) e a seguinte — com paginação.
 * A página mostrada fica em `round` no URL (sem nova entrada no histórico).
 */
export function Rounds({ page }: { page: CompetitionPage }) {
  const { t } = useT();
  const total = page.rounds.length;
  const last = Math.max(1, total - 1);
  const [left, setLeft] = useState(() => {
    const doUrl = Number(new URLSearchParams(typeof window === "undefined" ? "" : window.location.search).get("round"));
    return Math.min(last, Math.max(1, Number.isFinite(doUrl) && doUrl > 0 ? doUrl : page.currentRound || 1));
  });
  const go = (n: number) => {
    const v = Math.min(last, Math.max(1, n));
    setLeft(v);
    const url = new URL(window.location.href);
    url.searchParams.set("round", String(v));
    window.history.replaceState(window.history.state, "", url);
  };
  const shown = page.rounds.filter((r) => r.number === left || r.number === left + 1);
  if (total === 0) return null;
  return (
    <section aria-label={t("rounds.title")} className="jornadas">
      <div className="jornadas-barra">
        <h2>{t("rounds.title")}</h2>
        <span className="suave">{t("rounds.de", { n: left, total })}</span>
        <span className="espaco" />
        <button type="button" onClick={() => go(left - 1)} disabled={left <= 1} aria-label={t("rounds.previous")}>‹ {t("rounds.previous")}</button>
        <button type="button" onClick={() => go(left + 1)} disabled={left >= last} aria-label={t("rounds.next")}>{t("rounds.next")} ›</button>
      </div>
      <div className="jornadas-par">
        {shown.map((r) => (
          <Card key={r.number} title={`${t("competition.round", { n: r.number })} · ${r.date}`}>
            <p className="suave estado-jornada">{t(`rounds.state.${state(r)}` as "rounds.state.played")}</p>
            <ul className="jogos-lista">
              {r.matches.map((g) => (
                <li key={g.id}>
                  <EntityLink k="club" id={g.home}>{g.homeName}</EntityLink>
                  <b className="resultado">{g.homeGoals !== undefined ? `${g.homeGoals} – ${g.awayGoals}` : "–"}</b>
                  <EntityLink k="club" id={g.away}>{g.awayName}</EntityLink>
                </li>
              ))}
            </ul>
            {r.bye && <p className="suave">{t("competition.bye", { club: r.bye })}</p>}
          </Card>
        ))}
      </div>
    </section>
  );
}
