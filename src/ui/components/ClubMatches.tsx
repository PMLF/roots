"use client";
import { useMemo } from "react";
import { Card } from "@/ui/components/Card";
import { EntityLink } from "@/ui/components/Link";
import { Table } from "@/ui/components/Table";
import type { Key } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";
import { useEngineLoad } from "@/ui/useEngineLoad";
import { clubCupMatches, clubMatches, type MatchLine as Line } from "@/ui/clubMatches";
import { useRoundName } from "@/ui/components/competition/CupRounds";
import type { Column } from "@/ui/table/logic";

/** Calendário e resultados de um clube na sua liga; usado na página Jogos e no separador Jogos da ficha do clube. */
export function ClubMatches({ club, league }: { club: string; league?: string }) {
  const { t } = useT();
  const page = useEngineLoad(async (engine) => {
    const name = league ?? (await engine.call("clubProfile", { id: club }))?.league;
    return name ? engine.call("competitionPage", { league: name }) : null;
  }, [club, league]);
  const roundName = useRoundName();
  // as taças em que o clube joga entram no mesmo calendário, com o nome da ronda em vez da jornada
  const cups = useEngineLoad(async (engine) => {
    const own = (await engine.call("clubCompetitions", { club })).filter((c) => c.kind === "cup");
    const views = await Promise.all(own.map((c) => engine.call("cupView", { competition: c.competition })));
    return views.flatMap((v) => (v ? [v] : []));
  }, [club]);
  const lines = useMemo(() => [...(page ? clubMatches(page, club) : []), ...(cups ?? []).flatMap((c) => clubCupMatches(c, club))], [page, cups, club]);
  const columns: Column<Line>[] = [
    { id: "round", title: t("matches.round"), value: (l) => l.date + String(l.round).padStart(4, "0"), numeric: false },
    { id: "competition", title: t("stat.competition"), value: (l) => l.competition },
    { id: "date", title: t("matches.date"), value: (l) => l.date },
    { id: "venue", title: t("matches.local"), value: (l) => (l.bye ? "" : l.home ? t("matches.home") : t("matches.away")) },
    { id: "opponent", title: t("matches.opponent"), value: (l) => (l.bye ? t("matches.bye") : l.opponentName) },
    { id: "result", title: t("matches.outcome"), value: (l) => l.result },
  ];
  if (page === undefined) return <p>{t("profile.loading")}</p>;
  if (page === null) return <p className="erro">{t("profile.notFound")}</p>;
  return (
    <>
      {page.preview && <p className="aviso-previa">{t("competition.preview")}</p>}
      <Card wide>
        <Table
          id="jogos-clube" columns={columns} lines={lines} rowKey={(l) => l.id}
          initialOrder={{ column: "date", direction: "asc" }}
          cell={{ round: (l) => (l.cupRound ? roundName(l.cupRound) : l.round), opponent: (l) => (l.bye ? t("matches.bye") : <EntityLink k="club" id={l.opponent}>{l.opponentName}</EntityLink>), competition: (l) => <EntityLink k="competition" id={l.competition}>{l.competition}</EntityLink>, result: (l) => (l.result ? <span className="resultado-jogo"><i className={`bola-resultado res-${l.outcome}`} aria-hidden="true" />{l.result}<span className="so-leitor"> {t(`matches.outcome.${l.outcome}` as Key)}</span></span> : "—") }}
        />
      </Card>
    </>
  );
}
