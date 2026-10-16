"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import type { CompetitionPage } from "@/engine/api/contracts";
import { Card } from "@/ui/components/Card";
import { WithClub } from "@/ui/components/WithClub";
import { EntityLink } from "@/ui/components/Link";
import { Table } from "@/ui/components/Table";
import { useT } from "@/ui/i18n/LocaleProvider";
import { useEngine } from "@/ui/EngineProvider";
import { clubMatches, type MatchLine as Line } from "@/ui/clubMatches";
import type { Column } from "@/ui/table/logic";

function Content({ club }: { club: string }) {
  const engine = useEngine();
  const { t } = useT();
  const [page, setPage] = useState<CompetitionPage | null | undefined>(undefined);
  useEffect(() => {
    if (!engine) return;
    let live = true;
    (async () => {
      const c = await engine.call("clubProfile", { id: club });
      const p = c ? await engine.call("competitionPage", { league: c.league }) : null;
      if (live) setPage(p);
    })().catch(() => live && setPage(null));
    return () => { live = false; };
  }, [engine, club]);
  const lines = useMemo(() => (page ? clubMatches(page, club) : []), [page, club]);
  const columns: Column<Line>[] = [
    { id: "round", title: t("matches.round"), value: (l) => l.round, numeric: true },
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
      <Card title={<EntityLink k="competition" id={page.league}>{page.league}</EntityLink>} wide>
        <Table
          id="jogos-clube" fileName={`fixtures-${club}`} columns={columns} lines={lines} rowKey={(l) => l.id}
          initialOrder={{ column: "round", direction: "asc" }}
          cell={{ opponent: (l) => (l.bye ? t("matches.bye") : <EntityLink k="club" id={l.opponent}>{l.opponentName}</EntityLink>), result: (l) => l.result || "—" }}
        />
      </Card>
    </>
  );
}

/** Jogos (RZ-145): calendário e resultados do clube do gamer (relatório de um jogo chega com o ciclo de dias). */
export default function MatchesPage() {
  const { t } = useT();
  return <Suspense fallback={null}><WithClub title={t("menu.matches")}>{(c) => <Content club={c} />}</WithClub></Suspense>;
}
