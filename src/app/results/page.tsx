"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import type { LiveMatch } from "@/engine/season/liveMatch";
import { ClubSwatch } from "@/ui/components/ClubSwatch";
import { EntityLink } from "@/ui/components/Link";
import { LiveTable } from "@/ui/components/match/MatchPanel";
import { scorerAt } from "@/ui/match/matchView";
import { useT } from "@/ui/i18n/LocaleProvider";
import { useOwnClub } from "@/ui/myClub";
import { useEngine } from "@/ui/EngineProvider";

function Content() {
  const { t } = useT();
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
  const own = { id: match.id, home: match.home, away: match.away, a: match.homeGoals, b: match.awayGoals };
  const rows = [own, ...match.others.map((o) => { const [a, b] = scorerAt(o.goals, o.duration); return { id: o.id, home: o.home, away: o.away, a, b }; })];
  const stage = t(hasTable ? "match.round" : "results.cupRound", { n: match.round });
  return (
    <section className="pagina-resultados">
      <header>
        <h1>{t(hasTable ? "results.titleRound" : "results.titleStage")}</h1>
        <p className="suave"><EntityLink k="competition" id={match.competition}>{match.competition}</EntityLink> · {stage} · {match.date}</p>
      </header>
      <div className={`resultados-grelha${hasTable ? "" : " sem-tabela"}`}>
        <section className="painel" aria-labelledby="h-res">
          <h2 id="h-res">{t("results.scores")}</h2>
          <ul className="outros-jogos">
            {rows.map((o) => (
              <li key={o.id} className={o.home.id === mine || o.away.id === mine ? "meu-jogo" : undefined}>
                <ClubSwatch colours={match.colours?.[o.home.id]} className="amostra-esq" />
                <span className={`nome-clube nome-casa${o.home.id === mine ? " meu-clube" : ""}`}><EntityLink k="club" id={o.home.id} withoutSwatch>{o.home.name}</EntityLink></span>
                <b className="marcador-pequeno">{o.a}–{o.b}</b>
                <span className={`nome-clube nome-fora${o.away.id === mine ? " meu-clube" : ""}`}><EntityLink k="club" id={o.away.id} withoutSwatch>{o.away.name}</EntityLink></span>
                <ClubSwatch colours={match.colours?.[o.away.id]} className="amostra-dir" />
              </li>
            ))}
          </ul>
        </section>
        {hasTable && <LiveTable match={match} mine={mine ?? undefined} />}
      </div>
      <p className="acoes">
        <Link href="/" className="primario">{t("results.continue")}</Link>
        <Link href={`/match/?id=${encodeURIComponent(match.id)}`}>{t("results.seeMatch")}</Link>
      </p>
    </section>
  );
}

/** Depois de um jogo do gamer: resultados da jornada (ou ronda) à esquerda e, nas ligas, a classificação à direita. */
export default function ResultsPage() {
  return <Suspense fallback={null}><Content /></Suspense>;
}
