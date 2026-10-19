"use client";
import { useEffect, useState } from "react";
import type { CompetitionPage, RecentMatch } from "@/engine/api/contracts";
import { ClubSwatch } from "@/ui/components/ClubSwatch";
import { EntityLink } from "@/ui/components/Link";
import type { Key } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";
import { useEngine } from "@/ui/EngineProvider";

const SHORT: Record<RecentMatch["short"], Key> = {
  firstLeague: "tier.short.firstLeague", secondLeague: "tier.short.secondLeague", thirdLeague: "tier.short.thirdLeague", cp: "tier.short.cp", district: "tier.short.district",
  cup: "comp.short.cup", districtCup: "comp.short.districtCup", supercup: "comp.short.supercup", districtSupercup: "comp.short.districtSupercup", promotion: "comp.short.promotion",
};

/** A posição do clube na liga: ele, os dois de cima e os dois de baixo. */
export function MiniTable({ league, club }: { league: CompetitionPage; club: string }) {
  const { t } = useT();
  const rows = league.table;
  const i = rows.findIndex((r) => r.club === club);
  if (i < 0) return null;
  const from = Math.max(0, Math.min(i - 2, rows.length - 5));
  const shown = rows.slice(from, from + 5);
  return (
    <section className="painel" aria-labelledby="i-posicao">
      <h2 id="i-posicao"><EntityLink k="competition" id={league.league}>{league.league}</EntityLink></h2>
      <table className="mini-tabela">
        <thead><tr><th>#</th><th>{t("lab.col.club")}</th><th title={t("season.matches")}>J</th><th title={t("season.points")}>P</th></tr></thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.club} className={r.club === club ? "meu-clube" : undefined}>
              <td>{r.position}</td>
              <td className="nome-clube"><ClubSwatch id={r.club} /><EntityLink k="club" id={r.club} withoutSwatch>{r.name}</EntityLink></td>
              <td>{r.played}</td>
              <td><b>{r.points}</b></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** Os últimos três jogos do clube, em qualquer competição. */
export function LastMatches({ club, today }: { club: string; today?: string }) {
  const { t } = useT();
  const engine = useEngine();
  const [list, setList] = useState<RecentMatch[]>([]);
  useEffect(() => {
    if (!engine) return;
    let live = true;
    engine.call("recentMatches", { club, limit: 3 }).then((x) => live && setList(x)).catch(() => undefined);
    return () => { live = false; };
  }, [engine, club, today]);
  return (
    <section className="painel" aria-labelledby="i-ultimos">
      <h2 id="i-ultimos">{t("home.lastMatches")}</h2>
      {list.length === 0 ? <p className="vazio">{t("home.noMatches")}</p> : (
        <ul className="ultimos-jogos">
          {list.map((m) => (
            <li key={m.id}>
              <span className={`resultado-ponto ${m.outcome}`} role="img" aria-label={t(`home.outcome.${m.outcome}` as Key)} />
              <span className="nome-clube"><ClubSwatch id={m.opponent} /><EntityLink k="club" id={m.opponent} withoutSwatch>{m.opponentName}</EntityLink></span>
              <small className="suave" title={t(m.atHome ? "home.atHome" : "home.away")}>{t(m.atHome ? "home.homeShort" : "home.awayShort")}</small>
              <b>{m.goalsFor}–{m.goalsAgainst}{m.shootout && <small className="marcador-nota">{t("results.pens", { a: m.shootout.for, b: m.shootout.against })}</small>}{!m.shootout && m.extraTime && <small className="marcador-nota">{t("results.afterExtra")}</small>}</b>
              <small className="escalao-etiqueta">{t(SHORT[m.short])}</small>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
