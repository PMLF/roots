"use client";
import { useRoundName } from "@/ui/components/competition/CupRounds";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import type { LiveMatch } from "@/engine/season/liveMatch";
import { EntityLink } from "@/ui/components/Link";
import { LiveTable, ResultLine } from "@/ui/components/match/MatchPanel";
import { scorerAt } from "@/ui/match/matchView";
import { useT } from "@/ui/i18n/LocaleProvider";
import { useOwnClub } from "@/ui/myClub";
import { useEngine } from "@/ui/EngineProvider";

function Content() {
  const { t } = useT();
  const roundName = useRoundName();
  const engine = useEngine();
  const [mine] = useOwnClub();
  const id = useSearchParams().get("id") ?? undefined;
  const [match, setMatch] = useState<LiveMatch | null | undefined>(undefined);
  useEffect(() => {
    if (!engine) return;
    let live = true;
    engine.call("liveMatch", id ? { id } : {}).then((j) => live && setMatch(j)).catch(() => live && setMatch(null));
    return () => { live = false; };
  }, [engine, id]);

  if (match === undefined) return <p>{t("profile.loading")}</p>;
  if (match === null) return <p className="vazio">{t("match.noMatch")} <Link href="/">{t("match.back")}</Link></p>;
  const hasTable = match.table.length > 0;
  const own = { id: match.id, home: match.home, away: match.away, a: match.homeGoals, b: match.awayGoals, ...(match.summary?.shootout ? { shootout: { home: match.summary.shootout.home, away: match.summary.shootout.away } } : {}), ...(match.summary?.extraTime ? { extraTime: true } : {}) };
  const rows = [own, ...match.others.map((o) => { const [a, b] = scorerAt(o.goals, o.duration); return { id: o.id, home: o.home, away: o.away, a, b, ...(o.extraTime ? { extraTime: true } : {}), ...(o.shootout ? { shootout: o.shootout } : {}) }; })];
  const stage = match.cupRound ? roundName(match.cupRound) : t(hasTable ? "match.round" : "results.cupRound", { n: match.round });
  return (
    <section className="pagina-resultados">
      <header className="resultados-topo">
        <div>
          <h1>{t(hasTable ? "results.titleRound" : "results.titleStage")}</h1>
          <p className="suave"><EntityLink k="competition" id={match.competition}>{match.competition}</EntityLink> · {stage} · {match.date}</p>
        </div>
      </header>
      <div className={`resultados-grelha${hasTable ? "" : " sem-tabela"}`}>
        <section className="painel" aria-labelledby="h-res">
          <h2 id="h-res">{t("results.scores")}</h2>
          <ul className="outros-jogos">
            {rows.map((o) => (
              <ResultLine key={o.id} match={match} home={o.home} away={o.away} score={`${o.a}–${o.b}`} {...(mine ? { mine } : {})} {...(o.extraTime ? { extraTime: true } : {})} {...(o.shootout ? { shootout: o.shootout } : {})} />
            ))}
          </ul>
        </section>
        {hasTable && <LiveTable match={match} mine={mine ?? undefined} />}
      </div>
    </section>
  );
}

/** Depois de um jogo do gamer: resultados da jornada (ou ronda) à esquerda e, nas ligas, a classificação à direita. */
export default function ResultsPage() {
  return <Suspense fallback={null}><Content /></Suspense>;
}
