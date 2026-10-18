"use client";
import { useEffect, useMemo, useState } from "react";
import type { CompetitionPage } from "@/engine/api/contracts";
import { Card } from "@/ui/components/Card";
import { EntityLink } from "@/ui/components/Link";
import { Table } from "@/ui/components/Table";
import type { Key } from "@/ui/i18n";
import { useT } from "@/ui/i18n/LocaleProvider";
import { useEngine } from "@/ui/EngineProvider";
import { clubMatches, type MatchLine as Line } from "@/ui/clubMatches";
import type { Column } from "@/ui/table/logic";

/** Calendário e resultados de um clube na sua liga; usado na página Jogos e no separador Jogos da ficha do clube. */
export function ClubMatches({ club, league }: { club: string; league?: string }) {
  const engine = useEngine();
  const { t } = useT();
  const [page, setPage] = useState<CompetitionPage | null | undefined>(undefined);
  useEffect(() => {
    if (!engine) return;
    let live = true;
    (async () => {
      const name = league ?? (await engine.call("clubProfile", { id: club }))?.league;
      const p = name ? await engine.call("competitionPage", { league: name }) : null;
      if (live) setPage(p);
    })().catch(() => live && setPage(null));
    return () => { live = false; };
  }, [engine, club, league]);
  const lines = useMemo(() => (page ? clubMatches(page, club) : []), [page, club]);
  const columns: Column<Line>[] = [
    { id: "round", title: t("matches.round"), value: (l) => l.round, numeric: true },
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
          initialOrder={{ column: "round", direction: "asc" }}
          cell={{ opponent: (l) => (l.bye ? t("matches.bye") : <EntityLink k="club" id={l.opponent}>{l.opponentName}</EntityLink>), competition: (l) => <EntityLink k="competition" id={l.competition}>{l.competition}</EntityLink>, result: (l) => (l.result ? <span className="resultado-jogo"><i className={`bola-resultado res-${l.outcome}`} aria-hidden="true" />{l.result}<span className="so-leitor"> {t(`matches.outcome.${l.outcome}` as Key)}</span></span> : "—") }}
        />
      </Card>
    </>
  );
}
